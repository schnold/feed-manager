import { useState, useCallback, useEffect } from "react";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { LanguageSelector, type ShopLocale } from "./LanguageSelector";
import { FeedMappingTable, type FieldMapping } from "./FeedMappingTable";
import {
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  Banner,
  Checkbox,
  Text,
  Divider,
  ButtonGroup,
  InlineStack,
  BlockStack,
  Tabs,
  Layout,
  Box
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

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
  locationId?: string;
  settings?: {
    includeOutOfStock?: boolean;
    includeDraftProducts?: boolean;
    customFields?: Record<string, string>;
    fieldMappings?: Record<string, string>;
    fieldMappingsArray?: FieldMapping[];
    filters?: {
      collections?: Array<{id: string; title: string}>;
      products?: Array<{id: string; title: string}>;
      tags?: string[];
      priceRange?: { min?: number; max?: number };
      availability?: string;
    };
  };
}

interface EnhancedTabbedFeedFormProps {
  locales: ShopLocale[];
  feed?: FeedFormData;
  isEdit?: boolean;
  onSubmit?: (data: FeedFormData) => void;
  locations?: Array<{id: string; name: string}>;
}

type TabType = 'info' | 'settings' | 'mapping' | 'filters';

export function EnhancedTabbedFeedForm({
  locales,
  feed,
  isEdit = false,
  onSubmit,
  locations = []
}: EnhancedTabbedFeedFormProps) {
  const actionData = useActionData<any>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const shopify = useAppBridge();

  // Tab state
  const [activeTab, setActiveTab] = useState<number>(0);

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
    locationId: feed?.locationId || locations[0]?.id || "",
    settings: {
      includeOutOfStock: feed?.settings?.includeOutOfStock || false,
      includeDraftProducts: feed?.settings?.includeDraftProducts || false,
      customFields: feed?.settings?.customFields || {},
      fieldMappings: feed?.settings?.fieldMappings || {},
      filters: feed?.settings?.filters || {
        collections: [],
        products: [],
        tags: [],
        priceRange: {},
        availability: 'all'
      },
      ...feed?.settings
    }
  });

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
        locationId: feed.locationId || locations[0]?.id || "",
        settings: {
          includeOutOfStock: feed.settings?.includeOutOfStock || false,
          includeDraftProducts: feed.settings?.includeDraftProducts || false,
          customFields: feed.settings?.customFields || {},
          fieldMappings: feed.settings?.fieldMappings || {},
          filters: feed.settings?.filters || {
            collections: [],
            products: [],
            tags: [],
            priceRange: {},
            availability: 'all'
          },
          ...feed.settings
        }
      });
    }
  }, [feed, locations]);

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

  const handleLocationChange = useCallback((value: string) => {
    setFormData(prev => ({ ...prev, locationId: value }));
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

  const handleFieldMappingChange = useCallback((field: string, mapping: string) => {
    setFormData(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        fieldMappings: {
          ...prev.settings?.fieldMappings,
          [field]: mapping
        }
      }
    }));
  }, []);

  const handleFieldMappingsArrayChange = useCallback((mappings: FieldMapping[]) => {
    setFormData(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        fieldMappingsArray: mappings
      }
    }));
  }, []);

  // Resource Picker handlers
  const openCollectionPicker = useCallback(async () => {
    try {
      const selected = await shopify.resourcePicker({
        type: 'collection',
        multiple: true,
      });

      if (selected && selected.length > 0) {
        const collections = selected.map((collection: any) => ({
          id: collection.id,
          title: collection.title || 'Untitled Collection'
        }));

        setFormData(prev => ({
          ...prev,
          settings: {
            ...prev.settings,
            filters: {
              ...prev.settings?.filters,
              collections: [...(prev.settings?.filters?.collections || []), ...collections]
            }
          }
        }));
      }
    } catch (error) {
      console.error('Collection picker error:', error);
    }
  }, [shopify]);

  const openProductPicker = useCallback(async () => {
    try {
      const selected = await shopify.resourcePicker({
        type: 'product',
        multiple: true,
      });

      if (selected && selected.length > 0) {
        const products = selected.map((product: any) => ({
          id: product.id,
          title: product.title || 'Untitled Product'
        }));

        setFormData(prev => ({
          ...prev,
          settings: {
            ...prev.settings,
            filters: {
              ...prev.settings?.filters,
              products: [...(prev.settings?.filters?.products || []), ...products]
            }
          }
        }));
      }
    } catch (error) {
      console.error('Product picker error:', error);
    }
  }, [shopify]);

  const removeCollection = useCallback((collectionId: string) => {
    setFormData(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        filters: {
          ...prev.settings?.filters,
          collections: prev.settings?.filters?.collections?.filter(c => c.id !== collectionId) || []
        }
      }
    }));
  }, []);

  const removeProduct = useCallback((productId: string) => {
    setFormData(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        filters: {
          ...prev.settings?.filters,
          products: prev.settings?.filters?.products?.filter(p => p.id !== productId) || []
        }
      }
    }));
  }, []);

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
                     formData.country !== "" &&
                     formData.currency !== "" &&
                     formData.timezone !== "";

  const getFieldError = (field: string) => {
    if (!actionData?.fieldErrors) return null;
    return actionData.fieldErrors[field];
  };

  // Channel options
  const channelOptions = [
    { label: "Select channel", value: "", disabled: true },
    { label: "Custom", value: "custom" },
    { label: "Google Ads / Shopping", value: "google" },
    { label: "Pinterest Ads", value: "pinterest" },
    { label: "TikTok Ads", value: "tiktok" },
    { label: "Meta Ads / Facebook Ads", value: "meta" },
    { label: "Meta Currency Feed", value: "meta-currency" },
    { label: "Meta Language Feed", value: "meta-language" },
    { label: "Pricerunner Feed", value: "pricerunner" }
  ];

  const countryOptions = [
    // North America
    { label: "United States", value: "US" },
    { label: "Canada", value: "CA" },
    { label: "Mexico", value: "MX" },

    // Europe - Western
    { label: "United Kingdom", value: "GB" },
    { label: "Ireland", value: "IE" },
    { label: "France", value: "FR" },
    { label: "Germany", value: "DE" },
    { label: "Austria", value: "AT" },
    { label: "Switzerland", value: "CH" },
    { label: "Belgium", value: "BE" },
    { label: "Netherlands", value: "NL" },
    { label: "Luxembourg", value: "LU" },

    // Europe - Southern
    { label: "Spain", value: "ES" },
    { label: "Portugal", value: "PT" },
    { label: "Italy", value: "IT" },
    { label: "Greece", value: "GR" },
    { label: "Malta", value: "MT" },
    { label: "Cyprus", value: "CY" },

    // Europe - Northern
    { label: "Sweden", value: "SE" },
    { label: "Norway", value: "NO" },
    { label: "Denmark", value: "DK" },
    { label: "Finland", value: "FI" },
    { label: "Iceland", value: "IS" },

    // Europe - Eastern
    { label: "Poland", value: "PL" },
    { label: "Czech Republic", value: "CZ" },
    { label: "Hungary", value: "HU" },
    { label: "Slovakia", value: "SK" },
    { label: "Romania", value: "RO" },
    { label: "Bulgaria", value: "BG" },
    { label: "Croatia", value: "HR" },
    { label: "Slovenia", value: "SI" },
    { label: "Estonia", value: "EE" },
    { label: "Latvia", value: "LV" },
    { label: "Lithuania", value: "LT" },

    // Asia - East
    { label: "Japan", value: "JP" },
    { label: "South Korea", value: "KR" },
    { label: "China", value: "CN" },
    { label: "Hong Kong", value: "HK" },
    { label: "Taiwan", value: "TW" },

    // Asia - Southeast
    { label: "Singapore", value: "SG" },
    { label: "Malaysia", value: "MY" },
    { label: "Thailand", value: "TH" },
    { label: "Indonesia", value: "ID" },
    { label: "Philippines", value: "PH" },
    { label: "Vietnam", value: "VN" },

    // Asia - South
    { label: "India", value: "IN" },
    { label: "Pakistan", value: "PK" },
    { label: "Bangladesh", value: "BD" },

    // Middle East
    { label: "United Arab Emirates", value: "AE" },
    { label: "Saudi Arabia", value: "SA" },
    { label: "Israel", value: "IL" },
    { label: "Turkey", value: "TR" },
    { label: "Qatar", value: "QA" },
    { label: "Kuwait", value: "KW" },

    // Oceania
    { label: "Australia", value: "AU" },
    { label: "New Zealand", value: "NZ" },

    // South America
    { label: "Brazil", value: "BR" },
    { label: "Argentina", value: "AR" },
    { label: "Chile", value: "CL" },
    { label: "Colombia", value: "CO" },
    { label: "Peru", value: "PE" },

    // Africa
    { label: "South Africa", value: "ZA" },
    { label: "Egypt", value: "EG" },
    { label: "Nigeria", value: "NG" },
    { label: "Kenya", value: "KE" },
    { label: "Morocco", value: "MA" }
  ];

  const currencyOptions = [
    { label: "Local Currency", value: "local" },

    // Major currencies
    { label: "USD - US Dollar", value: "USD" },
    { label: "EUR - Euro", value: "EUR" },
    { label: "GBP - British Pound", value: "GBP" },
    { label: "JPY - Japanese Yen", value: "JPY" },
    { label: "CHF - Swiss Franc", value: "CHF" },

    // North America
    { label: "CAD - Canadian Dollar", value: "CAD" },
    { label: "MXN - Mexican Peso", value: "MXN" },

    // Europe - Non-Euro
    { label: "SEK - Swedish Krona", value: "SEK" },
    { label: "NOK - Norwegian Krone", value: "NOK" },
    { label: "DKK - Danish Krone", value: "DKK" },
    { label: "PLN - Polish Złoty", value: "PLN" },
    { label: "CZK - Czech Koruna", value: "CZK" },
    { label: "HUF - Hungarian Forint", value: "HUF" },
    { label: "RON - Romanian Leu", value: "RON" },
    { label: "BGN - Bulgarian Lev", value: "BGN" },
    { label: "HRK - Croatian Kuna", value: "HRK" },
    { label: "ISK - Icelandic Króna", value: "ISK" },

    // Asia
    { label: "CNY - Chinese Yuan", value: "CNY" },
    { label: "KRW - South Korean Won", value: "KRW" },
    { label: "HKD - Hong Kong Dollar", value: "HKD" },
    { label: "TWD - Taiwan Dollar", value: "TWD" },
    { label: "SGD - Singapore Dollar", value: "SGD" },
    { label: "MYR - Malaysian Ringgit", value: "MYR" },
    { label: "THB - Thai Baht", value: "THB" },
    { label: "IDR - Indonesian Rupiah", value: "IDR" },
    { label: "PHP - Philippine Peso", value: "PHP" },
    { label: "VND - Vietnamese Dong", value: "VND" },
    { label: "INR - Indian Rupee", value: "INR" },
    { label: "PKR - Pakistani Rupee", value: "PKR" },
    { label: "BDT - Bangladeshi Taka", value: "BDT" },

    // Middle East
    { label: "AED - UAE Dirham", value: "AED" },
    { label: "SAR - Saudi Riyal", value: "SAR" },
    { label: "ILS - Israeli Shekel", value: "ILS" },
    { label: "TRY - Turkish Lira", value: "TRY" },
    { label: "QAR - Qatari Riyal", value: "QAR" },
    { label: "KWD - Kuwaiti Dinar", value: "KWD" },

    // Oceania
    { label: "AUD - Australian Dollar", value: "AUD" },
    { label: "NZD - New Zealand Dollar", value: "NZD" },

    // South America
    { label: "BRL - Brazilian Real", value: "BRL" },
    { label: "ARS - Argentine Peso", value: "ARS" },
    { label: "CLP - Chilean Peso", value: "CLP" },
    { label: "COP - Colombian Peso", value: "COP" },
    { label: "PEN - Peruvian Sol", value: "PEN" },

    // Africa
    { label: "ZAR - South African Rand", value: "ZAR" },
    { label: "EGP - Egyptian Pound", value: "EGP" },
    { label: "NGN - Nigerian Naira", value: "NGN" },
    { label: "KES - Kenyan Shilling", value: "KES" },
    { label: "MAD - Moroccan Dirham", value: "MAD" }
  ];

  const timezoneOptions = [
    { label: "UTC", value: "UTC" },

    // North America
    { label: "America/New_York (EST/EDT)", value: "America/New_York" },
    { label: "America/Chicago (CST/CDT)", value: "America/Chicago" },
    { label: "America/Denver (MST/MDT)", value: "America/Denver" },
    { label: "America/Los_Angeles (PST/PDT)", value: "America/Los_Angeles" },
    { label: "America/Toronto", value: "America/Toronto" },
    { label: "America/Vancouver", value: "America/Vancouver" },
    { label: "America/Mexico_City", value: "America/Mexico_City" },

    // Europe
    { label: "Europe/London (GMT/BST)", value: "Europe/London" },
    { label: "Europe/Dublin", value: "Europe/Dublin" },
    { label: "Europe/Paris (CET/CEST)", value: "Europe/Paris" },
    { label: "Europe/Berlin", value: "Europe/Berlin" },
    { label: "Europe/Madrid", value: "Europe/Madrid" },
    { label: "Europe/Rome", value: "Europe/Rome" },
    { label: "Europe/Amsterdam", value: "Europe/Amsterdam" },
    { label: "Europe/Brussels", value: "Europe/Brussels" },
    { label: "Europe/Vienna", value: "Europe/Vienna" },
    { label: "Europe/Zurich", value: "Europe/Zurich" },
    { label: "Europe/Lisbon", value: "Europe/Lisbon" },
    { label: "Europe/Athens", value: "Europe/Athens" },
    { label: "Europe/Stockholm", value: "Europe/Stockholm" },
    { label: "Europe/Oslo", value: "Europe/Oslo" },
    { label: "Europe/Copenhagen", value: "Europe/Copenhagen" },
    { label: "Europe/Helsinki", value: "Europe/Helsinki" },
    { label: "Europe/Warsaw", value: "Europe/Warsaw" },
    { label: "Europe/Prague", value: "Europe/Prague" },
    { label: "Europe/Budapest", value: "Europe/Budapest" },
    { label: "Europe/Bucharest", value: "Europe/Bucharest" },
    { label: "Europe/Sofia", value: "Europe/Sofia" },
    { label: "Europe/Istanbul", value: "Europe/Istanbul" },

    // Asia - East
    { label: "Asia/Tokyo (JST)", value: "Asia/Tokyo" },
    { label: "Asia/Seoul (KST)", value: "Asia/Seoul" },
    { label: "Asia/Shanghai (CST)", value: "Asia/Shanghai" },
    { label: "Asia/Hong_Kong (HKT)", value: "Asia/Hong_Kong" },
    { label: "Asia/Taipei", value: "Asia/Taipei" },

    // Asia - Southeast
    { label: "Asia/Singapore (SGT)", value: "Asia/Singapore" },
    { label: "Asia/Kuala_Lumpur", value: "Asia/Kuala_Lumpur" },
    { label: "Asia/Bangkok (ICT)", value: "Asia/Bangkok" },
    { label: "Asia/Jakarta (WIB)", value: "Asia/Jakarta" },
    { label: "Asia/Manila (PHT)", value: "Asia/Manila" },
    { label: "Asia/Ho_Chi_Minh", value: "Asia/Ho_Chi_Minh" },

    // Asia - South & Middle East
    { label: "Asia/Kolkata (IST)", value: "Asia/Kolkata" },
    { label: "Asia/Dubai (GST)", value: "Asia/Dubai" },
    { label: "Asia/Riyadh", value: "Asia/Riyadh" },
    { label: "Asia/Jerusalem", value: "Asia/Jerusalem" },
    { label: "Asia/Qatar", value: "Asia/Qatar" },
    { label: "Asia/Kuwait", value: "Asia/Kuwait" },

    // Oceania
    { label: "Australia/Sydney (AEDT/AEST)", value: "Australia/Sydney" },
    { label: "Australia/Melbourne", value: "Australia/Melbourne" },
    { label: "Australia/Brisbane", value: "Australia/Brisbane" },
    { label: "Australia/Perth", value: "Australia/Perth" },
    { label: "Pacific/Auckland (NZDT/NZST)", value: "Pacific/Auckland" },

    // South America
    { label: "America/Sao_Paulo (BRT)", value: "America/Sao_Paulo" },
    { label: "America/Argentina/Buenos_Aires", value: "America/Argentina/Buenos_Aires" },
    { label: "America/Santiago", value: "America/Santiago" },
    { label: "America/Bogota", value: "America/Bogota" },
    { label: "America/Lima", value: "America/Lima" },

    // Africa
    { label: "Africa/Johannesburg (SAST)", value: "Africa/Johannesburg" },
    { label: "Africa/Cairo (EET)", value: "Africa/Cairo" },
    { label: "Africa/Lagos (WAT)", value: "Africa/Lagos" },
    { label: "Africa/Nairobi (EAT)", value: "Africa/Nairobi" },
    { label: "Africa/Casablanca", value: "Africa/Casablanca" }
  ];

  const locationOptions = [
    { label: "Location", value: "", disabled: true },
    ...locations.map(loc => ({ label: loc.name, value: loc.id }))
  ];

  const tabs = [
    { id: 'info', content: 'Feed info' },
    { id: 'settings', content: 'Settings' },
    { id: 'mapping', content: 'Mapping' },
    { id: 'filters', content: 'Filters' }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 0: // Feed Info
        return (
          <BlockStack gap="400">
            <Box padding="400">
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Add a new feed</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Enter the details for your new feed below.
                </Text>
              </BlockStack>
            </Box>

            <Divider />

            <Box padding="400">
              <FormLayout>
                <TextField
                  label="Feed Name"
                  value={formData.name}
                  onChange={handleNameChange}
                  autoComplete="off"
                  placeholder='eg. "Google shopping DE"'
                  requiredIndicator
                  error={getFieldError("name")}
                />

                <Select
                  label="Select channel"
                  options={channelOptions}
                  value={formData.channel}
                  onChange={handleChannelChange}
                  name="channel"
                />

                <Select
                  label="Location"
                  options={locationOptions}
                  value={formData.locationId}
                  onChange={handleLocationChange}
                  name="locationId"
                  disabled={locations.length === 0}
                />
              </FormLayout>
            </Box>
          </BlockStack>
        );

      case 1: // Settings
        return (
          <Box padding="400">
            <FormLayout>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Feed Settings</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Configure language, country, currency and timezone settings.
                </Text>
              </BlockStack>

              <FormLayout.Group>
                <LanguageSelector
                  locales={locales}
                  selectedLanguage={formData.language}
                  onLanguageChange={handleLanguageChange}
                />

                <Select
                  label="Country"
                  options={countryOptions}
                  value={formData.country}
                  onChange={handleCountryChange}
                  helpText="Target country for this feed"
                />
              </FormLayout.Group>

              <FormLayout.Group>
                <Select
                  label="Currency"
                  options={currencyOptions}
                  value={formData.currency}
                  onChange={handleCurrencyChange}
                  helpText="Currency for product prices"
                />

                <Select
                  label="Timezone"
                  options={timezoneOptions}
                  value={formData.timezone}
                  onChange={handleTimezoneChange}
                  helpText="Timezone for feed generation"
                />
              </FormLayout.Group>

              <Divider />

              <Checkbox
                label="Include out of stock products"
                checked={formData.settings?.includeOutOfStock || false}
                onChange={handleIncludeOutOfStockChange}
                helpText="Include products that are currently out of stock"
              />

              <Checkbox
                label="Include draft products"
                checked={formData.settings?.includeDraftProducts || false}
                onChange={handleIncludeDraftProductsChange}
                helpText="Include products that are in draft status"
              />
            </FormLayout>
          </Box>
        );

      case 2: // Mapping
        return (
          <Box padding="400">
            <FeedMappingTable
              mappings={formData.settings?.fieldMappingsArray || []}
              onMappingsChange={handleFieldMappingsArrayChange}
            />
          </Box>
        );

      case 3: // Filters
        return (
          <Box padding="400">
            <FormLayout>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Product Filters</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Configure which products to include in your feed based on various criteria.
                </Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="400">
                <Text as="h3" variant="headingSm">Collection Filters</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Include or exclude products from specific collections.
                </Text>

                <Button onClick={openCollectionPicker}>
                  Select Collections
                </Button>

                {formData.settings?.filters?.collections && formData.settings.filters.collections.length > 0 && (
                  <BlockStack gap="200">
                    {formData.settings.filters.collections.map((collection) => (
                      <InlineStack key={collection.id} align="space-between" blockAlign="center">
                        <Text as="span" variant="bodyMd">{collection.title}</Text>
                        <Button variant="plain" onClick={() => removeCollection(collection.id)}>
                          Remove
                        </Button>
                      </InlineStack>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>

              <Divider />

              <BlockStack gap="400">
                <Text as="h3" variant="headingSm">Product Filters</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Include specific products in your feed.
                </Text>

                <Button onClick={openProductPicker}>
                  Select Products
                </Button>

                {formData.settings?.filters?.products && formData.settings.filters.products.length > 0 && (
                  <BlockStack gap="200">
                    {formData.settings.filters.products.map((product) => (
                      <InlineStack key={product.id} align="space-between" blockAlign="center">
                        <Text as="span" variant="bodyMd">{product.title}</Text>
                        <Button variant="plain" onClick={() => removeProduct(product.id)}>
                          Remove
                        </Button>
                      </InlineStack>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </FormLayout>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Layout>
      <Layout.Section>
        <Form method="post" onSubmit={handleSubmit}>
          <BlockStack gap="400">
            {/* Error Banner */}
            {actionData?.error && (
              <Banner status="critical">{actionData.error}</Banner>
            )}

            {/* Success Banner */}
            {actionData?.success && (
              <Banner status="success">{actionData.success}</Banner>
            )}

            {/* Tabs */}
            <Card>
              <Tabs
                tabs={tabs}
                selected={activeTab}
                onSelect={setActiveTab}
              >
                {renderTabContent()}
              </Tabs>
            </Card>

            {/* Hidden fields for settings and form data */}
            {feed?.id && <input type="hidden" name="feedId" value={feed.id} />}
            <input type="hidden" name="name" value={formData.name} />
            <input type="hidden" name="channel" value={formData.channel} />
            <input type="hidden" name="language" value={formData.language} />
            <input type="hidden" name="country" value={formData.country} />
            <input type="hidden" name="currency" value={formData.currency} />
            <input type="hidden" name="timezone" value={formData.timezone} />
            <input type="hidden" name="title" value={formData.title || ""} />
            <input type="hidden" name="settings" value={JSON.stringify(formData.settings)} />
            <input type="hidden" name="locationId" value={formData.locationId} />

            {/* Action Buttons */}
            <Card>
              <Box padding="400">
                <InlineStack align="space-between">
                  <Button
                    submit
                    variant="primary"
                    loading={isSubmitting}
                    disabled={!isFormValid}
                  >
                    {isEdit ? 'Save' : 'Create Feed'}
                  </Button>
                  <Button url="/app/feeds">Back to all feeds</Button>
                </InlineStack>
              </Box>
            </Card>
          </BlockStack>
        </Form>
      </Layout.Section>

      {/* Help Sidebar */}
      <Layout.Section variant="oneThird">
        <Card>
          <Box padding="400">
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Help</Text>
              <Text as="p" variant="bodyMd">
                Need help adding a new feed? Contact us at hi@letsgolukas.com
              </Text>

              {formData.name && (
                <>
                  <Divider />
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">
                      <strong>Name:</strong> {formData.name}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>Channel:</strong> {formData.channel}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>Feed type:</strong> Products
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>Language:</strong> {formData.language}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>Country:</strong> {formData.country}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>Currency:</strong> {formData.currency}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>File type:</strong> xml
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>Timezone:</strong> {formData.timezone}
                    </Text>
                  </BlockStack>
                </>
              )}
            </BlockStack>
          </Box>
        </Card>
      </Layout.Section>
    </Layout>
  );
}
