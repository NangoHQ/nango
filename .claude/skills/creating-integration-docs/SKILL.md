---
name: creating-integration-docs
description: Use when adding documentation for a new Nango integration - creates main page, setup guide, and updates docs.json and providers.yaml following established patterns
---

# Creating Integration Documentation

## Overview

Create documentation for new Nango integrations following the established structure: main integration page with 4-step quickstart, separate setup guide, and proper configuration in docs.json and providers.yaml.

## When to Use

- Adding documentation for a brand new integration
- Creating docs for an integration that doesn't exist yet
- User asks to "add docs for [integration]" or "create documentation for [integration]"

## When NOT to Use

- Migrating existing docs (use nango-docs-migrator agent instead)
- Editing existing integration docs
- General documentation changes

## Quick Reference

| File | Path | Purpose |
|------|------|---------|
| Main page | `docs/api-integrations/[slug].mdx` | Quickstart + guide links + syncs section |
| Setup guide | `docs/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app.mdx` | OAuth app registration steps |
| Connect guide | `docs/api-integrations/[slug]/connect.mdx` | Optional: custom connection UI |
| Syncs snippet | `snippets/generated/[slug]/PreBuiltUseCases.mdx` | Auto-generated or empty state |
| Navigation | `docs/docs.json` | Add to "APIs & Integrations" group |
| Provider config | `packages/providers/providers.yaml` | Add docs and setup_guide_url |

## Required Information

Before creating docs, gather:

1. **Integration name** (e.g., "Slack", "Salesforce")
2. **Integration slug** (e.g., "slack", "salesforce", "google-calendar")
3. **Auth type** (OAuth2, API Key, Basic Auth)
4. **API base URL** (for proxy examples)
5. **API documentation URL** (official docs link)
6. **OAuth setup steps** (if OAuth - how to get credentials)

## File Templates

### Main Integration Page

**Path:** `docs/api-integrations/[slug].mdx`

```mdx
---
title: '[Integration Name]'
sidebarTitle: '[Integration Name]'
description: 'Integrate your application with the [Integration Name] API'
---

## 🚀 Quickstart

Connect to [Integration Name] with Nango and see data flow in 2 minutes.

<Steps>
    <Step title="Create the integration">
    In Nango ([free signup](https://app.nango.dev)), go to [Integrations](https://app.nango.dev/dev/integrations) -> _Configure New Integration_ -> _[Integration Name]_.
    </Step>
    <Step title="Authorize [Integration Name]">
    Go to [Connections](https://app.nango.dev/dev/connections) -> _Add Test Connection_ -> _Authorize_, then log in to [Integration Name]. Later, you'll let your users do the same directly from your app.
    </Step>
    <Step title="Call the [Integration Name] API">
    Let's make your first request to the [Integration Name] API. Replace the placeholders below with your [secret key](https://app.nango.dev/dev/environment-settings), [integration ID](https://app.nango.dev/dev/integrations), and [connection ID](https://app.nango.dev/dev/connections):
    <Tabs>
        <Tab title="cURL">

            ```bash
            curl "https://api.nango.dev/proxy/[example-endpoint]" \
              -H "Authorization: Bearer <NANGO-SECRET-KEY>" \
              -H "Provider-Config-Key: <INTEGRATION-ID>" \
              -H "Connection-Id: <CONNECTION-ID>"
            ```

        </Tab>

        <Tab title="Node">

        Install Nango's backend SDK with `npm i @nangohq/node`. Then run:

        ```typescript
        import { Nango } from '@nangohq/node';

        const nango = new Nango({ secretKey: '<NANGO-SECRET-KEY>' });

        const res = await nango.get({
            endpoint: '/[example-endpoint]',
            providerConfigKey: '<INTEGRATION-ID>',
            connectionId: '<CONNECTION-ID>'
        });

        console.log(res.data);
        ```
        </Tab>


    </Tabs>
    Or fetch credentials with the [Node SDK](/reference/sdks/node#get-a-connection-with-credentials) or [API](/reference/api/connection/get).

    ✅ You're connected! Check the [Logs](https://app.nango.dev/dev/logs) tab in Nango to inspect requests.
    </Step>

    <Step title="Implement Nango in your app">
        Follow our [quickstart](/getting-started/quickstart/embed-in-your-app) to integrate Nango in your app.

        To obtain your own production credentials, follow the setup guide linked below.
    </Step>
</Steps>

## 📚 [Integration Name] Integration Guides

Nango maintained guides for common use cases.

- [How to register your own [Integration Name] API OAuth app](/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app)
Register an OAuth app with [Integration Name] and obtain credentials to connect it to Nango

Official docs: [[Integration Name] API docs]([API_DOCS_URL])

## 🧩 Pre-built syncs & actions for [Integration Name]

Enable them in your dashboard. [Extend and customize](/implementation-guides/building-integrations/extend-reference-implementation) to fit your needs.

import PreBuiltUseCases from "/snippets/generated/[slug]/PreBuiltUseCases.mdx"

<PreBuiltUseCases />

---
```

### Setup Guide

**Path:** `docs/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app.mdx`

```mdx
---
title: 'How to register your own [Integration Name] OAuth app'
sidebarTitle: '[Integration Name] Setup'
description: 'Register an OAuth app with [Integration Name] and connect it to Nango'
---

This guide shows you how to register your own app with [Integration Name] to obtain your OAuth credentials (client id & secret). These are required to let your users grant your app access to their [Integration Name] account.

<Steps>
  <Step title="Create a developer account">
    Go to [[Integration Name] Developer Portal]([DEVELOPER_PORTAL_URL]) and sign up for a developer account.
  </Step>
  <Step title="Create a new application">
    1. Navigate to your applications/apps dashboard
    2. Click "Create New App" or similar
    3. Fill in the required details (app name, description)
  </Step>
  <Step title="Configure OAuth settings">
    1. In your app settings, find OAuth or authentication settings
    2. Add the Nango callback URL: `https://api.nango.dev/oauth/callback`
    3. Select the scopes your application needs
  </Step>
  <Step title="Get your credentials">
    Copy your **Client ID** and **Client Secret** from the app settings. You'll need these when configuring the integration in Nango.
  </Step>
  <Step title="Next">
    Follow the [_Quickstart_](/getting-started/quickstart) to connect your first account.
  </Step>
</Steps>

For more details, see [[Integration Name]'s OAuth documentation]([OAUTH_DOCS_URL]).

---
```

### Empty Syncs Snippet

**Path:** `snippets/generated/[slug]/PreBuiltUseCases.mdx`

```mdx
_No pre-built syncs or actions available yet._

<Tip>Not seeing the integration you need? [Build your own](https://nango.dev/docs/guides/platform/functions) independently.</Tip>
```

## Configuration Updates

### docs.json

Add to the "APIs & Integrations" group in alphabetical order:

```json
{
  "group": "APIs & Integrations",
  "pages": [
    // ... other integrations alphabetically
    "api-integrations/[slug]",
    // ... more integrations
  ]
}
```

**Important:**
- Add ONLY the main page path (not setup guide or connect guide)
- Keep alphabetical order within the group
- Setup guides are accessed via links, not navigation

### providers.yaml

Add or update the provider entry with docs URLs:

```yaml
[slug]:
    display_name: [Integration Name]
    # ... other provider config ...
    docs: https://nango.dev/docs/api-integrations/[slug]
    setup_guide_url: https://nango.dev/docs/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app
```

If connect guide exists, also add:
```yaml
    docs_connect: https://nango.dev/docs/api-integrations/[slug]/connect
```

## Implementation Checklist

- [ ] Gather integration info (name, slug, auth type, API URLs)
- [ ] Create main page at `docs/api-integrations/[slug].mdx`
- [ ] Create setup guide at `docs/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app.mdx`
- [ ] Create empty syncs snippet at `snippets/generated/[slug]/PreBuiltUseCases.mdx`
- [ ] Add to docs.json "APIs & Integrations" group (alphabetically)
- [ ] Add docs URLs to providers.yaml entry
- [ ] Verify all links work
- [ ] Test MDX syntax is valid

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Adding setup guide to docs.json | Only add main page; setup guide accessed via links |
| Wrong link format in guides section | Use `/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app` |
| Missing two spaces after guide links | Add `  ` (two spaces) after closing `)` for proper line breaks |
| Wrong slug format | Use lowercase with hyphens (e.g., `google-calendar`, not `googleCalendar`) |
| Forgetting PreBuiltUseCases snippet | Always create it, even if empty |
| Not updating providers.yaml | Must add `docs` and `setup_guide_url` properties |

## Auth Type Variations

### OAuth2 (most common)
- Use standard setup guide template
- Link to OAuth documentation
- Mention callback URL: `https://api.nango.dev/oauth/callback`

### API Key
- Modify setup guide title: "How to obtain your [Integration Name] API key"
- Focus on where to find/generate API keys
- No OAuth callback needed

### Basic Auth
- Modify setup guide title: "How to configure [Integration Name] credentials"
- Document username/password or API key requirements

## Example: Complete Slack Integration

**Files created:**
1. `docs/api-integrations/slack.mdx` - Main page with quickstart
2. `docs/api-integrations/slack/how-to-register-your-own-slack-api-oauth-app.mdx` - Setup guide
3. `snippets/generated/slack/PreBuiltUseCases.mdx` - Syncs snippet

**docs.json entry:**
```json
"api-integrations/slack"
```

**providers.yaml entry:**
```yaml
slack:
    docs: https://nango.dev/docs/api-integrations/slack
    setup_guide_url: https://nango.dev/docs/api-integrations/slack/how-to-register-your-own-slack-api-oauth-app
```

---
