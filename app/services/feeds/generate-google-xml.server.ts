import db from "../../db.server";
import { uploadXmlToS3 } from "../storage/s3.server";
import { iterateProducts } from "./product-iterator.server";
import { iterateProductsWithStorefront, getStorefrontAccessToken } from "./storefront-product-iterator.server";
import { defaultGoogleMapping } from "./mapping.server";
import { passesFilters } from "./filters.server";
import { getCurrencyForCountry } from "../currency/currency-converter.server";
import { fetchTranslatedProductsAdmin, type TranslatedProduct } from "./translation-fetcher.server";

type GenerateOptions = {
  feedId: string;
  shopDomain: string;
  accessToken: string;
  request?: Request;
};

export async function generateGoogleXmlAndUpload({
  feedId,
  shopDomain,
  accessToken,
  request
}: GenerateOptions) {
  console.log(`[Feed Generation] Starting generation for feed ${feedId}`);

  const feed = await db.feed.findUnique({
    where: { id: feedId },
    include: { shop: true, mappings: { orderBy: { order: "asc" } }, filters: true },
  });
  if (!feed) {
    console.error(`[Feed Generation] Feed ${feedId} not found`);
    throw new Error("Feed not found");
  }

  console.log(`[Feed Generation] Found feed: ${feed.name} (${feed.language}-${feed.country})`);

  const items: string[] = [];
  let productCount = 0;
  let variantCount = 0;

  // Fetch all products using the best available API
  let products: any[] = [];
  let translations: Map<string, TranslatedProduct> = new Map();

  try {
    // Try Storefront API first (better for translations and localized pricing)
    const storefrontAccessToken = await getStorefrontAccessToken(shopDomain, request, accessToken);
    console.log(`[Feed Generation] Using Storefront API for translations and pricing`);

    const iter = iterateProductsWithStorefront({
      shopDomain: shopDomain,
      storefrontAccessToken: storefrontAccessToken,
      language: feed.language,
      country: feed.country,
    });

    for await (const product of iter as any) {
      products.push(product);
    }

    console.log(`[Feed Generation] Fetched ${products.length} products with Storefront API (includes translations and localized pricing)`);
  } catch (error) {
    console.warn(`[Feed Generation] Storefront API failed, falling back to Admin API:`, error);

    try {
      // Fallback to Admin API
      const iter = iterateProducts({
        shopDomain: shopDomain,
        accessToken: accessToken,
        language: feed.language,
        country: feed.country,
      });

      for await (const product of iter as any) {
        products.push(product);
        if (products.length % 500 === 0) {
          console.log(`[Feed Generation] Admin API fallback progress: ${products.length} products fetched...`);
        }
      }

      console.log(`[Feed Generation] Successfully fetched ${products.length} products total via Admin API fallback`);

      // Fetch translations if language is not English (Admin API approach)
      if (feed.language !== 'en' && products.length > 0) {
        console.log(`[Feed Generation] Fetching translations for language: ${feed.language}`);
        const productIds = products.map(p => p.id);
        translations = await fetchTranslatedProductsAdmin(
          shopDomain,
          accessToken,
          feed.language,
          productIds
        );
        console.log(`[Feed Generation] Fetched ${translations.size} product translations`);
      }
    } catch (fallbackError) {
      console.error(`[Feed Generation] Admin API fallback also failed:`, fallbackError);
      throw fallbackError; // Re-throw to be caught by the queue processor
    }
  }

  for (const product of products) {
    let hasVariantsInFeed = false;

    // Apply translations if available
    const translatedProduct = translations.get(product.id);
    if (translatedProduct) {
      // Apply translated title and description
      if (translatedProduct.title) {
        product.title = translatedProduct.title;
      }
      if (translatedProduct.description) {
        product.bodyHtml = translatedProduct.description;
      }
    }

    // Handle both translated and regular product structures
    const variants = product.variants?.edges || product.variants || [];

    for (const vEdge of variants) {
      const variant = vEdge.node || vEdge;
      if (!passesFilters(product, variant, feed.filters as any, "all")) continue;

      hasVariantsInFeed = true;
      variantCount++;

      // Apply variant translations if available
      if (translatedProduct) {
        const translatedVariant = translatedProduct.variants.find(v => v.id === variant.id);
        if (translatedVariant && translatedVariant.title) {
          variant.title = translatedVariant.title;
        }
      }

      // Provide shop domain for link generation
      product.shopDomain = shopDomain;

      // Generate language-specific product URL with variant and currency
      const productUrl = generateProductUrl(
        product,
        variant,
        shopDomain,
        feed.language,
        feed.country,
        feed.currency
      );
      product.onlineStoreUrl = productUrl;

      const mapped = defaultGoogleMapping(
        product,
        variant,
        feed.currency === "local" ? "Local currency" : feed.currency,
        feed.language,
        feed.country
      );
      const node =
        `<item>\n` +
        `<g:id>${escapeXml(mapped["g:id"])}</g:id>\n` +
        `<g:item_group_id>${escapeXml(mapped["g:item_group_id"])}</g:item_group_id>\n` +
        `<g:title>${escapeXml(mapped["g:title"] || "")}</g:title>\n` +
        `<g:description>${escapeXml(mapped["g:description"] || "")}</g:description>\n` +
        `<g:link>${escapeXml(mapped["g:link"] || "")}</g:link>\n` +
        `<g:image_link>${escapeXml(mapped["g:image_link"] || "")}</g:image_link>\n` +
        `<g:availability>${escapeXml(mapped["g:availability"] || "")}</g:availability>\n` +
        `<g:price>${escapeXml(mapped["g:price"] || "")}</g:price>\n` +
        (mapped["g:sale_price"] ? `<g:sale_price>${escapeXml(mapped["g:sale_price"])}</g:sale_price>\n` : "") +
        `<g:google_product_category>${escapeXml(mapped["g:google_product_category"] || "")}</g:google_product_category>\n` +
        `<g:product_type>${escapeXml(mapped["g:product_type"] || "")}</g:product_type>\n` +
        `<g:brand>${escapeXml(mapped["g:brand"] || "")}</g:brand>\n` +
        (mapped["g:gtin"] ? `<g:gtin>${escapeXml(mapped["g:gtin"] || "")}</g:gtin>\n` : "") +
        (mapped["g:mpn"] ? `<g:mpn>${escapeXml(mapped["g:mpn"] || "")}</g:mpn>\n` : "") +
        `<g:identifier_exists>${escapeXml(mapped["g:identifier_exists"] || "FALSE")}</g:identifier_exists>\n` +
        `<g:condition>${escapeXml(mapped["g:condition"] || "new")}</g:condition>\n` +
        `</item>`;
      items.push(node);
    }

    if (hasVariantsInFeed) {
      productCount++;
    }
  }

  // Generate language-specific channel title
  const channelTitle = generateChannelTitle(feed.name, feed.language, feed.country);

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n` +
    `<channel>\n` +
    `<title>${escapeXml(channelTitle)}</title>\n` +
    `<description/>\n` +
    `<link/>\n` +
    (items.length ? items.join("\n") : "") +
    `\n</channel>\n` +
    `</rss>`;

  const key = `${feed.shopId}/${feed.id}.xml`;
  console.log(`[Feed Generation] Uploading XML to S3: ${key}`);

  const publicUrl = await uploadXmlToS3({ key, body: xml, contentType: "application/xml; charset=utf-8" });

  console.log(`[Feed Generation] Upload complete. Public URL: ${publicUrl}`);
  console.log(`[Feed Generation] Feed contains ${productCount} products and ${variantCount} variants`);

  await db.feed.update({
    where: { id: feed.id },
    data: {
      publicPath: key,
      publicUrl,
      lastSuccessAt: new Date(),
      status: "success",
      productCount,
      variantCount
    },
  });

  console.log(`[Feed Generation] Feed ${feedId} generation completed successfully`);

  return { key, publicUrl, productCount, variantCount };
}

// Alias export for worker
export const generateGoogleXML = generateGoogleXmlAndUpload;

function escapeXml(val: string) {
  return (val || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}


/**
 * Generate language-specific product URL with variant and currency parameters
 * Format: https://shop.com/[language]/products/[handle]?variant=[variantId]&currency=[currency]
 */
function generateProductUrl(
  product: any,
  variant: any,
  shopDomain: string,
  language: string,
  country: string,
  currency: string
): string {
  // Extract the store name from myshopify domain and construct the proper URL
  // shopDomain might be like "sitezone-test-02.myshopify.com"
  // We need to convert it to the actual store URL
  let baseUrl: string;

  if (shopDomain.includes('.myshopify.com')) {
    // If it's a myshopify domain, use it as-is for now
    // In production, you'd typically use the custom domain if available
    baseUrl = `https://${shopDomain}`;
  } else {
    baseUrl = `https://${shopDomain}`;
  }

  // Extract variant ID (remove gid://shopify/ProductVariant/ prefix if present)
  let variantId = variant.id;
  if (typeof variantId === 'string' && variantId.includes('ProductVariant/')) {
    variantId = variantId.split('ProductVariant/')[1];
  }

  // Determine the currency code
  let currencyCode = currency === "local" || currency === "Local currency" ? getCurrencyForCountry(country) : currency;

  // Build the URL path with language locale
  let path: string;
  if (language === 'en') {
    // For English (primary language), don't include language in path
    path = `/products/${product.handle}`;
  } else {
    // For other languages, include language code in path
    path = `/${language}/products/${product.handle}`;
  }

  // Add variant and currency query parameters
  const url = `${baseUrl}${path}?variant=${variantId}&currency=${currencyCode}`;

  return url;
}

/**
 * Generate language-specific channel title
 */
function generateChannelTitle(feedName: string, language: string, country: string): string {
  const countryNames: Record<string, string> = {
    'US': 'United States',
    'CA': 'Canada',
    'GB': 'United Kingdom',
    'DE': 'Germany',
    'FR': 'France',
    'ES': 'Spain',
    'PL': 'Poland',
    'IT': 'Italy',
    'NL': 'Netherlands',
    'SE': 'Sweden',
    'DK': 'Denmark',
    'NO': 'Norway',
    'FI': 'Finland',
    'AU': 'Australia',
    'JP': 'Japan',
    'KR': 'South Korea',
    'CN': 'China',
    'IN': 'India',
    'BR': 'Brazil',
    'MX': 'Mexico',
    'AR': 'Argentina',
    'CL': 'Chile',
    'CO': 'Colombia',
    'PE': 'Peru',
    'ZA': 'South Africa',
    'EG': 'Egypt',
    'NG': 'Nigeria',
    'KE': 'Kenya',
    'MA': 'Morocco',
    'TN': 'Tunisia',
    'DZ': 'Algeria',
    'GH': 'Ghana',
    'UG': 'Uganda',
    'TZ': 'Tanzania',
    'ET': 'Ethiopia',
    'RW': 'Rwanda',
    'SN': 'Senegal',
    'CI': 'Ivory Coast',
    'BF': 'Burkina Faso',
    'ML': 'Mali',
    'NE': 'Niger',
    'TD': 'Chad',
    'SD': 'Sudan',
    'LY': 'Libya',
    'SO': 'Somalia',
    'DJ': 'Djibouti',
    'ER': 'Eritrea',
    'SS': 'South Sudan',
    'CF': 'Central African Republic',
    'CM': 'Cameroon',
    'GQ': 'Equatorial Guinea',
    'GA': 'Gabon',
    'CG': 'Republic of the Congo',
    'CD': 'Democratic Republic of the Congo',
    'AO': 'Angola',
    'ZM': 'Zambia',
    'ZW': 'Zimbabwe',
    'BW': 'Botswana',
    'NA': 'Namibia',
    'SZ': 'Eswatini',
    'LS': 'Lesotho',
    'MG': 'Madagascar',
    'MU': 'Mauritius',
    'SC': 'Seychelles',
    'KM': 'Comoros',
    'YT': 'Mayotte',
    'RE': 'Réunion',
    'MZ': 'Mozambique',
    'MW': 'Malawi'
  };

  const countryName = countryNames[country] || country;

  // If the feed name already contains the country, don't duplicate it
  if (feedName.toLowerCase().includes(countryName.toLowerCase()) ||
    feedName.toLowerCase().includes(country.toLowerCase())) {
    return feedName;
  }

  // Add country to the feed name for better identification
  return `${feedName} - ${countryName}`;
}


