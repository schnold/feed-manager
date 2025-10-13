# Multi-Language XML Feed Example

This document shows how the feed manager generates XML feeds for different languages, using the Polish example from the provided XML feed.

## Polish Language Feed Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
<channel>
<title>POLAND</title>
<description/>
<link/>
<item>
<g:id>44714076340531</g:id>
<g:item_group_id>8184849924403</g:item_group_id>
<g:title>Stołek optyczny z miękkiej wełny | Minimalistyczny nordycki design</g:title>
<g:description>Transform your living space with the JUGLANA Soft Wool Optic Stool, a perfect blend of comfort and minimalist design. This stylish stool adds a cozy touch to any room, making it an ideal addition to your living room, dressing area, or even a makeup space. Its inviting texture and clean lines create a warm and inviting atmosphere. Soft Wool Fabric: Offers a plush, comfortable seating experience. Minimalist Nordic Design: Complements any interior style with its clean aesthetic. Unique Optic Texture: Adds visual interest and a touch of luxury. Durable Construction: Built to last with high-quality materials. Versatile Use: Perfect for your living room, dressing area or as a decorative accent. Crafted with meticulous attention to detail, the Soft Wool Optic Stool features a high-quality, textured fabric that feels soft to the touch. Its unique optic design adds a subtle yet striking visual element, elevating the overall aesthetic of your space. This stool isn't just a piece of furniture; it's a statement of style and comfort. Looking for a versatile and stylish seating solution? The JUGLANA Soft Wool Optic Stool is the perfect choice. Easy to clean and maintain, this stool is designed to seamlessly integrate into your daily life. For care, simply spot clean with a mild detergent.</g:description>
<g:link>https://juglana.com/pl/products/juglana-soft-wool-optic-stool?variant=44714076340531&currency=EUR</g:link>
<g:image_link>https://cdn.shopify.com/s/files/1/0742/0831/3651/files/soft-wool-optic-stool-or-minimalistic-nordic-design-juglana-58875.png?v=1747850140</g:image_link>
<g:availability>in_stock</g:availability>
<g:price>319.0 EUR</g:price>
<g:sale_price>319.0 EUR</g:sale_price>
<g:google_product_category>Furniture > Ottomans</g:google_product_category>
<g:product_type>Stołek</g:product_type>
<g:brand>JUGLANA</g:brand>
<g:gtin>01</g:gtin>
<g:mpn>01</g:mpn>
<g:identifier_exists>True</g:identifier_exists>
<g:condition>new</g:condition>
</item>
</channel>
</rss>
```

## Key Features of Multi-Language Support

### 1. Language-Specific Product URLs
- **English**: `https://shop.com/products/product-handle`
- **Polish**: `https://shop.com/pl/products/product-handle`
- **Spanish**: `https://shop.com/es/products/product-handle`

### 2. Translated Product Information
- **Title**: Translated product titles (e.g., "Stołek optyczny z miękkiej wełny")
- **Description**: Translated product descriptions
- **Product Type**: Translated product types (e.g., "Stołek" instead of "Stool")

### 3. Language-Specific Channel Titles
- **English Feed**: "Google Shopping - United States"
- **Polish Feed**: "Google Shopping - Poland"
- **Spanish Feed**: "Google Shopping - Spain"

### 4. Currency and Pricing
- Supports local currencies (EUR for Poland, USD for US, etc.)
- Maintains proper currency formatting for each region

## Implementation Details

### Database Schema Updates
```sql
-- Added fields to support multi-language feeds
ALTER TABLE "Feed" ADD COLUMN "title" TEXT;
ALTER TABLE "Feed" ADD COLUMN "settings" JSONB;
```

### GraphQL Queries for Translations
```graphql
query getProductsWithTranslations($first: Int!) {
  products(first: $first) {
    edges {
      node {
        id
        title
        description
        descriptionHtml
        handle
        variants(first: 100) {
          edges {
            node {
              id
              title
              price
              selectedOptions {
                name
                value
              }
            }
          }
        }
      }
    }
  }
}
```

### Language Detection and Fallback
1. **Primary Language**: Uses standard product data
2. **Secondary Languages**: Fetches translations via Shopify's translation API
3. **Fallback**: If translations fail, falls back to primary language data

### Feed Generation Process
1. **Language Check**: Determines if feed is for primary or secondary language
2. **Data Fetching**: 
   - Primary language: Uses standard product iterator
   - Secondary language: Fetches products with translations
3. **URL Generation**: Creates language-specific product URLs
4. **XML Assembly**: Builds XML with translated content and proper formatting

## Supported Languages

The system supports all languages available in the Shopify store's Markets configuration:

- **European Languages**: English, Spanish, French, German, Italian, Portuguese, Polish, Dutch, Swedish, Danish, Norwegian, Finnish, Russian, Czech, Hungarian, Romanian, Bulgarian, Croatian, Slovak, Slovenian, Estonian, Latvian, Lithuanian, Ukrainian, Greek
- **Asian Languages**: Japanese, Korean, Chinese, Hindi, Thai, Vietnamese, Indonesian, Malay, Filipino, Bengali, Tamil, Telugu, Malayalam, Kannada, Gujarati, Punjabi
- **African Languages**: Arabic, Swahili, Zulu, Afrikaans, Amharic, Yoruba, Igbo, Hausa, Somali
- **Other Languages**: Hebrew, Turkish, Persian, Georgian, Armenian, Azerbaijani, Belarusian, Bosnian, Catalan, Welsh, Basque, Galician, Icelandic, Irish, Macedonian, Maltese, Mongolian, Serbian, Urdu, Uzbek

## Usage Examples

### Creating a Polish Feed
```typescript
const feed = await FeedRepository.create({
  shopId: shop.id,
  name: "Google Shopping Poland",
  channel: "google",
  type: "products",
  language: "pl",
  country: "PL",
  currency: "EUR",
  fileType: "xml",
  timezone: "Europe/Warsaw",
  targetMarkets: ["PL"],
  publicPath: "feeds/polish-feed.xml",
  publicUrl: "https://cdn.example.com/feeds/polish-feed.xml",
  token: crypto.randomUUID()
});
```

### Generating Translated XML
```typescript
// The system automatically detects language and fetches translations
await generateGoogleXML({ 
  feedId: feed.id, 
  request // Request context for language-specific API calls
});
```

## Benefits

1. **Global Reach**: Serve customers in their native language
2. **Better SEO**: Language-specific URLs improve search rankings
3. **Improved Conversion**: Localized content increases purchase likelihood
4. **Compliance**: Meets regional requirements for product information
5. **Scalability**: Easy to add new languages as business expands

## Technical Considerations

1. **Performance**: Translations are cached to minimize API calls
2. **Fallback Strategy**: Graceful degradation to primary language if translations fail
3. **URL Structure**: Follows Shopify's internationalization patterns
4. **Currency Handling**: Supports local currencies and proper formatting
5. **Error Handling**: Comprehensive error handling for translation failures
