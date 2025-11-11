/**
 * Currency utilities for displaying currency codes with symbols
 */

// Currency code to symbol mapping
export const getCurrencySymbol = (code: string): string => {
  const symbols: Record<string, string> = {
    // Major currencies
    USD: "$", EUR: "€", GBP: "£", JPY: "¥", CHF: "Fr",
    // North America
    CAD: "C$", MXN: "Mex$",
    // Europe
    SEK: "kr", NOK: "kr", DKK: "kr", PLN: "zł", CZK: "Kč",
    HUF: "Ft", RON: "lei", BGN: "лв", HRK: "kn", ISK: "kr",
    // Asia
    CNY: "¥", KRW: "₩", HKD: "HK$", TWD: "NT$", SGD: "S$",
    MYR: "RM", THB: "฿", IDR: "Rp", PHP: "₱", VND: "₫",
    INR: "₹", PKR: "₨", BDT: "৳",
    // Middle East
    AED: "د.إ", SAR: "﷼", ILS: "₪", TRY: "₺", QAR: "ر.ق",
    // Oceania
    AUD: "A$", NZD: "NZ$",
    // South America
    BRL: "R$", ARS: "AR$", CLP: "CLP$", COP: "COL$", PEN: "S/",
    // Africa
    ZAR: "R", EGP: "E£", NGN: "₦", KES: "KSh", MAD: "د.م."
  };
  return symbols[code] || code;
};

// Country to default currency mapping
export const getCountryCurrency = (countryCode: string): string => {
  const mapping: Record<string, string> = {
    // Europe
    AT: "EUR", BE: "EUR", BG: "BGN", HR: "HRK", CY: "EUR",
    CZ: "CZK", DK: "DKK", EE: "EUR", FI: "EUR", FR: "EUR",
    DE: "EUR", GR: "EUR", HU: "HUF", IE: "EUR", IT: "EUR",
    LV: "EUR", LT: "EUR", LU: "EUR", MT: "EUR", NL: "EUR",
    PL: "PLN", PT: "EUR", RO: "RON", SK: "EUR", SI: "EUR",
    ES: "EUR", SE: "SEK", NO: "NOK", CH: "CHF", GB: "GBP",
    IS: "ISK",
    // North America
    US: "USD", CA: "CAD", MX: "MXN",
    // Asia
    CN: "CNY", JP: "JPY", KR: "KRW", HK: "HKD", TW: "TWD",
    SG: "SGD", MY: "MYR", TH: "THB", ID: "IDR", PH: "PHP",
    VN: "VND", IN: "INR", PK: "PKR", BD: "BDT",
    // Middle East
    AE: "AED", SA: "SAR", IL: "ILS", TR: "TRY", QA: "QAR",
    // Oceania
    AU: "AUD", NZ: "NZD",
    // South America
    BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
    // Africa
    ZA: "ZAR", EG: "EGP", NG: "NGN", KE: "KES", MA: "MAD"
  };
  return mapping[countryCode] || "USD";
};

/**
 * Format currency for display with code and symbol
 * @param currency - Currency code or "local"/"Local currency"
 * @param country - Optional country code for resolving local currency
 * @returns Formatted currency string like "USD ($)" or "EUR (€)"
 */
export const getCurrencyDisplay = (currency: string, country?: string): string => {
  // Handle local currency
  if (currency === "local" || currency === "Local currency") {
    if (country) {
      const localCurrency = getCountryCurrency(country.toUpperCase());
      const symbol = getCurrencySymbol(localCurrency);
      return `${localCurrency} (${symbol})`;
    }
    return "Local";
  }
  
  // Handle specific currency code
  const code = currency.toUpperCase();
  const symbol = getCurrencySymbol(code);
  return `${code} (${symbol})`;
};

