import { useState, useCallback, useEffect } from "react";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { LanguageSelector, type ShopLocale } from "./LanguageSelector";
import {
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  Banner,
  Checkbox,
  TextContainer,
  Divider,
  Collapsible,
  ButtonGroup,
  InlineStack,
  BlockStack
} from "@shopify/polaris";

export interface FeedFormData {
  id?: string;
  name: string;
  title?: string;
  channel: string;
  language: string;
  country: string;
  currency: string;
  timezone: string;
  targetMarkets: string[];
  settings?: {
    includeOutOfStock?: boolean;
    includeDraftProducts?: boolean;
    maxProducts?: number;
    customFields?: Record<string, string>;
  };
}

interface FeedFormProps {
  locales: ShopLocale[];
  feed?: FeedFormData;
  isEdit?: boolean;
  onSubmit?: (data: FeedFormData) => void;
}

export function FeedForm({ locales, feed, isEdit = false, onSubmit }: FeedFormProps) {
  const actionData = useActionData<any>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Form state
  const [formData, setFormData] = useState<FeedFormData>({
    name: feed?.name || "",
    title: feed?.title || "",
    channel: feed?.channel || "google",
    language: feed?.language || "en",
    country: feed?.country || "US",
    currency: feed?.currency || "local",
    timezone: feed?.timezone || "UTC",
    targetMarkets: feed?.targetMarkets || [],
    settings: {
      includeOutOfStock: feed?.settings?.includeOutOfStock || false,
      includeDraftProducts: feed?.settings?.includeDraftProducts || false,
      maxProducts: feed?.settings?.maxProducts || 1000,
      customFields: feed?.settings?.customFields || {},
      ...feed?.settings
    }
  });

  // UI state
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Update form data when feed prop changes
  useEffect(() => {
    if (feed) {
      setFormData({
        name: feed.name || "",
        title: feed.title || "",
        channel: feed.channel || "google",
        language: feed.language || "en",
        country: feed.country || "US",
        currency: feed.currency || "local",
        timezone: feed.timezone || "UTC",
        targetMarkets: feed.targetMarkets || [],
        settings: {
          includeOutOfStock: feed.settings?.includeOutOfStock || false,
          includeDraftProducts: feed.settings?.includeDraftProducts || false,
          maxProducts: feed.settings?.maxProducts || 1000,
          customFields: feed.settings?.customFields || {},
          ...feed.settings
        }
      });
    }
  }, [feed]);

  // Form handlers
  const handleNameChange = useCallback((value: string) => {
    setFormData(prev => ({ ...prev, name: value }));
  }, []);

  const handleTitleChange = useCallback((value: string) => {
    setFormData(prev => ({ ...prev, title: value }));
  }, []);

  const handleChannelChange = useCallback((value: string) => {
    setFormData(prev => ({ ...prev, channel: value }));
  }, []);

  const handleLanguageChange = useCallback((value: string) => {
    setFormData(prev => ({ ...prev, language: value }));
  }, []);

  const handleCountryChange = useCallback((value: string) => {
    setFormData(prev => ({ ...prev, country: value }));
  }, []);

  const handleCurrencyChange = useCallback((value: string) => {
    setFormData(prev => ({ ...prev, currency: value }));
  }, []);

  const handleTimezoneChange = useCallback((value: string) => {
    setFormData(prev => ({ ...prev, timezone: value }));
  }, []);

  const handleIncludeOutOfStockChange = useCallback((checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        includeOutOfStock: checked
      }
    }));
  }, []);

  const handleIncludeDraftProductsChange = useCallback((checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        includeDraftProducts: checked
      }
    }));
  }, []);

  const handleMaxProductsChange = useCallback((value: string) => {
    const numValue = parseInt(value) || 1000;
    setFormData(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        maxProducts: numValue
      }
    }));
  }, []);

  const handleCustomFieldChange = useCallback((key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        customFields: {
          ...prev.settings?.customFields,
          [key]: value
        }
      }
    }));
  }, []);

  const addCustomField = useCallback(() => {
    const key = `custom_${Date.now()}`;
    handleCustomFieldChange(key, "");
  }, [handleCustomFieldChange]);

  const removeCustomField = useCallback((key: string) => {
    setFormData(prev => {
      const customFields = { ...prev.settings?.customFields };
      delete customFields[key];
      return {
        ...prev,
        settings: {
          ...prev.settings,
          customFields
        }
      };
    });
  }, []);

  // Options
  const channelOptions = [
    { label: "Google Shopping", value: "google" },
    { label: "Facebook", value: "facebook" },
    { label: "Microsoft Advertising", value: "microsoft" },
    { label: "Pinterest", value: "pinterest" },
    { label: "Snapchat", value: "snapchat" },
    { label: "TikTok", value: "tiktok" }
  ];

  const countryOptions = [
    { label: "United States", value: "US" },
    { label: "Canada", value: "CA" },
    { label: "United Kingdom", value: "GB" },
    { label: "Germany", value: "DE" },
    { label: "France", value: "FR" },
    { label: "Spain", value: "ES" },
    { label: "Poland", value: "PL" },
    { label: "Italy", value: "IT" },
    { label: "Netherlands", value: "NL" },
    { label: "Sweden", value: "SE" },
    { label: "Denmark", value: "DK" },
    { label: "Norway", value: "NO" },
    { label: "Finland", value: "FI" },
    { label: "Australia", value: "AU" },
    { label: "Japan", value: "JP" },
    { label: "South Korea", value: "KR" },
    { label: "China", value: "CN" },
    { label: "India", value: "IN" },
    { label: "Brazil", value: "BR" },
    { label: "Mexico", value: "MX" }
  ];

  const currencyOptions = [
    { label: "Local Currency", value: "local" },
    { label: "USD", value: "USD" },
    { label: "EUR", value: "EUR" },
    { label: "GBP", value: "GBP" },
    { label: "CAD", value: "CAD" },
    { label: "PLN", value: "PLN" },
    { label: "SEK", value: "SEK" },
    { label: "DKK", value: "DKK" },
    { label: "NOK", value: "NOK" },
    { label: "JPY", value: "JPY" },
    { label: "KRW", value: "KRW" },
    { label: "CNY", value: "CNY" },
    { label: "INR", value: "INR" },
    { label: "BRL", value: "BRL" },
    { label: "MXN", value: "MXN" }
  ];

  const timezoneOptions = [
    { label: "UTC", value: "UTC" },
    { label: "America/New_York", value: "America/New_York" },
    { label: "America/Chicago", value: "America/Chicago" },
    { label: "America/Denver", value: "America/Denver" },
    { label: "America/Los_Angeles", value: "America/Los_Angeles" },
    { label: "Europe/London", value: "Europe/London" },
    { label: "Europe/Paris", value: "Europe/Paris" },
    { label: "Europe/Berlin", value: "Europe/Berlin" },
    { label: "Europe/Warsaw", value: "Europe/Warsaw" },
    { label: "Europe/Rome", value: "Europe/Rome" },
    { label: "Europe/Madrid", value: "Europe/Madrid" },
    { label: "Asia/Tokyo", value: "Asia/Tokyo" },
    { label: "Asia/Seoul", value: "Asia/Seoul" },
    { label: "Asia/Shanghai", value: "Asia/Shanghai" },
    { label: "Australia/Sydney", value: "Australia/Sydney" }
  ];

  const handleSubmit = useCallback((event: React.FormEvent) => {
    if (onSubmit) {
      event.preventDefault();
      onSubmit(formData);
    }
  }, [formData, onSubmit]);

  // Validation
  const isFormValid = formData.name.trim() !== "" && 
                     formData.channel !== "" && 
                     formData.language !== "" && 
                     formData.country !== "";

  const getFieldError = (field: string) => {
    if (!actionData?.fieldErrors) return null;
    return actionData.fieldErrors[field];
  };

  return (
    <Card>
      <Form method="post" onSubmit={handleSubmit}>
        <FormLayout>
          {/* Error Banner */}
          {actionData?.error && (
            <Banner status="critical">{actionData.error}</Banner>
          )}

          {/* Success Banner */}
          {actionData?.success && (
            <Banner status="success">{actionData.success}</Banner>
          )}

          {/* Basic Information */}
          <TextContainer>
            <h2>Basic Information</h2>
            <p>Configure the basic settings for your product feed.</p>
          </TextContainer>

          <TextField
            label="Feed Name"
            value={formData.name}
            onChange={handleNameChange}
            name="name"
            autoComplete="off"
            placeholder="e.g., Google Shopping US"
            helpText="Choose a descriptive name for your feed"
            requiredIndicator
            error={getFieldError("name")}
          />

          <TextField
            label="Display Title"
            value={formData.title}
            onChange={handleTitleChange}
            name="title"
            autoComplete="off"
            placeholder="e.g., Google Shopping - United States"
            helpText="Optional display title for the feed (used in XML channel title)"
          />

          <Select
            label="Channel"
            options={channelOptions}
            value={formData.channel}
            onChange={handleChannelChange}
            name="channel"
            helpText="Select the advertising platform for this feed"
          />

          <FormLayout.Group>
            <div>
              <LanguageSelector
                locales={locales}
                selectedLanguage={formData.language}
                onLanguageChange={handleLanguageChange}
              />
              <input type="hidden" name="language" value={formData.language} />
            </div>

            <Select
              label="Country"
              options={countryOptions}
              value={formData.country}
              onChange={handleCountryChange}
              name="country"
              helpText="Target country for this feed"
            />
          </FormLayout.Group>

          <FormLayout.Group>
            <Select
              label="Currency"
              options={currencyOptions}
              value={formData.currency}
              onChange={handleCurrencyChange}
              name="currency"
              helpText="Currency for product prices"
            />

            <Select
              label="Timezone"
              options={timezoneOptions}
              value={formData.timezone}
              onChange={handleTimezoneChange}
              name="timezone"
              helpText="Timezone for feed generation"
            />
          </FormLayout.Group>

          {/* Advanced Settings */}
          <Divider />
          
          <BlockStack>
            <Button
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              disclosure={showAdvancedSettings ? "up" : "down"}
              variant="plain"
            >
              Advanced Settings
            </Button>
          </BlockStack>

          <Collapsible
            open={showAdvancedSettings}
            id="advanced-settings"
            transition={{ duration: "200ms", timingFunction: "ease-in-out" }}
          >
            <FormLayout>
              <TextContainer>
                <p>Configure advanced options for your feed generation.</p>
              </TextContainer>

              <Checkbox
                label="Include out of stock products"
                checked={formData.settings?.includeOutOfStock || false}
                onChange={handleIncludeOutOfStockChange}
                name="includeOutOfStock"
                helpText="Include products that are currently out of stock"
              />

              <Checkbox
                label="Include draft products"
                checked={formData.settings?.includeDraftProducts || false}
                onChange={handleIncludeDraftProductsChange}
                name="includeDraftProducts"
                helpText="Include products that are in draft status"
              />

              <TextField
                label="Maximum products"
                type="number"
                value={formData.settings?.maxProducts?.toString() || "1000"}
                onChange={handleMaxProductsChange}
                name="maxProducts"
                helpText="Maximum number of products to include in the feed"
                min={1}
                max={10000}
              />

              {/* Custom Fields */}
              <TextContainer>
                <h3>Custom Fields</h3>
                <p>Add custom fields to include in your feed.</p>
              </TextContainer>

              {Object.entries(formData.settings?.customFields || {}).map(([key, value]) => (
                <FormLayout.Group key={key}>
                  <TextField
                    label="Field Name"
                    value={key}
                    onChange={() => {}} // Read-only for now
                    disabled
                  />
                  <TextField
                    label="Field Value"
                    value={value}
                    onChange={(newValue) => handleCustomFieldChange(key, newValue)}
                    placeholder="Enter field value"
                  />
                  <div style={{ display: "flex", alignItems: "end", paddingBottom: "8px" }}>
                    <Button
                      variant="plain"
                      onClick={() => removeCustomField(key)}
                      destructive
                    >
                      Remove
                    </Button>
                  </div>
                </FormLayout.Group>
              ))}

              <Button
                variant="plain"
                onClick={addCustomField}
              >
                Add Custom Field
              </Button>
            </FormLayout>
          </Collapsible>

          {/* Hidden fields for settings */}
          <input type="hidden" name="settings" value={JSON.stringify(formData.settings)} />

          {/* Action Buttons */}
          <InlineStack align="end">
            <ButtonGroup>
              {isEdit && (
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSubmitting}
                >
                  Delete Feed
                </Button>
              )}
              
              <Button
                submit
                variant="primary"
                loading={isSubmitting}
                disabled={!isFormValid}
              >
                {isEdit ? "Save Changes" : "Create Feed"}
              </Button>
            </ButtonGroup>
          </InlineStack>
        </FormLayout>
      </Form>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div style={{ marginTop: "1rem" }}>
          <Banner status="warning">
            <p>Are you sure you want to delete this feed? This action cannot be undone.</p>
            <InlineStack>
              <Form method="post" action={`/api/feeds/${formData.id}/delete`}>
                <input type="hidden" name="_action" value="delete" />
                <Button
                  submit
                  variant="destructive"
                >
                  Yes, Delete Feed
                </Button>
              </Form>
              <Button
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
            </InlineStack>
          </Banner>
        </div>
      )}
    </Card>
  );
}
