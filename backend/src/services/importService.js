/**
 * Import Service
 * Parses CSV, runs anomaly detection, stages rows for user review.
 * Never silently modifies data. Every anomaly is logged with action taken.
 */

const { parse } = require('csv-parse/sync');
const prisma = require('../config/database');
const { isValidCurrency, normalizeCurrency } = require('./currencyService');
const { parseSplitDetails } = require('../utils/splitCalculator');
const logger = require('../config/logger');

// ─── Constants ──────────────────────────────────────────────────────────────

const KNOWN_MEMBERS = ['aisha', 'rohan', 'priya', 'meera', 'sam', 'dev'];

// Membership windows (inclusive)
const MEMBERSHIP_RULES = [
  { name: 'aisha', joinedAt: new Date('2026-02-01'), leftAt: null },
  { name: 'rohan', joinedAt: new Date('2026-02-01'), leftAt: null },
  { name: 'priya', joinedAt: new Date('2026-02-01'), leftAt: null },
  { name: 'meera', joinedAt: new Date('2026-02-01'), leftAt: new Date('2026-03-31') },
  { name: 'sam',   joinedAt: new Date('2026-04-10'), leftAt: null },
  { name: 'dev',   joinedAt: null, leftAt: null, isGuest: true },
];

const SETTLEMENT_KEYWORDS = [
  'paid back', 'settlement', 'settle', 'transfer', 'repay', 'reimburs',
  'paid aisha', 'paid rohan', 'paid priya', 'paid meera', 'paid sam',
];

const LAST_KNOWN_DATE = new Date('2026-04-30');

// ─── Date Parsing ────────────────────────────────────────────────────────────

/**
 * Attempt to parse a date string in multiple formats.
 * Returns { date: Date|null, format: string|null, ambiguous: boolean, issues: string[] }
 */
function parseDate(rawDate) {
  if (!rawDate || !rawDate.trim()) {
    return { date: null, format: null, ambiguous: false, issues: ['Empty date'] };
  }

  const s = rawDate.trim();
  const issues = [];

  // Format: DD-MM-YYYY
  const ddmmyyyy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const d = parseInt(dd, 10);
    const m = parseInt(mm, 10);
    const y = parseInt(yyyy, 10);

    // Check ambiguity: if both dd<=12 and mm<=12, could be MM-DD-YYYY
    const isAmbiguous = d <= 12 && m <= 12 && d !== m;

    const date = new Date(Date.UTC(y, m - 1, d));
    if (isNaN(date.getTime())) {
      return { date: null, format: null, ambiguous: false, issues: [`Invalid date: ${s}`] };
    }
    return {
      date,
      format: 'DD-MM-YYYY',
      ambiguous: isAmbiguous,
      altInterpretation: isAmbiguous ? new Date(Date.UTC(y, d - 1, m)) : null,
      issues,
    };
  }

  // Format: Mon-DD (e.g. "Mar-14")
  const mondd = s.match(/^([A-Za-z]{3})-(\d{1,2})$/);
  if (mondd) {
    const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    const monthNum = months[mondd[1].toLowerCase()];
    if (monthNum) {
      // Infer year from context — use 2026
      const date = new Date(Date.UTC(2026, monthNum - 1, parseInt(mondd[2], 10)));
      issues.push(`Non-standard date format "Mon-DD" — inferred year 2026`);
      return { date, format: 'Mon-DD', ambiguous: false, issues };
    }
  }

  return { date: null, format: null, ambiguous: false, issues: [`Unrecognized date format: "${s}"`] };
}

// ─── Name Normalization ──────────────────────────────────────────────────────

function normalizeName(name) {
  return (name || '').trim().toLowerCase();
}

/**
 * Find the canonical member name for a given raw name.
 * Returns { canonical: string|null, isKnown: bool, isGuest: bool, variant: bool }
 */
function resolvesMember(rawName) {
  const n = normalizeName(rawName);
  if (!n) return { canonical: null, isKnown: false, isGuest: false, variant: false };

  // Exact match
  const exact = MEMBERSHIP_RULES.find((r) => r.name === n);
  if (exact) return { canonical: exact.name, isKnown: true, isGuest: !!exact.isGuest, variant: false };

  // Prefix match (e.g., "priya s" → "priya")
  const prefix = MEMBERSHIP_RULES.find((r) => n.startsWith(r.name + ' ') || n.startsWith(r.name + '.'));
  if (prefix) return { canonical: prefix.name, isKnown: true, isGuest: !!prefix.isGuest, variant: true };

  // Substring match
  const substr = MEMBERSHIP_RULES.find((r) => n.includes(r.name));
  if (substr) return { canonical: substr.name, isKnown: true, isGuest: !!substr.isGuest, variant: true };

  return { canonical: null, isKnown: false, isGuest: false, variant: false };
}

/**
 * Check if a member was active on a given date.
 */
function wasMemberActiveOn(memberName, date) {
  const rule = MEMBERSHIP_RULES.find((r) => r.name === normalizeName(memberName));
  if (!rule) return { active: false, reason: `"${memberName}" is not a known member` };
  if (rule.isGuest) return { active: true, isGuest: true, reason: `${memberName} is a guest member` };
  if (rule.joinedAt && date < rule.joinedAt) {
    return { active: false, reason: `${memberName} had not joined yet on ${date.toISOString().split('T')[0]} (joined ${rule.joinedAt.toISOString().split('T')[0]})` };
  }
  if (rule.leftAt && date > rule.leftAt) {
    return { active: false, reason: `${memberName} had already left on ${date.toISOString().split('T')[0]} (left ${rule.leftAt.toISOString().split('T')[0]})` };
  }
  return { active: true };
}

// ─── Amount Parsing ──────────────────────────────────────────────────────────

function parseAmount(raw) {
  if (raw === undefined || raw === null || raw === '') return { value: null, hasComma: false };
  const s = String(raw).trim();
  const hasComma = s.includes(',');
  const cleaned = s.replace(/,/g, '');
  const value = parseFloat(cleaned);
  return { value: isNaN(value) ? null : value, hasComma };
}

// ─── Main Anomaly Detector ───────────────────────────────────────────────────

/**
 * Run all anomaly checks on a single row.
 * @returns {Array} list of anomaly objects
 */
function detectRowAnomalies(row, rowNumber, allRows) {
  const anomalies = [];

  const addAnomaly = (type, severity, description, suggestion) => {
    anomalies.push({ rowNumber, rowData: row, anomalyType: type, severity, description, suggestion });
  };

  // ── 1. COMMA_FORMATTED_AMOUNT ──────────────────────────────────────────────
  const { value: amount, hasComma } = parseAmount(row.amount);
  if (hasComma) {
    addAnomaly(
      'COMMA_FORMATTED_AMOUNT', 'WARNING',
      `Amount "${row.amount}" uses comma as thousand separator`,
      `Auto-parse by removing commas → parsed value: ${amount}. Approve to accept.`
    );
  }

  // ── 2. MISSING / INVALID AMOUNT ───────────────────────────────────────────
  if (amount === null) {
    addAnomaly('MISSING_AMOUNT', 'ERROR', `Amount is missing or not a number: "${row.amount}"`, 'Provide a valid numeric amount before importing this row.');
    return anomalies; // Can't continue without amount
  }

  // ── 3. NEGATIVE_AMOUNT ────────────────────────────────────────────────────
  if (amount < 0) {
    addAnomaly(
      'NEGATIVE_AMOUNT', 'WARNING',
      `Amount is negative (${amount}). This appears to be a refund/credit.`,
      'If this is a refund, consider recording it as a separate credit entry or adjusting the original expense. Approve to import as-is.'
    );
  }

  // ── 4. ZERO_AMOUNT ────────────────────────────────────────────────────────
  if (amount === 0) {
    addAnomaly(
      'ZERO_AMOUNT', 'WARNING',
      `Amount is 0 for "${row.description}". ${row.notes ? 'Note: ' + row.notes : ''}`,
      'Zero-amount expenses have no financial effect. Reject unless intentionally tracking a placeholder.'
    );
  }

  // ── 5. INVALID DATE FORMAT / MISSING DATE ────────────────────────────────
  const { date: parsedDate, format, ambiguous, altInterpretation, issues: dateIssues } = parseDate(row.date);

  if (!parsedDate) {
    addAnomaly(
      'INVALID_DATE_FORMAT', 'ERROR',
      `Cannot parse date: "${row.date}". ${dateIssues.join('; ')}`,
      'Correct the date to DD-MM-YYYY format before importing.'
    );
    return anomalies;
  }

  if (dateIssues.length > 0 && format === 'Mon-DD') {
    addAnomaly(
      'INVALID_DATE_FORMAT', 'WARNING',
      `Non-standard date format "${row.date}" — interpreted as ${parsedDate.toISOString().split('T')[0]}`,
      'Verify this is the correct date. If wrong, correct to DD-MM-YYYY before importing.'
    );
  }

  // ── 6. AMBIGUOUS DATE ─────────────────────────────────────────────────────
  if (ambiguous) {
    addAnomaly(
      'AMBIGUOUS_DATE', 'WARNING',
      `Date "${row.date}" is ambiguous — could be ${parsedDate.toISOString().split('T')[0]} (DD-MM-YYYY) or ${altInterpretation.toISOString().split('T')[0]} (MM-DD-YYYY)`,
      'Treating as DD-MM-YYYY. If the expense is from a different month, correct the date format.'
    );
  }

  // ── 7. FUTURE DATE ────────────────────────────────────────────────────────
  if (parsedDate > LAST_KNOWN_DATE) {
    addAnomaly(
      'FUTURE_DATE', 'WARNING',
      `Date ${parsedDate.toISOString().split('T')[0]} is beyond the last known expense date (${LAST_KNOWN_DATE.toISOString().split('T')[0]})`,
      'Verify this is not a data entry error. Approve only if the expense genuinely occurred after April 2026.'
    );
  }

  // ── 8. MISSING CURRENCY ───────────────────────────────────────────────────
  if (!row.currency || !row.currency.trim()) {
    addAnomaly(
      'MISSING_CURRENCY', 'ERROR',
      `Currency is missing for "${row.description}" on ${row.date}`,
      'Set currency to INR or USD. Based on context (domestic expense), INR is likely correct.'
    );
  } else if (!isValidCurrency(row.currency.trim())) {
    // ── 9. INVALID CURRENCY ─────────────────────────────────────────────────
    addAnomaly(
      'INVALID_CURRENCY', 'ERROR',
      `Currency "${row.currency}" is not supported. Valid options: INR, USD`,
      'Correct to INR or USD before importing.'
    );
  }

  // ── 10. MISSING PAID_BY ───────────────────────────────────────────────────
  if (!row.paid_by || !row.paid_by.trim()) {
    addAnomaly(
      'MISSING_PAID_BY', 'ERROR',
      `No payer recorded for "${row.description}" on ${row.date}. ${row.notes ? 'Note: ' + row.notes : ''}`,
      'Assign a payer before importing. Check group records for who likely paid.'
    );
  } else {
    // ── 11. NAME_VARIANT ──────────────────────────────────────────────────
    const resolved = resolvesMember(row.paid_by);
    if (resolved.variant) {
      addAnomaly(
        'NAME_VARIANT', 'WARNING',
        `Payer name "${row.paid_by}" appears to be a variant of known member "${resolved.canonical}"`,
        `Normalize to "${resolved.canonical}" before importing.`
      );
    } else if (!resolved.isKnown) {
      addAnomaly(
        'INVALID_MEMBER', 'WARNING',
        `Payer "${row.paid_by}" is not a recognized group member`,
        'If this is a new member, add them to the group first. If a name typo, correct and re-import.'
      );
    }
  }

  // ── 12. SETTLEMENT AS EXPENSE ─────────────────────────────────────────────
  const descLower = (row.description || '').toLowerCase();
  const isSettlementKeyword = SETTLEMENT_KEYWORDS.some((kw) => descLower.includes(kw));
  const hasSplitType = row.split_type && row.split_type.trim();
  const splitMembers = (row.split_with || '').split(';').map((s) => s.trim()).filter(Boolean);

  if (isSettlementKeyword && (!hasSplitType || splitMembers.length <= 2)) {
    addAnomaly(
      'SETTLEMENT_AS_EXPENSE', 'ERROR',
      `"${row.description}" appears to be a settlement/payment, not a shared expense (keywords: ${SETTLEMENT_KEYWORDS.filter(kw => descLower.includes(kw)).join(', ')})`,
      'Import this as a Settlement record instead of an Expense. Reject this row and record via the Settlements screen.'
    );
  }

  // ── 13. INVALID / UNKNOWN SPLIT TYPE ─────────────────────────────────────
  const validSplitTypes = ['equal', 'unequal', 'percentage', 'share'];
  if (hasSplitType && !validSplitTypes.includes(row.split_type.trim().toLowerCase())) {
    addAnomaly(
      'INVALID_SPLIT_TYPE', 'WARNING',
      `Unknown split type "${row.split_type}"`,
      'Valid split types: equal, unequal, percentage, share. Correct and re-import.'
    );
  }

  // ── 14. SPLIT TYPE MISMATCH (equal but has detail values) ────────────────
  if (hasSplitType && row.split_type.trim().toLowerCase() === 'equal' && row.split_details && row.split_details.trim()) {
    addAnomaly(
      'SPLIT_TYPE_MISMATCH', 'WARNING',
      `Split type is "equal" but split_details are present: "${row.split_details}"`,
      'If this should be a share or unequal split, change the split_type. Otherwise, remove split_details.'
    );
  }

  // ── 15. SPLIT MISMATCH (percentage) ──────────────────────────────────────
  if (hasSplitType && row.split_type.trim().toLowerCase() === 'percentage' && row.split_details && row.split_details.trim()) {
    const details = parseSplitDetails(row.split_details);
    const pctSum = Object.values(details).reduce((a, b) => a + b, 0);
    if (Math.abs(pctSum - 100) > 0.01) {
      addAnomaly(
        'SPLIT_MISMATCH', 'ERROR',
        `Percentage split sums to ${pctSum.toFixed(2)}% instead of 100% for "${row.description}"`,
        `Adjust percentages to sum to exactly 100%. Current total: ${pctSum}%. Missing/excess: ${(100 - pctSum).toFixed(2)}%.`
      );
    }
  }

  // ── 16. SPLIT MISMATCH (unequal) ─────────────────────────────────────────
  if (hasSplitType && row.split_type.trim().toLowerCase() === 'unequal' && row.split_details && row.split_details.trim()) {
    const details = parseSplitDetails(row.split_details);
    const splitSum = Object.values(details).reduce((a, b) => a + b, 0);
    if (Math.abs(splitSum - amount) > 0.02) {
      addAnomaly(
        'SPLIT_MISMATCH', 'ERROR',
        `Unequal split amounts sum to ${splitSum} but total expense is ${amount} for "${row.description}"`,
        `Adjust split amounts so they sum to ${amount}. Current difference: ${(amount - splitSum).toFixed(2)}.`
      );
    }
  }

  // ── 17. MEMBERSHIP CONFLICT ───────────────────────────────────────────────
  for (const memberRaw of splitMembers) {
    const resolved = resolvesMember(memberRaw);
    if (!resolved.isKnown) {
      // Unknown members in split_with
      if (memberRaw.toLowerCase().includes("'s friend") || memberRaw.toLowerCase().includes('friend')) {
        addAnomaly(
          'INVALID_MEMBER', 'INFO',
          `"${memberRaw}" in split_with appears to be an external guest, not a group member`,
          'Guest participants cannot be tracked in the balances system. Consider splitting only among group members or adding this person as a member first.'
        );
      } else {
        addAnomaly(
          'INVALID_MEMBER', 'WARNING',
          `"${memberRaw}" in split_with is not a recognized group member`,
          'If this is a typo or name variant, correct it. If a new member, add them to the group before importing.'
        );
      }
    } else if (!resolved.isGuest) {
      const { active, reason, isGuest } = wasMemberActiveOn(resolved.canonical, parsedDate);
      if (!active) {
        addAnomaly(
          'MEMBERSHIP_CONFLICT', 'ERROR',
          `"${memberRaw}" (resolved: ${resolved.canonical}) is in split_with but was not an active member on ${parsedDate.toISOString().split('T')[0]}. ${reason}`,
          'Remove this member from the split or correct the date. Only active members on the expense date should be included.'
        );
      }
    } else {
      // Guest (Dev)
      addAnomaly(
        'INVALID_MEMBER', 'INFO',
        `"${memberRaw}" is a guest member (not a permanent group member). Including in split.`,
        'Guests can be included in expense splits but will not appear in ongoing group balances unless added as members.'
      );
    }
  }

  // ── 18. DUPLICATE EXPENSE ─────────────────────────────────────────────────
  const normalDesc = descLower.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const duplicates = allRows.filter((other, idx) => {
    if (idx + 1 === rowNumber) return false; // skip self
    const { value: otherAmt } = parseAmount(other.amount);
    const otherDesc = (other.description || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const { date: otherDate } = parseDate(other.date);
    const { date: thisDate } = parseDate(row.date);
    return (
      otherDate && thisDate &&
      otherDate.getTime() === thisDate.getTime() &&
      otherDesc === normalDesc &&
      otherAmt === amount &&
      (other.currency || '').trim().toUpperCase() === (row.currency || '').trim().toUpperCase()
    );
  });

  if (duplicates.length > 0) {
    addAnomaly(
      'DUPLICATE_EXPENSE', 'ERROR',
      `Exact duplicate of "${row.description}" on ${row.date} for ${amount} ${row.currency}`,
      'Reject this row — a matching expense already exists in this import. Keep only one.'
    );
  }

  // ── 19. NEAR-DUPLICATE EXPENSE ────────────────────────────────────────────
  const nearDuplicates = allRows.filter((other, idx) => {
    if (idx + 1 === rowNumber) return false;
    const { value: otherAmt } = parseAmount(other.amount);
    if (otherAmt === null || amount === null) return false;
    const otherDesc = (other.description || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const { date: otherDate } = parseDate(other.date);
    const { date: thisDate } = parseDate(row.date);
    if (!otherDate || !thisDate) return false;
    const sameDate = otherDate.getTime() === thisDate.getTime();
    const descSimilar = otherDesc.includes(normalDesc.slice(0, 8)) || normalDesc.includes(otherDesc.slice(0, 8));
    const amtSimilar = otherAmt !== 0 && Math.abs(otherAmt - amount) / Math.max(otherAmt, amount) <= 0.1;
    const notExact = !(otherDesc === normalDesc && otherAmt === amount);
    return sameDate && descSimilar && amtSimilar && notExact;
  });

  if (nearDuplicates.length > 0) {
    addAnomaly(
      'NEAR_DUPLICATE_EXPENSE', 'WARNING',
      `"${row.description}" (${amount} ${row.currency}) on ${row.date} is very similar to another row: "${nearDuplicates[0].description}" (${nearDuplicates[0].amount} ${nearDuplicates[0].currency})`,
      'Review both rows carefully. If one is incorrect (e.g., different payer logging same expense), reject the duplicate.'
    );
  }

  return anomalies;
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

/**
 * Parse CSV buffer into row objects.
 */
function parseCSV(buffer) {
  const content = buffer.toString('utf-8');
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  });
  return rows;
}

// ─── Main Import Functions ───────────────────────────────────────────────────

/**
 * Stage an import: parse CSV, detect all anomalies, create ImportJob + ImportAnomaly records.
 * Does NOT commit any expense data.
 */
async function stageImport(groupId, filename, buffer) {
  const rows = parseCSV(buffer);

  // Create import job
  const job = await prisma.importJob.create({
    data: {
      groupId,
      filename,
      status: 'PROCESSING',
      totalRows: rows.length,
    },
  });

  logger.info(`Import job ${job.id} created for group ${groupId} — ${rows.length} rows`);

  const allAnomalies = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;
    const rowAnomalies = detectRowAnomalies(row, rowNumber, rows);
    allAnomalies.push(...rowAnomalies);
  }

  // Persist anomalies
  if (allAnomalies.length > 0) {
    await prisma.importAnomaly.createMany({
      data: allAnomalies.map((a) => ({
        importJobId: job.id,
        rowNumber: a.rowNumber,
        rowData: a.rowData,
        anomalyType: a.anomalyType,
        severity: a.severity,
        description: a.description,
        suggestion: a.suggestion,
        status: 'PENDING',
      })),
    });
  }

  const errorCount = allAnomalies.filter((a) => a.severity === 'ERROR').length;
  const warnCount = allAnomalies.filter((a) => a.severity === 'WARNING').length;
  const infoCount = allAnomalies.filter((a) => a.severity === 'INFO').length;

  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status: 'AWAITING_REVIEW',
      report: {
        totalRows: rows.length,
        anomaliesFound: allAnomalies.length,
        errors: errorCount,
        warnings: warnCount,
        info: infoCount,
        rowsWithAnomalies: [...new Set(allAnomalies.map((a) => a.rowNumber))].length,
      },
    },
  });

  logger.info(`Import job ${job.id} staged — ${allAnomalies.length} anomalies (${errorCount} errors, ${warnCount} warnings, ${infoCount} info)`);

  return {
    jobId: job.id,
    totalRows: rows.length,
    anomalies: allAnomalies.length,
    errors: errorCount,
    warnings: warnCount,
    info: infoCount,
  };
}

/**
 * Apply an import: for each row, check if all its anomalies are resolved.
 * Import rows where anomalies are approved/resolved; skip rows with unresolved ERRORs.
 */
async function applyImport(jobId, groupId, userId) {
  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
    include: { anomalies: true },
  });

  if (!job) throw new Error('Import job not found');
  if (job.status === 'COMPLETED') throw new Error('Import already applied');

  // Re-parse original CSV — we stored rowData in anomalies, but we need all rows
  // Instead, reconstruct from anomaly rowData (each row's data is stored)
  // Collect all unique rows from anomaly rowData, plus rows with no anomalies
  const anomalyByRow = {};
  for (const anomaly of job.anomalies) {
    if (!anomalyByRow[anomaly.rowNumber]) anomalyByRow[anomaly.rowNumber] = [];
    anomalyByRow[anomaly.rowNumber].push(anomaly);
  }

  // Get all row numbers that appear in anomalies
  const rowsFromAnomalies = {};
  for (const anomaly of job.anomalies) {
    rowsFromAnomalies[anomaly.rowNumber] = anomaly.rowData;
  }

  // We need to find members in the group to map names → user IDs
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: { select: { id: true, displayName: true, username: true } } },
  });

  const nameToUserId = {};
  for (const m of members) {
    nameToUserId[normalizeName(m.user.displayName)] = m.user.id;
    nameToUserId[normalizeName(m.user.username)] = m.user.id;
  }

  let importedRows = 0;
  let skippedRows = 0;
  const importLog = [];

  // Determine which rows to import
  // A row is skippable if it has any REJECTED anomaly
  // A row is blocked if it has any PENDING ERROR anomaly
  const allRowNumbers = [...new Set(job.anomalies.map((a) => a.rowNumber))];

  for (const rowNum of allRowNumbers) {
    const rowAnomalies = anomalyByRow[rowNum] || [];
    const rowData = rowsFromAnomalies[rowNum];

    const hasRejected = rowAnomalies.some((a) => a.status === 'REJECTED');
    const hasPendingError = rowAnomalies.some((a) => a.status === 'PENDING' && a.severity === 'ERROR');

    if (hasRejected || hasPendingError) {
      skippedRows++;
      importLog.push({ rowNumber: rowNum, status: 'SKIPPED', reason: hasRejected ? 'Row rejected by user' : 'Unresolved ERROR anomalies' });
      continue;
    }

    // Import this row
    try {
      await importRow(rowData, groupId, jobId, nameToUserId);
      importedRows++;
      importLog.push({ rowNumber: rowNum, status: 'IMPORTED', description: rowData.description });
    } catch (err) {
      skippedRows++;
      importLog.push({ rowNumber: rowNum, status: 'ERROR', reason: err.message, description: rowData?.description });
      logger.error(`Failed to import row ${rowNum}: ${err.message}`);
    }
  }

  await prisma.importJob.update({
    where: { id: jobId },
    data: {
      status: 'COMPLETED',
      importedRows,
      skippedRows,
      report: {
        ...job.report,
        importLog,
        importedRows,
        skippedRows,
        completedAt: new Date().toISOString(),
      },
    },
  });

  return { jobId, importedRows, skippedRows, log: importLog };
}

/**
 * Import a single row as an Expense + ExpenseSplits.
 */
async function importRow(row, groupId, jobId, nameToUserId) {
  const { value: amount } = parseAmount(row.amount);
  const { date: parsedDate } = parseDate(row.date);
  const currency = normalizeCurrency(row.currency) || 'INR';
  const splitType = normalizeSplitType(row.split_type);

  const { convertToINR } = require('./currencyService');
  const { calculateSplits } = require('../utils/splitCalculator');
  const { amountInr, conversionRate } = convertToINR(amount, currency);

  const paidByName = (row.paid_by || '').trim();
  const resolvedPayer = resolvesMember(paidByName);
  const paidById = resolvedPayer.canonical ? nameToUserId[resolvedPayer.canonical] || null : null;

  const splitMembers = (row.split_with || '').split(';').map((s) => s.trim()).filter(Boolean);
  const { splits } = calculateSplits(splitType, amount, splitMembers, row.split_details || '');

  const expense = await prisma.expense.create({
    data: {
      groupId,
      paidById,
      paidByName: resolvedPayer.canonical || paidByName,
      description: row.description,
      amount,
      currency,
      amountInr,
      conversionRate,
      splitType,
      expenseDate: parsedDate,
      notes: row.notes || null,
      isSettlement: false,
      importJobId: jobId,
      importedFrom: 'CSV',
    },
  });

  // Create splits
  for (const memberName of splitMembers) {
    const resolved = resolvesMember(memberName);
    const userId = resolved.canonical ? nameToUserId[resolved.canonical] || null : null;
    const splitAmount = splits[memberName] || 0;
    const { amountInr: splitAmountInr } = convertToINR(splitAmount, currency);

    await prisma.expenseSplit.create({
      data: {
        expenseId: expense.id,
        userId,
        userName: resolved.canonical || memberName,
        amount: splitAmount,
        currency,
        amountInr: splitAmountInr,
      },
    });
  }

  return expense;
}

function normalizeSplitType(raw) {
  const map = { equal: 'EQUAL', unequal: 'UNEQUAL', percentage: 'PERCENTAGE', share: 'SHARE' };
  return map[(raw || '').trim().toLowerCase()] || 'EQUAL';
}

function normalizeName(name) {
  return (name || '').trim().toLowerCase();
}

module.exports = { stageImport, applyImport, detectRowAnomalies, parseDate, parseCSV };
