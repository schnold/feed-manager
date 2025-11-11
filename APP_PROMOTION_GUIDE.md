# Shopify App Promotion and Cross-App Integration Guide

## Overview

This guide explains how to implement promotions for other apps in your Shopify project and how to get your app referenced in other apps.

## Important Restrictions

⚠️ **Critical**: Shopify has strict policies regarding app promotion within extensions:

- **Extensions cannot be used to display promotions or advertisements** for:
  - Your own app
  - Related apps
  - Requesting app reviews

This restriction applies to:
- Admin UI extensions
- Checkout extensions
- POS extensions
- Theme app extensions

**Source**: [Shopify App Requirements](https://shopify.dev/docs/apps/launch/app-requirements-checklist)

## Legitimate Ways to Promote Apps

### 1. Built for Shopify Program

The **Built for Shopify** program is the primary way to get increased visibility and promotion:

#### Benefits:
- **Built for Shopify badge** on your app listing
- **Search ranking boost** in App Store search results
- **Promotion opportunities** in:
  - First collection on App Store homepage
  - Shopify admin "Picked for you" modal
  - App recommendations in Sidekick
  - Featured in story pages

#### Requirements:
- Good Partner standing
- Meets App Store requirements
- Clean uninstall (for storefront apps)
- Minimum installs, reviews, and ratings
- Fast performance (Core Web Vitals)
- Ease of use
- Usefulness

**Learn more**: [Built for Shopify Documentation](https://shopify.dev/docs/apps/launch/built-for-shopify)

### 2. App Store Optimization (ASO)

Improve your app's discoverability in the Shopify App Store:

#### Best Practices:
- Fill out all listing fields (including optional ones)
- Use relevant keywords naturally
- Avoid keyword stuffing
- Use multiple spellings (e.g., "popup" and "pop up")
- Proofread for grammar and spelling
- Track listing traffic with Google Analytics or Facebook Pixel

**Learn more**: [Marketing Your App](https://shopify.dev/docs/apps/launch/marketing)

### 3. External Marketing

Drive traffic from outside Shopify to improve App Store ranking:

#### Channels:
- **Webinars**: Host educational webinars about your app
- **Video tutorials**: Create YouTube/Vimeo tutorials
- **Blog posts**: Write about your app and Shopify commerce
- **Social media**: Engage with Shopify community
- **Press releases**: Announce new features or milestones
- **Community forums**: Participate in Shopify Community forums (be mindful of spam rules)

### 4. Partner-Friendly Apps

Make your app free for Shopify Partners to install on development stores:

- Partners can test your app for free
- Partners may recommend your app to merchants
- Increases word-of-mouth promotion

**Requirement**: Offer free testing for development stores

### 5. Freemium Model

Offer a free tier with premium features:

- Allows merchants to try before buying
- Increases initial install rate
- Improves retention over time
- Can transition to paid app later

## How to Get Referenced in Other Apps

### 1. Built for Shopify Status

Apps with Built for Shopify status are eligible for:
- App recommendations in Sidekick
- Featured in "Picked for you" modals
- Increased visibility in App Store

### 2. Partner Relationships

Build relationships with other Shopify Partners:
- Network at Shopify events
- Collaborate on complementary apps
- Cross-promote through external channels (not within extensions)

### 3. App Store Visibility

- High install rates
- Positive reviews and ratings
- Active maintenance and updates
- Fast performance metrics

### 4. External Partnerships

- Partner with complementary apps for co-marketing
- Create integration partnerships
- Participate in Shopify Partner ecosystem

## Technical Implementation Options

### What You CANNOT Do

❌ **Cannot use extensions to promote other apps**:
```tsx
// ❌ DO NOT DO THIS - Violates Shopify policies
<AdminBlock>
  <Button onClick={() => window.open('https://apps.shopify.com/other-app')}>
    Install Companion App
  </Button>
</AdminBlock>
```

### What You CAN Do

✅ **Legitimate promotion methods**:

1. **External Links in App UI** (not in extensions):
   - Links in your main app interface (not in admin blocks/actions)
   - Links in documentation
   - Links in marketing materials

2. **Partner API for App Credits**:
   - Award app credits to merchants
   - Use `appCreditCreate` mutation in Partner API
   - Can incentivize merchants to try other apps

3. **App Store Integration**:
   - Deep links to App Store listings
   - Use App Bridge to open App Store pages
   - Link to app listings from your main app UI

### Example: App Store Deep Link

```tsx
// ✅ This is allowed in your main app UI (not in extensions)
import { Button } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

function AppPromotion() {
  const app = useAppBridge();
  
  const handleOpenAppStore = () => {
    // Open App Store listing in new tab
    window.open('https://apps.shopify.com/your-app-handle', '_blank');
  };
  
  return (
    <Button onClick={handleOpenAppStore}>
      View in App Store
    </Button>
  );
}
```

## Recommendations for Your Feed Manager App

Based on your current app structure, here are specific recommendations:

### 1. Apply for Built for Shopify

Your app appears to be a feed management tool. To qualify:
- Ensure clean uninstall process
- Optimize performance (Core Web Vitals)
- Gather merchant reviews
- Maintain high ratings
- Document all features clearly

### 2. Create Partner-Friendly Offering

Consider offering:
- Free tier for development stores
- Partner discounts
- Free trials for merchants

### 3. Build External Marketing

- Create tutorials on XML feed generation
- Write blog posts about product feed optimization
- Create video content about Google Shopping feeds
- Engage in Shopify Community forums

### 4. Integration Partnerships

Partner with complementary apps:
- SEO apps
- Marketing automation apps
- Analytics apps
- Product management apps

## Next Steps

1. **Review Built for Shopify Requirements**: 
   - Visit: https://shopify.dev/docs/apps/launch/built-for-shopify
   - Assess your app against the criteria
   - Create an action plan to meet requirements

2. **Optimize App Store Listing**:
   - Review your current listing
   - Add missing information
   - Optimize keywords
   - Improve screenshots and descriptions

3. **Set Up Analytics**:
   - Track App Store listing traffic
   - Monitor install sources
   - Measure conversion rates

4. **Build External Presence**:
   - Create marketing website
   - Set up social media accounts
   - Create content marketing strategy
   - Build email list

5. **Network with Partners**:
   - Join Shopify Partner community
   - Attend Shopify events
   - Connect with other app developers

## Resources

- [Built for Shopify Program](https://shopify.dev/docs/apps/launch/built-for-shopify)
- [App Store Requirements](https://shopify.dev/docs/apps/store/requirements)
- [Marketing Your App](https://shopify.dev/docs/apps/launch/marketing)
- [App Requirements Checklist](https://shopify.dev/docs/apps/launch/app-requirements-checklist)
- [Partner Dashboard](https://partners.shopify.com)

## Summary

**Key Takeaways**:
1. ❌ You cannot promote other apps within Shopify extensions
2. ✅ You can promote apps through external channels and your main app UI
3. ✅ Built for Shopify is the primary way to get increased visibility
4. ✅ App Store optimization and external marketing are essential
5. ✅ Partner relationships and networking are valuable

The most effective way to get your app referenced and promoted is through the Built for Shopify program, which provides organic promotion opportunities within Shopify's ecosystem.

