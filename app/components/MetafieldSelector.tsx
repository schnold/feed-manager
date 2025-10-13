import {
  Autocomplete,
  ResourceList,
  ResourceItem,
  OptionList,
  Text,
  Badge,
  Icon,
  Divider,
  Box,
  InlineStack,
  BlockStack,
  TextField
} from "@shopify/polaris";
import { useState, useCallback, useMemo } from "react";
import { SearchIcon, ProductIcon } from "@shopify/polaris-icons";

interface MetafieldDefinition {
  id: string;
  name: string;
  namespace: string;
  key: string;
  type: string;
  description?: string;
  ownerType: 'PRODUCT' | 'VARIANT' | 'CUSTOMER' | 'ORDER';
}

interface ShopifyField {
  id: string;
  name: string;
  category: string;
  type: string;
  description?: string;
}

interface MetafieldSelectorProps {
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  helpText?: string;
  selectedField?: string;
  onFieldSelect?: (field: { type: 'shopify' | 'metafield'; value: string; label: string }) => void;
  metafieldDefinitions?: MetafieldDefinition[];
  isLoading?: boolean;
}

export function MetafieldSelector({
  label,
  value,
  onChange,
  helpText,
  selectedField,
  onFieldSelect,
  metafieldDefinitions = [],
  isLoading = false
}: MetafieldSelectorProps) {
  // If used as a simple TextField-like component
  if (label && onChange && !onFieldSelect) {
    return (
      <TextField
        label={label}
        value={value || ''}
        onChange={onChange}
        helpText={helpText}
        autoComplete="off"
      />
    );
  }

  const [query, setQuery] = useState('');
  const [selectedView, setSelectedView] = useState<'shopify' | 'metafields' | 'browse'>('shopify');

  // Default Shopify fields organized by category
  const shopifyFields: ShopifyField[] = [
    // Product fields
    { id: 'product.id', name: 'Product ID', category: 'Product', type: 'string', description: 'Unique product identifier' },
    { id: 'product.title', name: 'Product Title', category: 'Product', type: 'string', description: 'Product name' },
    { id: 'product.description', name: 'Product Description', category: 'Product', type: 'string', description: 'Product description' },
    { id: 'product.handle', name: 'Product Handle', category: 'Product', type: 'string', description: 'URL handle' },
    { id: 'product.vendor', name: 'Vendor', category: 'Product', type: 'string', description: 'Product vendor/brand' },
    { id: 'product.productType', name: 'Product Type', category: 'Product', type: 'string', description: 'Product category' },
    { id: 'product.tags', name: 'Tags', category: 'Product', type: 'array', description: 'Product tags' },
    { id: 'product.status', name: 'Status', category: 'Product', type: 'string', description: 'Product status' },
    { id: 'product.createdAt', name: 'Created Date', category: 'Product', type: 'date', description: 'Product creation date' },
    { id: 'product.updatedAt', name: 'Updated Date', category: 'Product', type: 'date', description: 'Last updated date' },
    
    // Variant fields
    { id: 'variant.id', name: 'Variant ID', category: 'Variant', type: 'string', description: 'Unique variant identifier' },
    { id: 'variant.title', name: 'Variant Title', category: 'Variant', type: 'string', description: 'Variant name' },
    { id: 'variant.sku', name: 'SKU', category: 'Variant', type: 'string', description: 'Stock keeping unit' },
    { id: 'variant.barcode', name: 'Barcode', category: 'Variant', type: 'string', description: 'Product barcode' },
    { id: 'variant.price', name: 'Price', category: 'Variant', type: 'number', description: 'Variant price' },
    { id: 'variant.compareAtPrice', name: 'Compare at Price', category: 'Variant', type: 'number', description: 'Original price' },
    { id: 'variant.weight', name: 'Weight', category: 'Variant', type: 'number', description: 'Product weight' },
    { id: 'variant.weightUnit', name: 'Weight Unit', category: 'Variant', type: 'string', description: 'Weight measurement unit' },
    { id: 'variant.inventoryQuantity', name: 'Inventory Quantity', category: 'Variant', type: 'number', description: 'Available quantity' },
    { id: 'variant.inventoryManagement', name: 'Inventory Management', category: 'Variant', type: 'string', description: 'Inventory tracking method' },
    { id: 'variant.availableForSale', name: 'Available for Sale', category: 'Variant', type: 'boolean', description: 'Sale availability' },
    
    // Image fields
    { id: 'image.url', name: 'Featured Image URL', category: 'Images', type: 'string', description: 'Main product image' },
    { id: 'image.altText', name: 'Image Alt Text', category: 'Images', type: 'string', description: 'Image description' },
    { id: 'images.urls', name: 'All Image URLs', category: 'Images', type: 'array', description: 'All product images' },
    
    // SEO fields
    { id: 'seo.title', name: 'SEO Title', category: 'SEO', type: 'string', description: 'Page title for SEO' },
    { id: 'seo.description', name: 'SEO Description', category: 'SEO', type: 'string', description: 'Meta description' },
  ];

  // Filter options based on query
  const filteredShopifyFields = useMemo(() => {
    if (!query) return shopifyFields;
    return shopifyFields.filter(field =>
      field.name.toLowerCase().includes(query.toLowerCase()) ||
      field.category.toLowerCase().includes(query.toLowerCase()) ||
      field.description?.toLowerCase().includes(query.toLowerCase())
    );
  }, [query]);

  const filteredMetafields = useMemo(() => {
    if (!query) return metafieldDefinitions;
    return metafieldDefinitions.filter(metafield =>
      metafield.name.toLowerCase().includes(query.toLowerCase()) ||
      metafield.namespace.toLowerCase().includes(query.toLowerCase()) ||
      metafield.key.toLowerCase().includes(query.toLowerCase()) ||
      metafield.description?.toLowerCase().includes(query.toLowerCase())
    );
  }, [query, metafieldDefinitions]);

  // Group fields by category for OptionList
  const groupedShopifyFields = useMemo(() => {
    const groups = filteredShopifyFields.reduce((acc, field) => {
      if (!acc[field.category]) {
        acc[field.category] = [];
      }
      acc[field.category].push({
        value: field.id,
        label: field.name,
        disabled: false
      });
      return acc;
    }, {} as Record<string, Array<{ value: string; label: string; disabled: boolean }>>);

    return Object.entries(groups).map(([title, options]) => ({
      title,
      options
    }));
  }, [filteredShopifyFields]);

  // Group metafields by namespace
  const groupedMetafields = useMemo(() => {
    const groups = filteredMetafields.reduce((acc, metafield) => {
      if (!acc[metafield.namespace]) {
        acc[metafield.namespace] = [];
      }
      acc[metafield.namespace].push({
        value: `${metafield.namespace}.${metafield.key}`,
        label: `${metafield.name} (${metafield.key})`,
        disabled: false
      });
      return acc;
    }, {} as Record<string, Array<{ value: string; label: string; disabled: boolean }>>);

    return Object.entries(groups).map(([title, options]) => ({
      title,
      options
    }));
  }, [filteredMetafields]);

  const handleFieldSelect = useCallback((fieldId: string, type: 'shopify' | 'metafield') => {
    if (type === 'shopify') {
      const field = shopifyFields.find(f => f.id === fieldId);
      if (field) {
        onFieldSelect({
          type: 'shopify',
          value: fieldId,
          label: field.name
        });
      }
    } else {
      const metafield = metafieldDefinitions.find(m => `${m.namespace}.${m.key}` === fieldId);
      if (metafield) {
        onFieldSelect({
          type: 'metafield',
          value: fieldId,
          label: metafield.name
        });
      }
    }
  }, [shopifyFields, metafieldDefinitions, onFieldSelect]);

  const getFieldTypeBadge = (type: string) => {
    const badgeProps = {
      'string': { tone: 'info' as const, children: 'Text' },
      'number': { tone: 'success' as const, children: 'Number' },
      'boolean': { tone: 'attention' as const, children: 'Boolean' },
      'array': { tone: 'warning' as const, children: 'List' },
      'date': { tone: 'critical' as const, children: 'Date' },
      'json': { tone: 'new' as const, children: 'JSON' },
    };
    return <Badge {...(badgeProps[type] || { children: type })} />;
  };

  return (
    <BlockStack gap="400">
      {/* Search */}
      <TextField
        value={query}
        onChange={setQuery}
        placeholder="Search for fields..."
        prefix={<Icon source={SearchIcon} />}
        clearButton
        onClearButtonClick={() => setQuery('')}
        autoComplete="off"
      />

      {/* View Toggle */}
      <InlineStack gap="200">
        <button
          onClick={() => setSelectedView('shopify')}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            background: selectedView === 'shopify' ? '#f3f4f6' : 'white',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Shopify Fields ({filteredShopifyFields.length})
        </button>
        <button
          onClick={() => setSelectedView('metafields')}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            background: selectedView === 'metafields' ? '#f3f4f6' : 'white',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Metafields ({filteredMetafields.length})
        </button>
        <button
          onClick={() => setSelectedView('browse')}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            background: selectedView === 'browse' ? '#f3f4f6' : 'white',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Browse All
        </button>
      </InlineStack>

      <Divider />

      {/* Content based on selected view */}
      {selectedView === 'shopify' && (
        <Box maxHeight="300px" style={{ overflow: 'auto' }}>
          <OptionList
            title="Shopify Fields"
            options={groupedShopifyFields}
            selected={selectedField ? [selectedField] : []}
            onChange={(selected) => {
              if (selected.length > 0) {
                handleFieldSelect(selected[0], 'shopify');
              }
            }}
          />
        </Box>
      )}

      {selectedView === 'metafields' && (
        <Box maxHeight="300px" style={{ overflow: 'auto' }}>
          {groupedMetafields.length > 0 ? (
            <OptionList
              title="Metafields"
              options={groupedMetafields}
              selected={selectedField ? [selectedField] : []}
              onChange={(selected) => {
                if (selected.length > 0) {
                  handleFieldSelect(selected[0], 'metafield');
                }
              }}
            />
          ) : (
            <Box padding="400">
              <Text as="p" tone="subdued" alignment="center">
                No metafields found. Try adjusting your search or create metafields in your Shopify admin.
              </Text>
            </Box>
          )}
        </Box>
      )}

      {selectedView === 'browse' && (
        <Box maxHeight="400px" style={{ overflow: 'auto' }}>
          <ResourceList
            items={[
              ...filteredShopifyFields.map(field => ({
                id: field.id,
                name: field.name,
                category: field.category,
                type: field.type,
                description: field.description,
                source: 'shopify' as const
              })),
              ...filteredMetafields.map(metafield => ({
                id: `${metafield.namespace}.${metafield.key}`,
                name: metafield.name,
                category: metafield.namespace,
                type: metafield.type,
                description: metafield.description,
                source: 'metafield' as const
              }))
            ]}
            renderItem={(item) => {
              const { id, name, category, type, description, source } = item;
              return (
                <ResourceItem
                  id={id}
                  onClick={() => handleFieldSelect(id, source)}
                  media={<Icon source={ProductIcon} />}
                >
                  <InlineStack align="space-between">
                    <BlockStack gap="100">
                      <Text variant="bodyMd" fontWeight="medium" as="h3">
                        {name}
                      </Text>
                      <Text variant="bodySm" tone="subdued" as="p">
                        {category} • {description || 'No description'}
                      </Text>
                    </BlockStack>
                    <InlineStack gap="200">
                      {getFieldTypeBadge(type)}
                      <Badge tone={source === 'shopify' ? 'info' : 'success'}>
                        {source === 'shopify' ? 'Shopify' : 'Metafield'}
                      </Badge>
                    </InlineStack>
                  </InlineStack>
                </ResourceItem>
              );
            }}
          />
        </Box>
      )}
    </BlockStack>
  );
}