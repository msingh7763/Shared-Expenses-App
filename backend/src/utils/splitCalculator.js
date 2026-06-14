/**
 * Split Calculator — handles equal, unequal, percentage, share split types.
 * Returns per-member amounts. Rounding remainder goes to the first member.
 */

/**
 * Parse split_details string into structured object.
 * Handles formats like:
 *   "Rohan 700; Priya 400; Meera 400"   (unequal)
 *   "Aisha 30%; Rohan 30%; Priya 30%; Meera 20%"  (percentage)
 *   "Aisha 1; Rohan 2; Priya 1; Dev 2"   (share)
 */
function parseSplitDetails(detailsStr) {
  if (!detailsStr || !detailsStr.trim()) return {};
  const result = {};
  const parts = detailsStr.split(';').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    // Match: "Name 30%" or "Name 700" or "Name 2"
    const match = part.match(/^(.+?)\s+([\d.]+)%?$/);
    if (match) {
      const name = match[1].trim();
      const value = parseFloat(match[2]);
      result[name] = value;
    }
  }
  return result;
}

/**
 * Normalize member name for fuzzy matching
 */
function normalizeName(name) {
  return name.trim().toLowerCase();
}

/**
 * Calculate split amounts for all members.
 *
 * @param {string} splitType - "EQUAL" | "UNEQUAL" | "PERCENTAGE" | "SHARE"
 * @param {number} totalAmount - Total expense amount
 * @param {string[]} members - Array of member names
 * @param {string} splitDetailsStr - Raw split_details string from CSV/API
 * @returns {{ splits: Record<string, number>, valid: boolean, errors: string[] }}
 */
function calculateSplits(splitType, totalAmount, members, splitDetailsStr = '') {
  const errors = [];
  const splits = {};

  if (!members || members.length === 0) {
    return { splits: {}, valid: false, errors: ['No members provided for split'] };
  }

  const amount = parseFloat(totalAmount);
  if (isNaN(amount)) {
    return { splits: {}, valid: false, errors: ['Invalid total amount'] };
  }

  switch (splitType.toUpperCase()) {
    case 'EQUAL': {
      const share = amount / members.length;
      const rounded = Math.round(share * 100) / 100;
      let total = 0;
      members.forEach((m, i) => {
        splits[m] = rounded;
        total += rounded;
      });
      // Distribute rounding remainder to first member
      const remainder = Math.round((amount - total) * 100) / 100;
      if (remainder !== 0 && members.length > 0) {
        splits[members[0]] = Math.round((splits[members[0]] + remainder) * 100) / 100;
      }
      break;
    }

    case 'UNEQUAL': {
      const details = parseSplitDetails(splitDetailsStr);
      let detailTotal = 0;
      for (const member of members) {
        const normalMember = normalizeName(member);
        // Find matching key (case-insensitive)
        const key = Object.keys(details).find((k) => normalizeName(k) === normalMember);
        if (key !== undefined) {
          splits[member] = details[key];
          detailTotal += details[key];
        } else {
          errors.push(`No split amount found for member "${member}"`);
          splits[member] = 0;
        }
      }
      const diff = Math.abs(detailTotal - amount);
      if (diff > 0.02) {
        errors.push(`Split amounts sum (${detailTotal}) does not match total (${amount}). Difference: ${diff.toFixed(2)}`);
      }
      break;
    }

    case 'PERCENTAGE': {
      const details = parseSplitDetails(splitDetailsStr);
      let percentTotal = 0;
      const rawSplits = {};
      for (const member of members) {
        const normalMember = normalizeName(member);
        const key = Object.keys(details).find((k) => normalizeName(k) === normalMember);
        if (key !== undefined) {
          const pct = details[key];
          percentTotal += pct;
          rawSplits[member] = Math.round((pct / 100) * amount * 100) / 100;
        } else {
          errors.push(`No percentage found for member "${member}"`);
          rawSplits[member] = 0;
        }
      }
      if (Math.abs(percentTotal - 100) > 0.01) {
        errors.push(`Percentages sum to ${percentTotal}%, expected 100%`);
      }
      // Fix rounding
      let splitTotal = Object.values(rawSplits).reduce((a, b) => a + b, 0);
      const remainder = Math.round((amount - splitTotal) * 100) / 100;
      Object.assign(splits, rawSplits);
      if (remainder !== 0 && members.length > 0) {
        splits[members[0]] = Math.round((splits[members[0]] + remainder) * 100) / 100;
      }
      break;
    }

    case 'SHARE': {
      const details = parseSplitDetails(splitDetailsStr);
      let totalShares = 0;
      const memberShares = {};
      for (const member of members) {
        const normalMember = normalizeName(member);
        const key = Object.keys(details).find((k) => normalizeName(k) === normalMember);
        const shareCount = key !== undefined ? details[key] : 1;
        memberShares[member] = shareCount;
        totalShares += shareCount;
      }
      if (totalShares === 0) {
        errors.push('Total shares is zero');
        break;
      }
      let splitTotal = 0;
      for (const member of members) {
        const share = Math.round(((memberShares[member] / totalShares) * amount) * 100) / 100;
        splits[member] = share;
        splitTotal += share;
      }
      // Fix rounding
      const remainder = Math.round((amount - splitTotal) * 100) / 100;
      if (remainder !== 0 && members.length > 0) {
        splits[members[0]] = Math.round((splits[members[0]] + remainder) * 100) / 100;
      }
      break;
    }

    default:
      errors.push(`Unknown split type: ${splitType}`);
  }

  return { splits, valid: errors.length === 0, errors };
}

module.exports = { calculateSplits, parseSplitDetails, normalizeName };
