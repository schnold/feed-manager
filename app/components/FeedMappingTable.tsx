import { useState, useCallback } from "react";
import {
  DataTable,
  TextField,
  Select,
  Button,
  BlockStack,
  Text,
  InlineStack,
  Icon
} from "@shopify/polaris";
import { EditIcon, DeleteIcon, DatabaseIcon } from "@shopify/polaris-icons";

export interface FieldMapping {
  id: string;
  column: string;
  method: 'shopify' | 'set' | 'rule';
  field: string;
  fieldLabel: string;
  value?: string;
  ruleCount?: number;
}

interface FeedMappingTableProps {
  mappings: FieldMapping[];
  onMappingsChange: (mappings: FieldMapping[]) => void;
}

// Default field mappings based on the template
const DEFAULT_MAPPINGS: FieldMapping[] = [
  { id: '1', column: 'id', method: 'shopify', field: 'variant.id', fieldLabel: 'Variant ID' },
  { id: '2', column: 'item_group_id', method: 'shopify', field: 'product.id', fieldLabel: 'Product ID' },
  { id: '3', column: 'title', method: 'shopify', field: 'product.title', fieldLabel: 'Title' },
  { id: '4', column: 'description', method: 'shopify', field: 'product.description', fieldLabel: 'Description' },
  { id: '5', column: 'link', method: 'shopify', field: 'product.url', fieldLabel: 'Link' },
  { id: '6', column: 'image_link', method: 'shopify', field: 'image.url', fieldLabel: 'Featured image' },
  { id: '7', column: 'availability', method: 'shopify', field: 'variant.availableForSale', fieldLabel: 'Availability' },
  { id: '8', column: 'price', method: 'shopify', field: 'variant.compareAtPrice', fieldLabel: 'Compare at price' },
  { id: '9', column: 'sale_price', method: 'rule', field: '', fieldLabel: '', ruleCount: 1 },
  { id: '10', column: 'google_product_category', method: 'shopify', field: 'product.productType', fieldLabel: 'Category' },
  { id: '11', column: 'product_type', method: 'shopify', field: 'product.productType', fieldLabel: 'Product type' },
  { id: '12', column: 'brand', method: 'shopify', field: 'product.vendor', fieldLabel: 'Vendor' },
  { id: '13', column: 'gtin', method: 'shopify', field: 'variant.barcode', fieldLabel: 'Barcode' },
  { id: '14', column: 'mpn', method: 'shopify', field: 'variant.sku', fieldLabel: 'SKU' },
  { id: '15', column: 'identifier_exists', method: 'rule', field: '', fieldLabel: '', ruleCount: 1 },
  { id: '16', column: 'condition', method: 'set', field: '', fieldLabel: '', value: 'new' },
];

export function FeedMappingTable({ mappings, onMappingsChange }: FeedMappingTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [localMappings, setLocalMappings] = useState<FieldMapping[]>(
    mappings.length > 0 ? mappings : DEFAULT_MAPPINGS
  );

  const methodOptions = [
    { label: "Method", value: "", disabled: true },
    { label: "From shopify field", value: "shopify" },
    { label: "Set to value", value: "set" },
    { label: "Feed rule", value: "rule" }
  ];

  const handleColumnChange = useCallback((id: string, value: string) => {
    const updated = localMappings.map(m =>
      m.id === id ? { ...m, column: value } : m
    );
    setLocalMappings(updated);
    onMappingsChange(updated);
  }, [localMappings, onMappingsChange]);

  const handleMethodChange = useCallback((id: string, value: string) => {
    const updated = localMappings.map(m =>
      m.id === id ? { ...m, method: value as 'shopify' | 'set' | 'rule' } : m
    );
    setLocalMappings(updated);
    onMappingsChange(updated);
  }, [localMappings, onMappingsChange]);

  const handleFieldChange = useCallback((id: string, value: string) => {
    const updated = localMappings.map(m =>
      m.id === id ? { ...m, fieldLabel: value } : m
    );
    setLocalMappings(updated);
    onMappingsChange(updated);
  }, [localMappings, onMappingsChange]);

  const handleValueChange = useCallback((id: string, value: string) => {
    const updated = localMappings.map(m =>
      m.id === id ? { ...m, value } : m
    );
    setLocalMappings(updated);
    onMappingsChange(updated);
  }, [localMappings, onMappingsChange]);

  const handleDelete = useCallback((id: string) => {
    const updated = localMappings.filter(m => m.id !== id);
    setLocalMappings(updated);
    onMappingsChange(updated);
  }, [localMappings, onMappingsChange]);

  const handleAddField = useCallback(() => {
    const newMapping: FieldMapping = {
      id: `new-${Date.now()}`,
      column: '',
      method: 'shopify',
      field: '',
      fieldLabel: ''
    };
    const updated = [...localMappings, newMapping];
    setLocalMappings(updated);
    onMappingsChange(updated);
  }, [localMappings, onMappingsChange]);

  const rows = localMappings.map((mapping) => {
    const isEditing = editingId === mapping.id;

    return [
      // Column name
      <TextField
        key={`col-${mapping.id}`}
        value={mapping.column}
        onChange={(value) => handleColumnChange(mapping.id, value)}
        autoComplete="off"
        labelHidden
        label="Column"
      />,
      // Method
      <Select
        key={`method-${mapping.id}`}
        options={methodOptions}
        value={mapping.method}
        onChange={(value) => handleMethodChange(mapping.id, value)}
        label="Method"
        labelHidden
      />,
      // Field
      mapping.method === 'shopify' ? (
        <div key={`field-${mapping.id}`} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon source={DatabaseIcon} />
          <TextField
            value={mapping.fieldLabel}
            onChange={(value) => handleFieldChange(mapping.id, value)}
            placeholder="Field"
            autoComplete="off"
            labelHidden
            label="Field"
          />
        </div>
      ) : mapping.method === 'set' ? (
        <TextField
          key={`value-${mapping.id}`}
          value={mapping.value || ''}
          onChange={(value) => handleValueChange(mapping.id, value)}
          autoComplete="off"
          labelHidden
          label="Value"
        />
      ) : mapping.method === 'rule' ? (
        <Button
          key={`rule-${mapping.id}`}
          onClick={() => {/* TODO: Open rule editor */}}
        >
          Add rules ({mapping.ruleCount || 0})
        </Button>
      ) : null,
      // Edit button
      <Button
        key={`edit-${mapping.id}`}
        variant="secondary"
        onClick={() => setEditingId(isEditing ? null : mapping.id)}
        icon={EditIcon}
      />,
      // Delete button
      <Button
        key={`delete-${mapping.id}`}
        variant="secondary"
        onClick={() => handleDelete(mapping.id)}
        icon={DeleteIcon}
        tone="critical"
      />
    ];
  });

  return (
    <BlockStack gap="400">
      <BlockStack gap="200">
        <Text as="p" variant="bodyMd">
          In this step, you can adjust your feed mappings and the feed rules. In the next step ( Filters ), you can choose whether you want to include all products or filter on certain rules.
        </Text>
        <Text as="h2" variant="headingMd">Feed mappings</Text>
      </BlockStack>

      <DataTable
        columnContentTypes={[
          'text',
          'text',
          'text',
          'text',
          'text',
        ]}
        headings={[
          'Column name',
          'How',
          'Field',
          '',
          '',
        ]}
        rows={rows}
        hoverable
      />

      <InlineStack align="space-between">
        <Button onClick={handleAddField}>+ Add field</Button>
        <InlineStack gap="200">
          <Button variant="primary">Save</Button>
          <Button>Filters</Button>
        </InlineStack>
      </InlineStack>
    </BlockStack>
  );
}
