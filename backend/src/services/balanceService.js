/**
 * Balance Service
 * Computes net balances per user from expenses and settlements.
 * Implements debt simplification (minimize transactions).
 * Every balance entry is traceable to source expense/settlement IDs.
 */

const prisma = require('../config/database');
const { convertToINR } = require('./currencyService');

/**
 * Fetch all balance-relevant data for a group.
 */
async function fetchGroupBalanceData(groupId) {
  // Active (non-deleted, non-settlement) expenses with splits
  const expenses = await prisma.expense.findMany({
    where: { groupId, deletedAt: null, isSettlement: false },
    include: {
      splits: true,
      paidBy: { select: { id: true, displayName: true } },
    },
  });

  // Settlements
  const settlements = await prisma.settlement.findMany({
    where: { groupId },
    include: {
      fromUser: { select: { id: true, displayName: true } },
      toUser: { select: { id: true, displayName: true } },
    },
  });

  // Current active members
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: { select: { id: true, displayName: true, username: true } } },
  });

  return { expenses, settlements, members };
}

/**
 * Compute net balance map: userId → net amount in INR.
 * Positive = others owe this person.
 * Negative = this person owes others.
 *
 * Returns both summary and per-expense trace.
 */
function computeNetBalances(expenses, settlements) {
  // Map: userId → { balance: number, traces: [{expenseId, description, amount, role}] }
  const balanceMap = {};
  const traceMap = {};

  const ensureUser = (userId, displayName) => {
    if (!balanceMap[userId]) {
      balanceMap[userId] = 0;
      traceMap[userId] = [];
    }
    if (displayName && !traceMap[userId].displayName) {
      traceMap[userId].displayName = displayName;
    }
  };

  // Process expenses
  for (const expense of expenses) {
    const paidById = expense.paidById;
    const paidByName = expense.paidBy?.displayName || expense.paidByName || 'Unknown';

    // Amount paid in INR (for balance calculations, we use INR for uniformity)
    let paidAmountInr;
    if (expense.amountInr != null) {
      paidAmountInr = parseFloat(expense.amountInr);
    } else {
      const { amountInr } = convertToINR(parseFloat(expense.amount), expense.currency);
      paidAmountInr = amountInr;
    }

    // Payer gets credit
    if (paidById) {
      ensureUser(paidById, paidByName);
      balanceMap[paidById] += paidAmountInr;
      traceMap[paidById].push({
        expenseId: expense.id,
        description: expense.description,
        date: expense.expenseDate,
        role: 'paid',
        amount: paidAmountInr,
        currency: 'INR',
      });
    }

    // Each split participant gets debited their share
    for (const split of expense.splits) {
      const splitUserId = split.userId;
      const splitUserName = split.userName || 'Unknown';
      let splitAmountInr;

      if (split.amountInr != null) {
        splitAmountInr = parseFloat(split.amountInr);
      } else {
        const { amountInr } = convertToINR(parseFloat(split.amount), split.currency);
        splitAmountInr = amountInr;
      }

      if (splitUserId) {
        ensureUser(splitUserId, splitUserName);
        balanceMap[splitUserId] -= splitAmountInr;
        traceMap[splitUserId].push({
          expenseId: expense.id,
          description: expense.description,
          date: expense.expenseDate,
          role: 'owes',
          amount: -splitAmountInr,
          currency: 'INR',
        });
      }
    }
  }

  // Process settlements
  for (const settlement of settlements) {
    let amountInr;
    if (settlement.amountInr != null) {
      amountInr = parseFloat(settlement.amountInr);
    } else {
      const { amountInr: converted } = convertToINR(parseFloat(settlement.amount), settlement.currency);
      amountInr = converted;
    }

    const fromId = settlement.fromUserId;
    const toId = settlement.toUserId;
    const fromName = settlement.fromUser?.displayName;
    const toName = settlement.toUser?.displayName;

    ensureUser(fromId, fromName);
    ensureUser(toId, toName);

    // fromUser paid toUser — fromUser's debt decreases (credit), toUser's credit decreases (debit)
    balanceMap[fromId] += amountInr;
    traceMap[fromId].push({
      settlementId: settlement.id,
      description: `Settlement to ${toName}`,
      date: settlement.settledAt,
      role: 'settlement_paid',
      amount: amountInr,
      currency: 'INR',
    });

    balanceMap[toId] -= amountInr;
    traceMap[toId].push({
      settlementId: settlement.id,
      description: `Settlement from ${fromName}`,
      date: settlement.settledAt,
      role: 'settlement_received',
      amount: -amountInr,
      currency: 'INR',
    });
  }

  return { balanceMap, traceMap };
}

/**
 * Debt simplification algorithm.
 * Input: { userId: netBalance } where positive = owed money, negative = owes money
 * Output: minimal list of transactions { from, to, amount }
 */
function simplifyDebts(balanceMap) {
  // Filter out near-zero balances (floating point tolerance)
  const EPSILON = 0.01;
  const entries = Object.entries(balanceMap)
    .filter(([, bal]) => Math.abs(bal) > EPSILON)
    .map(([userId, balance]) => ({ userId, balance: Math.round(balance * 100) / 100 }));

  const creditors = entries.filter((e) => e.balance > 0).sort((a, b) => b.balance - a.balance);
  const debtors = entries.filter((e) => e.balance < 0).sort((a, b) => a.balance - b.balance);

  const transactions = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const credit = creditors[ci];
    const debit = debtors[di];
    const amount = Math.min(credit.balance, Math.abs(debit.balance));
    const roundedAmount = Math.round(amount * 100) / 100;

    if (roundedAmount > EPSILON) {
      transactions.push({
        fromUserId: debit.userId,
        toUserId: credit.userId,
        amount: roundedAmount,
        currency: 'INR',
      });
    }

    credit.balance = Math.round((credit.balance - amount) * 100) / 100;
    debit.balance = Math.round((debit.balance + amount) * 100) / 100;

    if (Math.abs(credit.balance) <= EPSILON) ci++;
    if (Math.abs(debit.balance) <= EPSILON) di++;
  }

  return transactions;
}

/**
 * Main function: compute full group balances.
 * Returns:
 *  - memberBalances: per-user net balance with trace
 *  - simplifiedDebts: minimal who-owes-whom list
 *  - totalExpenses: sum of all expenses
 */
async function computeGroupBalances(groupId) {
  const { expenses, settlements, members } = await fetchGroupBalanceData(groupId);

  const { balanceMap, traceMap } = computeNetBalances(expenses, settlements);

  // Enrich member data
  const memberBalances = members.map((m) => {
    const userId = m.userId;
    const balance = balanceMap[userId] || 0;
    return {
      userId,
      displayName: m.user.displayName,
      username: m.user.username,
      netBalance: Math.round(balance * 100) / 100,
      currency: 'INR',
      isActive: m.leftAt == null,
      joinedAt: m.joinedAt,
      leftAt: m.leftAt,
      traces: traceMap[userId] || [],
    };
  });

  const simplifiedDebts = simplifyDebts(balanceMap);

  // Enrich simplified debts with display names
  const userNameMap = {};
  members.forEach((m) => {
    userNameMap[m.userId] = m.user.displayName;
  });
  // Also include any non-members that appear in balance map (e.g. guests)
  Object.keys(balanceMap).forEach((uid) => {
    if (!userNameMap[uid]) userNameMap[uid] = uid;
  });

  const enrichedDebts = simplifiedDebts.map((d) => ({
    ...d,
    fromDisplayName: userNameMap[d.fromUserId] || d.fromUserId,
    toDisplayName: userNameMap[d.toUserId] || d.toUserId,
  }));

  const totalExpenseAmountInr = expenses.reduce((sum, e) => {
    if (e.amountInr != null) return sum + parseFloat(e.amountInr);
    const { amountInr } = convertToINR(parseFloat(e.amount), e.currency);
    return sum + amountInr;
  }, 0);

  return {
    groupId,
    memberBalances,
    simplifiedDebts: enrichedDebts,
    totalExpenses: expenses.length,
    totalExpenseAmountInr: Math.round(totalExpenseAmountInr * 100) / 100,
    totalSettlements: settlements.length,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Compute individual balance summary across all groups for a user.
 */
async function computeUserBalances(userId) {
  const groups = await prisma.groupMember.findMany({
    where: { userId },
    include: { group: { select: { id: true, name: true } } },
  });

  const results = [];
  for (const membership of groups) {
    const groupBalances = await computeGroupBalances(membership.groupId);
    const myBalance = groupBalances.memberBalances.find((b) => b.userId === userId);
    results.push({
      groupId: membership.groupId,
      groupName: membership.group.name,
      netBalance: myBalance ? myBalance.netBalance : 0,
      currency: 'INR',
      isActive: membership.leftAt == null,
    });
  }

  const totalOwed = results.filter((r) => r.netBalance > 0).reduce((s, r) => s + r.netBalance, 0);
  const totalOwing = results.filter((r) => r.netBalance < 0).reduce((s, r) => s + r.netBalance, 0);

  return {
    userId,
    groups: results,
    totalOwed: Math.round(totalOwed * 100) / 100,
    totalOwing: Math.round(Math.abs(totalOwing) * 100) / 100,
    currency: 'INR',
  };
}

module.exports = { computeGroupBalances, computeUserBalances, simplifyDebts };
