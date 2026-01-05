/**
 * Currency conversion service with exchange rates
 * Supports both static rates and dynamic API integration
 */

export interface ExchangeRates {
  [currency: string]: number; // Rate relative to USD
}

export interface CurrencyConversionOptions {
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  rates?: ExchangeRates;
}

/**
 * Static exchange rates (updated periodically)
 * These rates are relative to USD (1 USD = rate)
 * Last updated: 2024-01-15
 */
const STATIC_EXCHANGE_RATES: ExchangeRates = {
  USD: 1.0,
  EUR: 0.85,
  GBP: 0.73,
  CAD: 1.35,
  AUD: 1.52,
  JPY: 110.0,
  CHF: 0.92,
  CNY: 6.45,
  INR: 74.0,
  KRW: 1180.0,
  SGD: 1.35,
  HKD: 7.8,
  TWD: 28.0,
  THB: 33.0,
  MYR: 4.2,
  IDR: 14300.0,
  PHP: 50.0,
  VND: 23000.0,
  BRL: 5.2,
  MXN: 20.0,
  ARS: 100.0,
  CLP: 800.0,
  COP: 3800.0,
  PEN: 3.7,
  UYU: 44.0,
  PYG: 7000.0,
  BOB: 6.9,
  VES: 4.5,
  ZAR: 15.0,
  EGP: 15.7,
  NGN: 410.0,
  KES: 110.0,
  MAD: 9.0,
  TND: 2.8,
  DZD: 135.0,
  GHS: 6.0,
  UGX: 3500.0,
  TZS: 2300.0,
  ETB: 44.0,
  RWF: 1000.0,
  XOF: 550.0,
  XAF: 550.0,
  SDG: 55.0,
  LYD: 4.5,
  SOS: 580.0,
  DJF: 178.0,
  ERN: 15.0,
  SSP: 130.0,
  CDF: 2000.0,
  AOA: 650.0,
  ZMW: 18.0,
  ZWL: 360.0,
  BWP: 11.0,
  NAD: 15.0,
  SZL: 15.0,
  LSL: 15.0,
  MGA: 4000.0,
  MUR: 42.0,
  SCR: 13.5,
  KMF: 420.0,
  MZN: 64.0,
  MWK: 820.0,
  PLN: 3.9,
  CZK: 21.5,
  HUF: 300.0,
  RON: 4.2,
  BGN: 1.66,
  HRK: 6.4,
  SEK: 8.5,
  DKK: 6.3,
  NOK: 8.7,
  ISK: 130.0,
  NZD: 1.45
};

/**
 * Convert currency using static exchange rates
 */
export function convertCurrencyStatic(options: CurrencyConversionOptions): number {
  const { fromCurrency, toCurrency, amount, rates = STATIC_EXCHANGE_RATES } = options;
  
  if (fromCurrency === toCurrency) {
    return amount;
  }

  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];

  if (!fromRate || !toRate) {
    console.warn(`Exchange rate not found for ${fromCurrency} or ${toCurrency}, using original amount`);
    return amount;
  }

  // Convert to USD first, then to target currency
  const usdAmount = amount / fromRate;
  const convertedAmount = usdAmount * toRate;

  return Math.round(convertedAmount * 100) / 100; // Round to 2 decimal places
}

/**
 * Fetch live exchange rates from an API (fallback to static rates)
 */
export async function fetchExchangeRates(): Promise<ExchangeRates> {
  try {
    // Using a free exchange rate API (you can replace with your preferred service)
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      headers: {
        'User-Agent': 'Feed-Manager/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Exchange rate API failed: ${response.status}`);
    }

    const data = await response.json();
    return data.rates;
  } catch (error) {
    console.warn('Failed to fetch live exchange rates, using static rates:', error);
    return STATIC_EXCHANGE_RATES;
  }
}

/**
 * Convert currency with live exchange rates
 */
export async function convertCurrencyLive(options: CurrencyConversionOptions): Promise<number> {
  const rates = await fetchExchangeRates();
  return convertCurrencyStatic({ ...options, rates });
}

/**
 * Get the appropriate currency for a country
 */
export function getCurrencyForCountry(country?: string): string {
  const countryCurrencyMap: Record<string, string> = {
    'US': 'USD',
    'CA': 'CAD',
    'GB': 'GBP',
    'DE': 'EUR',
    'FR': 'EUR',
    'ES': 'EUR',
    'IT': 'EUR',
    'NL': 'EUR',
    'BE': 'EUR',
    'AT': 'EUR',
    'PT': 'EUR',
    'IE': 'EUR',
    'FI': 'EUR',
    'LU': 'EUR',
    'MT': 'EUR',
    'CY': 'EUR',
    'SK': 'EUR',
    'SI': 'EUR',
    'EE': 'EUR',
    'LV': 'EUR',
    'LT': 'EUR',
    'PL': 'PLN',
    'CZ': 'CZK',
    'HU': 'HUF',
    'RO': 'RON',
    'BG': 'BGN',
    'HR': 'HRK',
    'SE': 'SEK',
    'DK': 'DKK',
    'NO': 'NOK',
    'CH': 'CHF',
    'IS': 'ISK',
    'AU': 'AUD',
    'NZ': 'NZD',
    'JP': 'JPY',
    'KR': 'KRW',
    'CN': 'CNY',
    'IN': 'INR',
    'SG': 'SGD',
    'HK': 'HKD',
    'TW': 'TWD',
    'TH': 'THB',
    'MY': 'MYR',
    'ID': 'IDR',
    'PH': 'PHP',
    'VN': 'VND',
    'BR': 'BRL',
    'MX': 'MXN',
    'AR': 'ARS',
    'CL': 'CLP',
    'CO': 'COP',
    'PE': 'PEN',
    'UY': 'UYU',
    'PY': 'PYG',
    'BO': 'BOB',
    'EC': 'USD',
    'VE': 'VES',
    'ZA': 'ZAR',
    'EG': 'EGP',
    'NG': 'NGN',
    'KE': 'KES',
    'MA': 'MAD',
    'TN': 'TND',
    'DZ': 'DZD',
    'GH': 'GHS',
    'UG': 'UGX',
    'TZ': 'TZS',
    'ET': 'ETB',
    'RW': 'RWF',
    'SN': 'XOF',
    'CI': 'XOF',
    'BF': 'XOF',
    'ML': 'XOF',
    'NE': 'XOF',
    'TD': 'XAF',
    'SD': 'SDG',
    'LY': 'LYD',
    'SO': 'SOS',
    'DJ': 'DJF',
    'ER': 'ERN',
    'SS': 'SSP',
    'CF': 'XAF',
    'CM': 'XAF',
    'GQ': 'XAF',
    'GA': 'XAF',
    'CG': 'XAF',
    'CD': 'CDF',
    'AO': 'AOA',
    'ZM': 'ZMW',
    'ZW': 'ZWL',
    'BW': 'BWP',
    'NA': 'NAD',
    'SZ': 'SZL',
    'LS': 'LSL',
    'MG': 'MGA',
    'MU': 'MUR',
    'SC': 'SCR',
    'KM': 'KMF',
    'YT': 'EUR',
    'RE': 'EUR',
    'MZ': 'MZN',
    'MW': 'MWK'
  };

  return countryCurrencyMap[country || 'US'] || 'USD';
}

/**
 * Format price with currency symbol
 */
export function formatPrice(amount: number, currency: string): string {
  // Format number with appropriate decimal places
  const decimals = ['JPY', 'KRW', 'VND', 'IDR', 'XOF', 'XAF', 'UGX', 'TZS', 'RWF', 'CDF', 'MGA', 'KMF', 'MZN', 'MWK'].includes(currency) ? 0 : 2;

  return `${Number(amount).toFixed(decimals)} ${currency}`;
}
