const express = require('express');
const { body, param, query } = require('express-validator');
const prisma = require('../config/database');
const authMiddleware = require('../middleware/auth');
const validate = require('../middleware/validate');
const { calculateSplits } = require('../utils/splitCalculator');
const { convertToINR, normalizeCurrency } = require('../services/currencyService');

const router = express.Router();
router.use(authMiddleware);

const VALID_SPLIT_TYPES = ['EQUAL', 'UNEQUAL', 'PERCENTAGE', 'SHARE'];

// GET /api/groups/:groupId/expenses
router.get(
  '/groups/:groupId/expenses',
  param('groupId').isUUID(),
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const groupId = req.params.groupId;
      await requireGroupMember(groupId, req.user.id, res);

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      const where = {
        groupId,
        deletedAt: null,
        ...(req.query.from && { expenseDate: { gte: new Date(req.query.from) } }),
        ...(req.query.to && { expenseDate: { lte: new Date(req.query.to) } }),
      };

      const [expenses, total] = await Promise.all([
        prisma.expense.findMany({
          where,
          include: {
            splits: { include: { user: { select: { id: true, displayName: true } } } },
            paidBy: { select: { id: true, displayName: true, avatarUrl: true } },
          },
          orderBy: { expenseDate: 'desc' },
          skip,
          take: limit,
        }),
        prisma.expense.count({ where }),
      ]);

      res.json({
        success: true,
        data: expenses,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/expenses/:id
router.get('/expenses/:id', param('id').isUUID(), validate, async (req, res, next) => {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: req.params.id, deletedAt: null },
      include: {
        splits: { include: { user: { select: { id: true, displayName: true } } } },
        paidBy: { select: { id: true, displayName: true, avatarUrl: true } },
        group: { select: { id: true, name: true } },
      },
    });
    if (!expense) return res.status(404).json({ success: false, error: 'Expense not found' });
    await requireGroupMember(expense.groupId, req.user.id, res);
    res.json({ success: true, data: expense });
  } catch (err) {
    next(err);
  }
});

// POST /api/groups/:groupId/expenses
router.post(
  '/groups/:groupId/expenses',
  param('groupId').isUUID(),
  [
    body('description').notEmpty().trim().withMessage('Description required'),
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number'),
    body('currency').isIn(['INR', 'USD']).withMessage('Currency must be INR or USD'),
    body('splitType').isIn(VALID_SPLIT_TYPES).withMessage(`splitType must be one of: ${VALID_SPLIT_TYPES.join(', ')}`),
    body('expenseDate').isISO8601().withMessage('expenseDate must be a valid ISO date'),
    body('splitWith').isArray({ min: 1 }).withMessage('splitWith must be a non-empty array of names'),
    body('splitDetails').optional().isString(),
    body('notes').optional().isString(),
    body('paidByUserId').optional().isUUID(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const groupId = req.params.groupId;
      await requireGroupMember(groupId, req.user.id, res);

      const { description, amount, currency, splitType, expenseDate, splitWith, splitDetails, notes, paidByUserId } = req.body;

      const { amountInr, conversionRate } = convertToINR(parseFloat(amount), currency);

      // Calculate splits
      const { splits, valid, errors } = calculateSplits(splitType, parseFloat(amount), splitWith, splitDetails || '');
      if (!valid) {
        return res.status(400).json({ success: false, error: 'Split calculation error', details: errors });
      }

      // Resolve user IDs for split members
      const members = await prisma.groupMember.findMany({
        where: { groupId },
        include: { user: { select: { id: true, displayName: true, username: true } } },
      });
      const nameToUser = buildNameMap(members);

      const expense = await prisma.expense.create({
        data: {
          groupId,
          paidById: paidByUserId || req.user.id,
          description,
          amount: parseFloat(amount),
          currency,
          amountInr,
          conversionRate,
          splitType,
          expenseDate: new Date(expenseDate),
          notes: notes || null,
          splits: {
            create: splitWith.map((memberName) => {
              const user = nameToUser[memberName.trim().toLowerCase()];
              const splitAmount = splits[memberName] || 0;
              const { amountInr: splitAmountInr } = convertToINR(splitAmount, currency);
              return {
                userId: user ? user.id : null,
                userName: memberName.trim(),
                amount: splitAmount,
                currency,
                amountInr: splitAmountInr,
              };
            }),
          },
        },
        include: {
          splits: { include: { user: { select: { id: true, displayName: true } } } },
          paidBy: { select: { id: true, displayName: true } },
        },
      });

      res.status(201).json({ success: true, data: expense });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/expenses/:id
router.patch(
  '/expenses/:id',
  param('id').isUUID(),
  [
    body('description').optional().notEmpty().trim(),
    body('amount').optional().isFloat({ gt: 0 }),
    body('currency').optional().isIn(['INR', 'USD']),
    body('splitType').optional().isIn(VALID_SPLIT_TYPES),
    body('expenseDate').optional().isISO8601(),
    body('splitWith').optional().isArray({ min: 1 }),
    body('splitDetails').optional().isString(),
    body('notes').optional().isString(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const existing = await prisma.expense.findUnique({ where: { id: req.params.id, deletedAt: null } });
      if (!existing) return res.status(404).json({ success: false, error: 'Expense not found' });
      await requireGroupMember(existing.groupId, req.user.id, res);

      const { description, amount, currency, splitType, expenseDate, splitWith, splitDetails, notes } = req.body;

      const newAmount = amount !== undefined ? parseFloat(amount) : parseFloat(existing.amount);
      const newCurrency = currency || existing.currency;
      const newSplitType = splitType || existing.splitType;

      const { amountInr, conversionRate } = convertToINR(newAmount, newCurrency);

      const updateData = {
        ...(description && { description }),
        amount: newAmount,
        currency: newCurrency,
        amountInr,
        conversionRate,
        splitType: newSplitType,
        ...(expenseDate && { expenseDate: new Date(expenseDate) }),
        ...(notes !== undefined && { notes }),
      };

      // If splits are being updated, recalculate
      if (splitWith) {
        const members = await prisma.groupMember.findMany({
          where: { groupId: existing.groupId },
          include: { user: { select: { id: true, displayName: true, username: true } } },
        });
        const nameToUser = buildNameMap(members);
        const { splits, valid, errors } = calculateSplits(newSplitType, newAmount, splitWith, splitDetails || '');
        if (!valid) return res.status(400).json({ success: false, error: 'Split calculation error', details: errors });

        // Delete old splits and recreate
        await prisma.expenseSplit.deleteMany({ where: { expenseId: req.params.id } });
        updateData.splits = {
          create: splitWith.map((memberName) => {
            const user = nameToUser[memberName.trim().toLowerCase()];
            const splitAmount = splits[memberName] || 0;
            const { amountInr: splitAmountInr } = convertToINR(splitAmount, newCurrency);
            return {
              userId: user ? user.id : null,
              userName: memberName.trim(),
              amount: splitAmount,
              currency: newCurrency,
              amountInr: splitAmountInr,
            };
          }),
        };
      }

      const updated = await prisma.expense.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          splits: { include: { user: { select: { id: true, displayName: true } } } },
          paidBy: { select: { id: true, displayName: true } },
        },
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/expenses/:id — soft delete
router.delete('/expenses/:id', param('id').isUUID(), validate, async (req, res, next) => {
  try {
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Expense not found' });
    await requireGroupMember(existing.groupId, req.user.id, res);

    await prisma.expense.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });
    res.json({ success: true, data: { message: 'Expense deleted' } });
  } catch (err) {
    next(err);
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function requireGroupMember(groupId, userId, res) {
  const m = await prisma.groupMember.findFirst({ where: { groupId, userId } });
  if (!m) {
    res.status(403).json({ success: false, error: 'Not a member of this group' });
    throw new Error('NOT_MEMBER');
  }
  return m;
}

function buildNameMap(members) {
  const map = {};
  for (const m of members) {
    map[m.user.displayName.toLowerCase()] = m.user;
    map[m.user.username.toLowerCase()] = m.user;
  }
  return map;
}

module.exports = router;
