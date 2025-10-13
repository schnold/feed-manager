import {
  Card,
  Text,
  TextField,
  Select,
  Button,
  DataTable,
  Badge,
  Modal,
  FormLayout,
  InlineStack,
  BlockStack,
  Box,
  Divider,
  ButtonGroup,
  Tooltip
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { EditIcon, DeleteIcon, PlusIcon } from "@shopify/polaris-icons";
import { MetafieldSelector } from "./MetafieldSelector";

interface CustomField {
  id: string;
  column: string;
  method: 'shopifyField' | 'setValue' | 'feedRule';
  fieldValue: string;
  fieldLabel?: string;
  fieldType?: 'shopify' | 'metafield';
  ruleSet?: any;
}

interface CustomFieldEditorProps {
  existingFields?: CustomField[];
  onFieldsChange?: (fields: CustomField[]) => void;
  shopifyFields?: Array<{ label: string; value: string }>;
  availableRules?: Array<{ label: string; value: string }>;
}

export function CustomFieldEditor({
  existingFields = [],
  onFieldsChange,
  shopifyFields = [],
  availableRules = []
}: CustomFieldEditorProps) {
  const [fields, setFields] = useState<CustomField[]>(existingFields);
  const [showModal, setShowModal] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [formData, setFormData] = useState({
    column: '',
    method: 'shopifyField' as CustomField['method'],
    fieldValue: '',
    fieldLabel: '',
    fieldType: 'shopify' as 'shopify' | 'metafield',
    ruleSet: null
  });

  const defaultShopifyFields = [
    { label: 'Variant ID', value: 'variantId' },
    { label: 'Product ID', value: 'productId' },
    { label: 'Title', value: 'title' },
    { label: 'Description', value: 'description' },
    { label: 'Price', value: 'price' },
    { label: 'Compare at price', value: 'compareAtPrice' },
    { label: 'SKU', value: 'sku' },
    { label: 'Barcode', value: 'barcode' },
    { label: 'Vendor', value: 'vendor' },
    { label: 'Product type', value: 'productType' },
    { label: 'Category', value: 'category' },
    { label: 'Tags', value: 'tags' },
    { label: 'Weight', value: 'weight' },
    { label: 'Featured image', value: 'featuredImage' },
    { label: 'Availability', value: 'availability' },
    { label: 'Inventory quantity', value: 'inventoryQuantity' },
    ...shopifyFields
  ];

  const defaultRules = [
    { label: 'Price calculation rule', value: 'priceCalculation' },
    { label: 'Availability rule', value: 'availabilityRule' },
    { label: 'Category mapping rule', value: 'categoryMapping' },
    { label: 'Identifier exists rule', value: 'identifierExists' },
    ...availableRules
  ];

  const methodOptions = [
    { label: 'From Shopify field', value: 'shopifyField' },
    { label: 'Set to value', value: 'setValue' },
    { label: 'Feed rule', value: 'feedRule' }
  ];

  const handleOpenModal = useCallback((field?: CustomField) => {
    if (field) {
      setEditingField(field);
      setFormData({
        column: field.column,
        method: field.method,
        fieldValue: field.fieldValue,
        fieldLabel: field.fieldLabel || '',
        fieldType: field.fieldType || 'shopify',
        ruleSet: field.ruleSet
      });
    } else {
      setEditingField(null);
      setFormData({
        column: '',
        method: 'shopifyField',
        fieldValue: '',
        fieldLabel: '',
        fieldType: 'shopify',
        ruleSet: null
      });
    }
    setShowModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setEditingField(null);
    setFormData({
      column: '',
      method: 'shopifyField',
      fieldValue: '',
      fieldLabel: '',
      fieldType: 'shopify',
      ruleSet: null
    });
  }, []);

  const handleSaveField = useCallback(() => {
    if (!formData.column.trim()) return;

    const newField: CustomField = {
      id: editingField?.id || `field_${Date.now()}`,
      column: formData.column,
      method: formData.method,
      fieldValue: formData.fieldValue,
      fieldLabel: formData.fieldLabel,
      fieldType: formData.fieldType,
      ruleSet: formData.ruleSet
    };

    let updatedFields;
    if (editingField) {
      updatedFields = fields.map(field => 
        field.id === editingField.id ? newField : field
      );
    } else {
      updatedFields = [...fields, newField];
    }

    setFields(updatedFields);
    onFieldsChange?.(updatedFields);
    handleCloseModal();
  }, [formData, editingField, fields, onFieldsChange, handleCloseModal]);

  const handleDeleteField = useCallback((fieldId: string) => {
    const updatedFields = fields.filter(field => field.id !== fieldId);
    setFields(updatedFields);
    onFieldsChange?.(updatedFields);
  }, [fields, onFieldsChange]);

  const getFieldDisplayValue = (field: CustomField) => {
    switch (field.method) {
      case 'shopifyField':
        return field.fieldLabel || field.fieldValue;
      case 'setValue':
        return field.fieldValue;
      case 'feedRule':
        const rule = defaultRules.find(r => r.value === field.fieldValue);
        return rule?.label || 'Custom rule';
      default:
        return field.fieldValue;
    }
  };

  const getMethodBadge = (method: CustomField['method']) => {
    switch (method) {
      case 'shopifyField':
        return <Badge status="info">Shopify Field</Badge>;
      case 'setValue':
        return <Badge status="success">Set Value</Badge>;
      case 'feedRule':
        return <Badge status="attention">Feed Rule</Badge>;
      default:
        return <Badge>{method}</Badge>;
    }
  };

  const tableRows = fields.map(field => [
    field.column,
    getMethodBadge(field.method),
    getFieldDisplayValue(field),
    <InlineStack key={field.id} gap="200">
      <Tooltip content="Edit field mapping">
        <Button
          size="micro"
          variant="tertiary"
          onClick={() => handleOpenModal(field)}
          icon={EditIcon}
          accessibilityLabel="Edit field"
        />
      </Tooltip>
      <Tooltip content="Delete field mapping">
        <Button
          size="micro"
          variant="tertiary"
          tone="critical"
          onClick={() => handleDeleteField(field.id)}
          icon={DeleteIcon}
          accessibilityLabel="Delete field"
        />
      </Tooltip>
    </InlineStack>
  ]);

  const handleFieldSelect = useCallback((selection: { type: 'shopify' | 'metafield'; value: string; label: string }) => {
    setFormData(prev => ({
      ...prev,
      fieldValue: selection.value,
      fieldLabel: selection.label,
      fieldType: selection.type
    }));
  }, []);

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="400">
          <InlineStack align="space-between">
            <BlockStack gap="100">
              <Text variant="headingSm" as="h3">Custom Field Mappings</Text>
              <Text as="p" tone="subdued">
                Add custom column mappings with rule sets and field assignments
              </Text>
            </BlockStack>
            <Button
              variant="primary"
              icon={PlusIcon}
              onClick={() => handleOpenModal()}
            >
              Add Custom Field
            </Button>
          </InlineStack>

          <Divider />

          {fields.length > 0 ? (
            <DataTable
              columnContentTypes={['text', 'text', 'text', 'text']}
              headings={['Column Name', 'Method', 'Field/Value', 'Actions']}
              rows={tableRows}
              footerContent={`${fields.length} custom field${fields.length === 1 ? '' : 's'} configured`}
            />
          ) : (
            <Box padding="800">
              <BlockStack gap="200" align="center">
                <Text as="p" tone="subdued" alignment="center">
                  No custom fields configured yet
                </Text>
                <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                  Create custom field mappings to extend your feed with additional product data
                </Text>
                <Button onClick={() => handleOpenModal()}>
                  Add Your First Custom Field
                </Button>
              </BlockStack>
            </Box>
          )}

          <Modal
            open={showModal}
            onClose={handleCloseModal}
            title={editingField ? 'Edit Custom Field' : 'Add Custom Field'}
            primaryAction={{
              content: editingField ? 'Save Changes' : 'Add Field',
              onAction: handleSaveField,
              disabled: !formData.column.trim() || (formData.method !== 'setValue' && !formData.fieldValue)
            }}
            secondaryActions={[{
              content: 'Cancel',
              onAction: handleCloseModal
            }]}
            large
          >
            <Modal.Section>
              <FormLayout>
                <FormLayout.Group>
                  <TextField
                    label="Column Name"
                    value={formData.column}
                    onChange={(value) => setFormData(prev => ({ ...prev, column: value }))}
                    placeholder="e.g., custom_label_0, product_rating"
                    helpText="The column name that will appear in your feed output"
                    autoComplete="off"
                  />

                  <Select
                    label="Mapping Method"
                    options={methodOptions}
                    value={formData.method}
                    onChange={(value) => setFormData(prev => ({ 
                      ...prev, 
                      method: value as CustomField['method'],
                      fieldValue: '',
                      fieldLabel: ''
                    }))}
                  />
                </FormLayout.Group>

                <Divider />

                {formData.method === 'shopifyField' && (
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h4">Select Field Source</Text>
                    <MetafieldSelector
                      selectedField={formData.fieldValue}
                      onFieldSelect={handleFieldSelect}
                      metafieldDefinitions={[]} // TODO: Add actual metafield definitions
                    />
                  </BlockStack>
                )}

                {formData.method === 'setValue' && (
                  <FormLayout.Group>
                    <TextField
                      label="Static Value"
                      value={formData.fieldValue}
                      onChange={(value) => setFormData(prev => ({ ...prev, fieldValue: value }))}
                      placeholder="Enter the static value"
                      helpText="This value will be used for all products in your feed"
                      autoComplete="off"
                    />
                  </FormLayout.Group>
                )}

                {formData.method === 'feedRule' && (
                  <FormLayout.Group>
                    <Select
                      label="Rule Set"
                      options={defaultRules}
                      value={formData.fieldValue}
                      onChange={(value) => setFormData(prev => ({ ...prev, fieldValue: value }))}
                      placeholder="Select a rule set"
                      helpText="Choose a predefined rule or create a custom transformation"
                    />
                  </FormLayout.Group>
                )}

                {formData.fieldLabel && (
                  <Box background="bg-surface-info" padding="300" borderRadius="200">
                    <InlineStack gap="200" align="center">
                      <Text variant="bodySm" tone="subdued">Selected:</Text>
                      <Badge tone="info">{formData.fieldLabel}</Badge>
                      <Text variant="bodySm" tone="subdued">
                        ({formData.fieldType === 'shopify' ? 'Shopify Field' : 'Metafield'})
                      </Text>
                    </InlineStack>
                  </Box>
                )}
              </FormLayout>
            </Modal.Section>
          </Modal>
        </BlockStack>
      </Box>
    </Card>
  );
}