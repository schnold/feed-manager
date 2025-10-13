export type MappedItem = Record<string, string>;

function stripHtml(html?: string) {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function defaultGoogleMapping(product: any, variant: any, currency: string, language?: string, country?: string) : MappedItem {
  const ctx = variant?.contextualPricing;
  const price = ctx?.price?.amount ?? variant?.price;
  const compareAt = ctx?.compareAtPrice?.amount ?? variant?.compareAtPrice;
  const hasSale = compareAt && Number(compareAt) > Number(price);
  const salePrice = hasSale ? `${Number(price).toFixed(2)} ${currency}` : undefined;
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
  const currencyCode = currency === "Local currency" ? (ctx?.price?.currencyCode || "AUD") : currency;
  const formattedPrice = `${Number(price || 0).toFixed(1)} ${currencyCode}`;
  const formattedSalePrice = salePrice ? `${Number(price || 0).toFixed(1)} ${currencyCode}` : undefined;
  
  // Create title with variant info like "Product Name - Variant Title"
  const fullTitle = variant?.title && variant.title !== product?.title 
    ? `${product?.title || ""} - ${variant.title}`
    : product?.title || "";
  
  // Add currency parameter to URL if needed
  let finalUrl = variantUrl;
  if (currency !== "Local currency" && currency && !variantUrl.includes("currency=")) {
    finalUrl = variantUrl + (variantUrl.includes("?") ? "&" : "?") + `currency=${currency}`;
  }

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


