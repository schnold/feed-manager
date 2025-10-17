import { convertCurrencyStatic, getCurrencyForCountry, formatPrice } from '../currency/currency-converter.server';

export type MappedItem = Record<string, string>;

function stripHtml(html?: string) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function defaultGoogleMapping(product: any, variant: any, currency: string, language?: string, country?: string) : MappedItem {
  const ctx = variant?.contextualPricing;
  
  // Use contextual pricing if available, otherwise fall back to base pricing
  let originalPrice = ctx?.price?.amount ?? variant?.price;
  let originalCompareAt = ctx?.compareAtPrice?.amount ?? variant?.compareAtPrice;
  let originalCurrency = ctx?.price?.currencyCode || 'USD'; // Default to USD if no currency info
  
  // Handle case where contextual pricing returns null or 0
  if (!originalPrice || originalPrice === '0' || originalPrice === '0.00') {
    originalPrice = variant?.price;
    originalCurrency = 'USD'; // Assume base price is in USD
  }
  
  if (!originalCompareAt || originalCompareAt === '0' || originalCompareAt === '0.00') {
    originalCompareAt = variant?.compareAtPrice;
  }
  
  const productId = product?.id?.replace("gid://shopify/Product/", "") ?? "";
  const variantId = variant?.id?.replace("gid://shopify/ProductVariant/", "") ?? "";

  // Use language-specific URL if provided, otherwise use standard URL
  let productUrl = "";
  if (product?.onlineStoreUrl) {
    // Use the pre-generated language-specific URL
    productUrl = product.onlineStoreUrl;
  } else if (product?.handle && product?.shopDomain) {
    // Generate URL with language prefix if not primary language
    if (language && language !== 'en') {
      productUrl = `https://${product.shopDomain}/${language}/products/${product.handle}`;
    } else {
      productUrl = `https://${product.shopDomain}/products/${product.handle}`;
    }
  }

  const variantUrl = productUrl && variantId ? `${productUrl}?variant=${variantId}` : productUrl;
  const description = stripHtml(product?.bodyHtml) || product?.title || "";
  
  // Determine target currency
  const targetCurrency = currency === "Local currency" ? getCurrencyForCountry(country) : currency;
  
  // If contextual pricing is available and already in the target currency, use it directly
  let convertedPrice: number;
  let convertedCompareAt: number | null = null;
  
  if (ctx?.price?.currencyCode === targetCurrency) {
    // Contextual pricing is already in the target currency
    convertedPrice = Number(originalPrice || 0);
    convertedCompareAt = originalCompareAt ? Number(originalCompareAt) : null;
  } else {
    // Convert prices to target currency
    convertedPrice = convertCurrencyStatic({
      fromCurrency: originalCurrency,
      toCurrency: targetCurrency,
      amount: Number(originalPrice || 0)
    });
    
    convertedCompareAt = originalCompareAt ? convertCurrencyStatic({
      fromCurrency: originalCurrency,
      toCurrency: targetCurrency,
      amount: Number(originalCompareAt)
    }) : null;
  }
  
  const hasSale = convertedCompareAt && Number(convertedCompareAt) > Number(convertedPrice);
  const formattedPrice = formatPrice(convertedPrice, targetCurrency);
  const formattedSalePrice = hasSale ? formatPrice(convertedPrice, targetCurrency) : undefined;
  
  // Create title with variant info like "Product Name - Variant Title"
  const fullTitle = variant?.title && variant.title !== product?.title 
    ? `${product?.title || ""} - ${variant.title}`
    : product?.title || "";
  
  // Use the pre-generated URL (it already includes currency parameter)
  let finalUrl = variantUrl;

  const item: MappedItem = {
    "g:id": variantId,
    "g:item_group_id": productId,
    "g:title": fullTitle,
    "g:description": description,
    "g:link": finalUrl,
    "g:image_link": (variant?.image?.url || product?.featuredImage?.url || ""),
    "g:availability": variant?.inventoryQuantity > 0 ? "in_stock" : "out_of_stock",
    "g:price": formattedPrice,
    "g:google_product_category": product?.productType || "Uncategorized",
    "g:product_type": "",
    "g:brand": product?.vendor || "",
    "g:gtin": variant?.barcode || "",
    "g:mpn": variant?.sku || "",
    "g:identifier_exists": (variant?.barcode || variant?.sku) ? "True" : "False",
    "g:condition": "new",
  };
  if (formattedSalePrice) item["g:sale_price"] = formattedSalePrice;
  return item;
}


