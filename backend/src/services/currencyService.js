/**
 * Currency Service
 * Handles INR/USD conversion with configurable rate.
 * Strategy: use env var USD_TO_INR_RATE (static) or extend with live API.
 */

const VALID_CURRENCIES = ['INR', 'USD'];

/**
 * Get current USD→INR conversion rate.
 * Rate source: environment variable (configurable per deployment).
 */
function getConversionRate(fromCurrency, toCurrency = 'INR') {
  const usdToInr = parseFloat(process.env.USD_TO_INR_RATE) || 84.5;

  if (fromCurrency === toCurrency) return 1;

  if (fromCurrency === 'USD' && toCurrency === 'INR') return usdToInr;
  if (fromCurrency === 'INR' && toCurrency === 'USD') return 1 / usdToInr;

  throw new Error(`Unsupported currency pair: ${fromCurrency} → ${toCurrency}`);
}

/**
 * Convert an amount from one currency to INR.
 * Always stores original + converted for traceability.
 */
function convertToINR(amount, fromCurrency) {
  if (!VALID_CURRENCIES.includes(fromCurrency)) {
    throw new Error(`Invalid currency: ${fromCurrency}`);
  }
  const rate = getConversionRate(fromCurrency, 'INR');
  const converted = Math.round(parseFloat(amount) * rate * 100) / 100;
  return { amountInr: converted, conversionRate: rate };
}

/**
 * Validate a currency string.
 */
function isValidCurrency(currency) {
  return VALID_CURRENCIES.includes((currency || '').toUpperCase().trim());
}

/**
 * Normalize currency string.
 */
function normalizeCurrency(currency) {
  const upper = (currency || '').toUpperCase().trim();
  if (VALID_CURRENCIES.includes(upper)) return upper;
  return null;
}

module.exports = { convertToINR, getConversionRate, isValidCurrency, normalizeCurrency, VALID_CURRENCIES };
