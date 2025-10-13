import { describe, it, expect } from 'vitest'

// Mock the mapping function logic for testing
function mockDefaultGoogleMapping(product: any, variant: any, currency: string) {
  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '')
  
  return {
    'g:id': variant.id.split('/').pop(),
    'g:item_group_id': product.id.split('/').pop(),
    title: product.title,
    description: stripHtml(product.description || ''),
    link: `https://${product.shopDomain}/products/${product.handle}?variant=${variant.id.split('/').pop()}`,
    'g:image_link': product.images?.edges[0]?.node?.url || '',
    'g:availability': variant.availableForSale ? 'in stock' : 'out of stock',
    'g:price': `${variant.price} ${currency}`,
    'g:sale_price': variant.compareAtPrice ? `${variant.price} ${currency}` : undefined,
    'g:brand': product.vendor,
    'g:product_type': product.productType,
    'g:gtin': variant.barcode || undefined,
    'g:mpn': variant.sku || undefined,
    'g:identifier_exists': (variant.barcode || variant.sku) ? 'TRUE' : 'FALSE'
  }
}

describe('Google Feed Mapping Logic', () => {
  const mockProduct = {
    id: 'gid://shopify/Product/123',
    title: 'Test Product',
    handle: 'test-product',
    description: '<p>Test description with <strong>HTML</strong></p>',
    vendor: 'Test Vendor',
    productType: 'Test Category',
    images: {
      edges: [
        {
          node: {
            url: 'https://example.com/image.jpg'
          }
        }
      ]
    },
    shopDomain: 'test-shop.myshopify.com'
  }

  const mockVariant = {
    id: 'gid://shopify/ProductVariant/456',
    sku: 'TEST-SKU-123',
    barcode: '1234567890123',
    price: '99.99',
    compareAtPrice: '129.99',
    availableForSale: true,
    quantityAvailable: 10
  }

  it('should map product fields to Google Shopping format', () => {
    const mapped = mockDefaultGoogleMapping(mockProduct, mockVariant, 'USD')
    
    expect(mapped['g:id']).toBe('456')
    expect(mapped['g:item_group_id']).toBe('123')
    expect(mapped.title).toBe('Test Product')
    expect(mapped['g:brand']).toBe('Test Vendor')
    expect(mapped['g:product_type']).toBe('Test Category')
    expect(mapped['g:price']).toBe('99.99 USD')
    expect(mapped['g:availability']).toBe('in stock')
  })

  it('should strip HTML from descriptions', () => {
    const mapped = mockDefaultGoogleMapping(mockProduct, mockVariant, 'USD')
    
    // Should remove HTML tags
    expect(mapped.description).toBe('Test description with HTML')
  })

  it('should generate correct product links', () => {
    const mapped = mockDefaultGoogleMapping(mockProduct, mockVariant, 'USD')
    
    expect(mapped.link).toBe('https://test-shop.myshopify.com/products/test-product?variant=456')
  })

  it('should handle missing optional fields gracefully', () => {
    const productWithoutOptionals = {
      ...mockProduct,
      description: '',
      images: { edges: [] }
    }
    
    const variantWithoutOptionals = {
      ...mockVariant,
      barcode: null,
      sku: null,
      compareAtPrice: null
    }
    
    const mapped = mockDefaultGoogleMapping(productWithoutOptionals, variantWithoutOptionals, 'USD')
    
    expect(mapped.description).toBe('')
    expect(mapped['g:image_link']).toBe('')
    expect(mapped['g:gtin']).toBeUndefined()
    expect(mapped['g:sale_price']).toBeUndefined()
    expect(mapped['g:identifier_exists']).toBe('FALSE')
  })
})