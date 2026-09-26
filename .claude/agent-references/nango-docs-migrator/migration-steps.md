# Migration Process

**IMPORTANT: File Location Changes**

The migration involves MOVING the main integration file to a new location:
- **OLD location:** `docs/integrations/all/[integration-slug].mdx`
- **NEW location:** `docs/api-integrations/[integration-slug].mdx`

The transformed main integration page becomes the primary page at `/api-integrations/[slug]`, and setup guides become sub-guides linked from it.

**File Operations:**
- Use the **Write tool** to create the main file at the new location: `docs/api-integrations/[slug].mdx`
- Use the **Write tool** to create the setup guide: `docs/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app.mdx`
- **Check for connect guide:** Use the **Read tool** to check if `docs/integrations/all/[slug]/connect.mdx` exists
  - If it exists, use the **Write tool** to move it to: `docs/api-integrations/[slug]/connect.mdx`
  - Preserve the content exactly as-is (same as setup guide preservation rules)
- The old file at `docs/integrations/all/[slug].mdx` can remain (it will be deleted separately)
- Update `docs/docs.json` using the **Edit tool** to:
  1. Remove the old entry: `"integrations/all/[slug]"`
  2. Add the new main page entry only: `"api-integrations/[slug]"` (setup guide and connect guide are NOT added to docs.json)
  3. Add a redirect in the `redirects` array: `{"source": "/integrations/all/[slug]", "destination": "/api-integrations/[slug]"}`
- Update `packages/providers/providers.yaml` using the **Edit tool** to:
  1. Update the `docs` property: `docs: https://nango.dev/docs/api-integrations/[slug]`
  2. **For OAUTH2 auth mode:** Add or update the `setup_guide_url` property: `setup_guide_url: https://nango.dev/docs/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app`
  3. **For non-OAUTH2 auth modes (API_KEY, BASIC, etc.):** Use `docs_connect` instead of `setup_guide_url`: `docs_connect: https://nango.dev/docs/api-integrations/[slug]/connect`
  4. If connect guide exists AND auth mode is OAUTH2, update the `docs_connect` property: `docs_connect: https://nango.dev/docs/api-integrations/[slug]/connect`

Follow these steps for each integration file:

### 1. Read and Parse the Source File

- Locate the file in `docs/integrations/all/[integration].mdx`
- Parse the frontmatter (title, sidebarTitle, description)
- **Check for connect guide:** Use Read tool to check if `docs/integrations/all/[integration]/connect.mdx` exists
- **Detect the format type** (see Format Detection below)

### 1a. Format Detection

**Tabbed Format** (most common):
```markdown
<Tabs>
  <Tab title="🚀 Quickstart">
  <Tab title="🧑‍💻 OAuth app setup">
```

**Snippet-based Format** (e.g., netsuite-tba):
```markdown
import Overview from "/snippets/overview.mdx"
import PreBuiltTooling from "/snippets/generated/..."
<Overview />
```

**Mixed/Other Formats**:
- Has sections but no tabs
- Custom structure

**Detection logic:**
1. Check for `<Tabs>` wrapper → **Tabbed Format** (use standard migration)
2. Check for `import Overview from "/snippets/overview.mdx"` → **Snippet-based Format** (use snippet migration)
3. Otherwise → **Custom Format** (requires manual review)

### 1b. Extract Content Based on Format

**For Tabbed Format:**
- Extract content from each tab:
  - 🚀 Quickstart tab
  - 🧑‍💻 OAuth app setup tab
  - 🔗 Useful links tab
  - 🚨 API gotchas tab

**For Snippet-based Format:**
- Remove `<Overview />` component and import
- Remove `<PreBuiltTooling />` component and import (if present)
- Keep `<PreBuiltUseCases />` component (already correct format)
  - Note: Empty PreBuiltUseCases.mdx files should contain:
    ```
    _No pre-built syncs or actions available yet._

    <Tip>Not seeing the integration you need? [Build your own](https://nango.dev/docs/guides/functions/functions-guide) independently.</Tip>
    ```
- Extract setup content from headings like "## Admin Setup", "## Setup guide"
- Extract useful links from "## Useful links"
- Extract gotchas from "## API gotchas"
- Extract any special sections (Access requirements, Connection configuration, etc.)

### 2. Transform the Frontmatter

**OLD FORMAT:**
```yaml
---
title: 'Salesforce'
sidebarTitle: 'Salesforce'
description: 'Access the Salesforce API in 2 minutes 💨'
---
```

**NEW FORMAT:**
```yaml
---
title: 'Salesforce'
sidebarTitle: 'Salesforce'
description: 'Integrate your application with the Salesforce API'
---
```

**Changes:**
- Keep title and sidebarTitle unchanged
- Rewrite description to: `'Integrate your application with the [Integration Name] API'`
- Remove any emojis from description

### 3. Generate Quickstart Proxy Example (if needed)

If the source file doesn't have an existing API call example, generate one dynamically:

**Check for existing example:**
- Look in the Quickstart tab for curl or SDK examples
- If found, preserve and use it

**If no example exists, generate from syncs/actions:**
1. Check the PreBuiltUseCases snippet at `/snippets/generated/[integration-slug]/PreBuiltUseCases.mdx`
2. Find the first sync available (preferred) or first action
3. Extract the endpoint path and method
4. Generate appropriate curl and Node SDK examples

**Example generation template:**

For a sync endpoint like `GET /api/v1/contacts`:
```bash
curl "https://api.nango.dev/proxy/api/v1/contacts" \
  -H "Authorization: Bearer <NANGO-API-KEY>" \
  -H "Provider-Config-Key: <INTEGRATION-ID>" \
  -H "Connection-Id: <CONNECTION-ID>"
```

```typescript
import { Nango } from '@nangohq/node';

const nango = new Nango({ apiKey: '<NANGO-API-KEY>' });

const res = await nango.get({
    endpoint: '/api/v1/contacts',
    providerConfigKey: '<INTEGRATION-ID>',
    connectionId: '<CONNECTION-ID>'
});

console.log(res.data);
```

**Fallback if no syncs/actions:**
Use a generic example with a placeholder endpoint and add a warning in the output.

### 4. Transform the Quickstart Section

**For Tabbed Format:**
Extract content from the "🚀 Quickstart" tab and restructure:

**Structure:**
```markdown
## 🚀 Quickstart

Connect to [Integration] with Nango and see data flow in 2 minutes.

<Steps>
    <Step title="Create the integration">
    [Content from original Step 1]
    </Step>
    <Step title="Authorize [Integration]">
    [Content from original Step 2]
    </Step>
    <Step title="Call the [Integration] API">
    [Content from original Step 3]
    [API examples remain the same]
    Or fetch credentials with the [Node SDK](/reference/backend/backend-sdk/node#get-a-connection-with-credentials) or [API](/reference/backend/http-api/connection/get).

    ✅ You're connected! Check the [Logs](https://app.nango.dev/dev/logs) tab in Nango to inspect requests.
    </Step>

    <Step title="Implement Nango in your app">
        Follow our [quickstart](/getting-started/quickstart) to integrate Nango in your app.

        To obtain your own production credentials, follow the setup guide linked below.
    </Step>
</Steps>
```

**Key changes:**
- Remove `<Tabs>` wrapper
- Add intro sentence: "Connect to [Integration] with Nango and see data flow in 2 minutes."
- Keep existing steps 1-3 mostly unchanged
- Remove the `<Tip>` block at the end
- Move the "✅ You're connected!" message INSIDE Step 3 (after the "Or fetch credentials..." line)
- Add NEW Step 4 titled "Implement Nango in your app" with content:
  ```
  Follow our [quickstart](/getting-started/quickstart) to integrate Nango in your app.

  To obtain your own production credentials, follow the setup guide linked below.
  ```

**For Snippet-based Format:**
Since there's no existing Quickstart tab, create one from scratch:

**Structure:**
```markdown
## 🚀 Quickstart

Connect to [Integration] with Nango and see data flow in 2 minutes.

<Steps>
    <Step title="Create the integration">
    In Nango ([free signup](https://app.nango.dev)), go to [Integrations](https://app.nango.dev/dev/integrations) -> _Configure New Integration_ -> _[Integration]_.
    </Step>
    <Step title="Authorize [Integration]">
    Go to [Connections](https://app.nango.dev/dev/connections) -> _Add Test Connection_ -> _Authorize_, then log in to [Integration]. Later, you'll let your users do the same directly from your app.
    </Step>
    <Step title="Call the [Integration] API">
    Let's make your first request to the [Integration] API. Replace the placeholders below with your [Environment API key](/reference/backend/http-api/api-keys), [integration ID](https://app.nango.dev/dev/integrations), and [connection ID](https://app.nango.dev/dev/connections):
    <Tabs>
        <Tab title="cURL">

            ```bash
            [Generated curl example from step 3a]
            ```

        </Tab>

        <Tab title="Node">

        Install Nango's backend SDK with `npm i @nangohq/node`. Then run:

        ```typescript
        [Generated Node example from step 3a]
        ```
        </Tab>


    </Tabs>
    Or fetch credentials with the [Node SDK](/reference/backend/backend-sdk/node#get-a-connection-with-credentials) or [API](/reference/backend/http-api/connection/get).

    ✅ You're connected! Check the [Logs](https://app.nango.dev/dev/logs) tab in Nango to inspect requests.
    </Step>

    <Step title="Implement Nango in your app">
        Follow our [quickstart](/getting-started/quickstart) to integrate Nango in your app.

        To obtain your own production credentials, follow the setup guide linked below.
    </Step>
</Steps>
```

### 5. Create Integration Guides Section

**IMPORTANT: Auth Mode Detection**

First, check the provider's `auth_mode` in `packages/providers/providers.yaml` to determine the correct guide structure.

**For OAUTH2 auth mode:**
```markdown
## 📚 [Integration Name] Integration Guides

Nango maintained guides for common use cases.

- [How to register your own [Integration] API OAuth app](/api-integrations/[integration-slug]/how-to-register-your-own-[integration-slug]-api-oauth-app)
Register an OAuth app with [Integration] and obtain credentials to connect it to Nango

- [How do I link my [Integration] account?](/api-integrations/[integration-slug]/connect) **[Only if connect guide exists]**
Learn how to authenticate with [Integration] and link your account

Official docs: [[Integration] API docs]([API_DOCS_URL])
```

**For non-OAUTH2 auth modes (API_KEY, BASIC, APP_STORE, CUSTOM, etc.):**
```markdown
## 📚 [Integration Name] Integration Guides

Nango maintained guides for common use cases.

- [How do I link my [Integration] account?](/api-integrations/[integration-slug]/connect)
Learn how to obtain your [Integration] credentials and link your account

Official docs: [[Integration] API docs]([API_DOCS_URL])
```

**Instructions:**

**For OAUTH2 auth mode:**
- Create ONE guide link to the OAuth setup guide (don't duplicate links to the same page)
- **Check for connect guide:** If `docs/integrations/all/[integration-slug]/connect.mdx` exists, add a second guide link to the connect guide
- Link format is `/api-integrations/[integration-slug]/how-to-register-your-own-[integration-slug]-api-oauth-app`

**For non-OAUTH2 auth modes:**
- Create ONE guide link to the connect guide ONLY
- **DO NOT link** to a "how-to-obtain-api-key" guide - the connect guide serves this purpose
- Link format is `/api-integrations/[integration-slug]/connect`
- The connect guide should explain how to obtain credentials AND how to enter them in the Connect UI

**General instructions (all auth modes):**
- Use the integration name in lowercase with hyphens as the slug (e.g., `salesforce`, `hubspot`, `google-calendar`)
- **IMPORTANT:** Add TWO SPACES after the closing parenthesis `)` of each guide link before the line break to preserve proper Markdown formatting
- Extract the API documentation link from the "Useful links" tab (look for "API documentation" row)
- Additional guides for other topics (webhooks, syncs with metadata, etc.) should be added separately when those guides are created

### 6. Add Pre-built Syncs & Actions Section

**Format:**
```markdown
## 🧩 Pre-built syncs & actions for [Integration Name]

Enable them in your dashboard. [Extend and customize](/implementation-guides/platform/functions/customize-template) to fit your needs.

import PreBuiltUseCases from "/snippets/generated/[integration-slug]/PreBuiltUseCases.mdx"

<PreBuiltUseCases />
```

**Instructions:**
- Add the section with the import statement and component
- Use the integration slug in lowercase with hyphens (e.g., `salesforce`, `hubspot`, `google-calendar`)
- The snippet file path should be: `/snippets/generated/[integration-slug]/PreBuiltUseCases.mdx`
- This component will display the syncs and actions tables (those are maintained separately)
- Always include this section - the PreBuiltUseCases.mdx snippet will handle the empty state automatically

**Note on empty state:**
The PreBuiltUseCases.mdx snippet files are generated by `scripts/docs-gen-snippets.ts`. When there are no syncs/actions, the snippet will automatically display:
```
_No pre-built syncs or actions available yet._

<Tip>Not seeing the integration you need? [Build your own](https://nango.dev/docs/guides/functions/functions-guide) independently.</Tip>
```
Do not skip this section or create custom empty states - the snippet handles it.

### 7. Remove Old Tab Content

**Do NOT include in the new format:**
- OAuth app setup tab content (this goes into a separate guide file)
- Useful links tab content (reference specific links as needed)
- API gotchas tab content (this goes into a separate guide file)

### 8. Create Setup Guide File (Sub-guide)

**IMPORTANT: Auth Mode Detection**

Before creating guide files, check the provider's `auth_mode` in `packages/providers/providers.yaml`:

**For OAUTH2 auth mode:**
- **File path:** `docs/api-integrations/[integration-slug]/how-to-register-your-own-[integration-slug]-api-oauth-app.mdx`
- Create a full OAuth setup guide from the OAuth setup tab content
- In providers.yaml, use `setup_guide_url` property

**For non-OAUTH2 auth modes (API_KEY, BASIC, APP_STORE, CUSTOM, etc.):**
- **Primary guide:** Use the connect guide (connect.mdx) as the main guide, NOT a "How to obtain your API key" guide
- **File path:** `docs/api-integrations/[integration-slug]/connect.mdx`
- The connect guide explains how users link their account and enter credentials
- In providers.yaml, use `docs_connect` property (NOT `setup_guide_url`)
- **DO NOT create** a separate "how-to-obtain-your-[slug]-api-key.mdx" file - the connect guide serves this purpose

**Why this matters:**
For API_KEY and similar auth modes, users need to know how to find their API key/credentials AND how to enter them in the Connect UI. The connect guide covers both, while a separate "obtain API key" guide would be redundant and incomplete.

**Important:** The setup guide is a SUB-GUIDE, not the main integration page. The main integration page (from step 9) will be at `docs/api-integrations/[integration-slug].mdx`, and this setup guide should be at `docs/api-integrations/[integration-slug]/how-to-register-your-own-[integration-slug]-api-oauth-app.mdx` (for OAUTH2) or `docs/api-integrations/[integration-slug]/connect.mdx` (for non-OAUTH2) in a nested directory structure. The filename matches the guide title for SEO optimization (e.g., `how-to-register-your-own-salesforce-api-oauth-app.mdx`).

**IMPORTANT: Update docs.json sidebar navigation and redirects**
When creating guide files, you MUST update both the sidebar navigation and redirects in `docs/docs.json`:

**Changes required:**
1. **Replace old entry** in the "APIs & Integrations" group:
   - Find `"integrations/all/[integration-slug]"` in the "APIs & Integrations" pages array (around lines 278-864)
   - Replace it with ONE new entry in the same location:
     * `"api-integrations/[integration-slug]"` (main integration page ONLY)

2. **Add redirect** in the `redirects` array:
   - Find the `"redirects"` array near the top of docs.json (before the `navigation` section)
   - Add a new redirect object:
     ```json
     {
       "source": "/integrations/all/[integration-slug]",
       "destination": "/api-integrations/[integration-slug]"
     }
     ```
   - Ensure proper JSON formatting (comma before or after the new entry as needed)
   - This ensures the old URL redirects to the new URL on production

3. **DO NOT add setup guide pages to docs.json**
   - Setup guides exist at `docs/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app.mdx` but are NOT listed in navigation
   - Users access setup guides via links in the main integration page
   - Additional guide pages also NOT added to docs.json

4. **Keep the entry in the SAME location** within the "APIs & Integrations" group
   - DO NOT move entries to "API Guides" group
   - Just replace the old path with the new path (single entry)

5. **Use consistent path structure:**
   - Main page in docs.json: `"api-integrations/[slug]"` (e.g., `"api-integrations/salesforce"`)
   - Setup guide file path: `docs/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app.mdx` (NOT in docs.json)
   - Additional guide file paths: `docs/api-integrations/[slug]/how-to-[guide-name]-for-[slug].mdx` (NOT in docs.json)

**Step-by-step workflow for updating docs.json:**

```
1. Read docs/docs.json
2. ADD redirect in the redirects array:
   - Find the "redirects" array near the top of the file
   - Add new redirect object: {"source": "/integrations/all/[integration-slug]", "destination": "/api-integrations/[integration-slug]"}
   - Ensure proper JSON formatting (commas, quotes, brackets)
3. REPLACE old entry in "APIs & Integrations" group:
   - Find "APIs & Integrations" group (around line 278)
   - Locate "integrations/all/[integration-slug]" in the pages array
   - Replace that single entry with ONE new entry:
     * "api-integrations/[integration-slug]" (main page ONLY)
4. Keep entry in the SAME position within the "APIs & Integrations" pages array
5. Use Edit tool to update the docs.json file
6. Verify the JSON syntax is valid (proper commas, quotes, brackets)
```

**Example:**
If migrating `docs/integrations/all/salesforce.mdx`:
1. Add redirect to the `redirects` array:
   ```json
   {
     "source": "/integrations/all/salesforce",
     "destination": "/api-integrations/salesforce"
   }
   ```
2. Find `"integrations/all/salesforce"` in "APIs & Integrations" group pages array
3. Replace it with ONE entry in the same location:
   - `"api-integrations/salesforce"` (main integration page at `/docs/api-integrations/salesforce.mdx`)
4. Keep the same position in the array (e.g., if salesforce was between sage-intacct and salesforce-cdp, keep it there)
5. The setup guide at `/docs/api-integrations/salesforce/how-to-register-your-own-salesforce-api-oauth-app.mdx` is NOT added to docs.json

**For multiple guide pages (split sections):**
If the user approves splitting h2 sections into separate guides:
- Create files at `docs/api-integrations/salesforce/how-to-register-your-own-salesforce-api-oauth-app.mdx`, `docs/api-integrations/salesforce/how-to-set-up-webhooks-for-salesforce.mdx`, etc.
- Use title-based slugs for all guide files (e.g., "How to..." becomes `how-to-...`)
- DO NOT add these guide pages to docs.json
- Only the main integration page `"api-integrations/salesforce"` is in docs.json
- Users access guide pages via links in the main integration page

**For Tabbed Format:**
Extract content from OAuth setup tab to create a comprehensive setup guide following content guidelines.

**CRITICAL: Content Preservation**
When migrating OAuth setup tab content to setup guides:
- **COPY THE CONTENT EXACTLY AS-IS** - Do NOT modify, restructure, or enhance the original setup content
- **DO NOT** split multi-step items into separate steps
- **DO NOT** add new sections, notes, or additional resources
- **DO NOT** rearrange the structure or hierarchy
- **DO NOT** fix typos or grammar issues
- **PRESERVE** all original formatting, heading levels, step structures, and prose exactly
- **PRESERVE** all existing Notes, Tips, Warnings, and other components exactly as written
- The only changes allowed:
  - Update frontmatter to match the new format (title, sidebarTitle, description)
  - Change integration name placeholders if using a template

**Why this matters:**
The OAuth setup tab content has been carefully written and reviewed by the Nango team. Any modifications, even seemingly minor improvements, can introduce errors or change the intended meaning. Your job is to COPY this content to the new file structure, not to improve it.

**Detecting Separate Guide Candidates:**
Before creating the setup guide file:
1. **Scan for h2 sections** that cover distinct, substantial topics
2. **Evaluate** if any h2 section could stand alone as a separate guide (typically 3+ paragraphs or multiple steps)
3. **Ask the user for confirmation** if you identify potential separate guides:
   - List the h2 sections you found
   - Ask: "Should any of these sections become separate guide pages linked from the main guide?"
   - Wait for user response before proceeding
4. **If user confirms splitting:**
   - Create separate guide files for those sections at `docs/api-integrations/[integration-slug]/how-to-[descriptive-slug]-for-[integration-slug].mdx`
   - Use title-based slugs that match the guide titles (e.g., "How to set up webhooks" → `how-to-set-up-webhooks-for-[integration-slug].mdx`)
   - Replace the sections in the main guide with links to the new guides
   - Follow the same guide structure and frontmatter format
   - Add links to the Integration Guides section in the main integration file
   - These additional guide pages are NOT added to docs.json (accessed via links only)

**Example of asking for confirmation:**
```
I've detected the following h2 sections in the setup guide that could potentially become separate guides:

1. ## Setting up Webhooks
   - Covers webhook configuration and endpoint setup (5 paragraphs, 3 code examples)
   - Distinct topic from OAuth setup

2. ## Configuring Custom Domains
   - Covers custom domain setup for the OAuth flow (4 paragraphs with steps)
   - Self-contained topic

Should these sections become separate guide pages linked from the main guide?
- If yes, I'll create separate files and update the Integration Guides section
- If no, I'll keep them as sections within the main setup guide
```

**For Snippet-based Format:**
Extract and consolidate setup content from multiple sections:

**Sections to look for:**
- `## Setup guide` or `## Admin Setup for [integration]`
- `## Non-Admin Role Setup for [integration]`
- `## Connection configuration in Nango`
- `## Access requirements`
- Any other setup-related headings

**Structure:**
```markdown
---
title: 'Set up [Integration] with Nango'
sidebarTitle: '[Integration] Setup'
description: 'Register an OAuth app with [Integration] and connect it to Nango'
---

[Overview paragraph explaining what the reader will accomplish]

[Setup Content - Extract from setup sections, maintain heading structure]

[Additional setup sections as found in original]

[Weave in important gotchas contextually]

[Link to main API docs at end]

---
```

**For Tabbed Format:**

**Instructions:**
1. Write an overview paragraph explaining what the reader will accomplish
   - Example: "This guide shows you how to register your own app with Salesforce to obtain your OAuth credentials (client id & secret). These are required to let your users grant your app access to their Salesforce account."
2. Extract ALL content between `<Tab title="🧑‍💻 OAuth app setup">` and `</Tab>`
3. Review and weave in relevant information from other tabs:
   - **Useful links tab**: Only link to main API docs. Remove link collections.
   - **API gotchas tab**: Weave important gotchas into the guide prose where contextually relevant. Remove minor gotchas.
   - **Common scopes**: If present, either remove (link to external API docs instead) or briefly mention relevant scopes inline
4. Format the content following guide principles:
   - Keep `<Steps>` structure intact from OAuth setup
   - Keep all headings (##, ###, etc.)
   - Keep all notes, warnings, and special formatting
   - Use descriptive, SEO-friendly headings
   - Focus on end-to-end process
   - Link to external API docs instead of repeating their content
5. Use proper frontmatter with:
   - `title: 'Set up [Integration] with Nango'` or similar SEO-optimized title
   - `sidebarTitle: '[Integration] Setup'`
   - `description: 'Register an OAuth app with [Integration] and connect it to Nango'`

**Example for Salesforce:**

File: `docs/api-integrations/salesforce/how-to-register-your-own-salesforce-api-oauth-app.mdx`

```markdown
---
title: 'Set up Salesforce with Nango'
sidebarTitle: 'Salesforce Setup'
description: 'Register an OAuth app with Salesforce and connect it to Nango'
---

This guide shows you how to register your own app with Salesforce to obtain your OAuth credentials (client id & secret). These are required to let your users grant your app access to their Salesforce account.

## Creating a Connected App

<Steps>
   <Step title="Sign up for a Salesforce developer edition account">
     If you don't already have one, sign up for a [Salesforce Developer Edition account](https://developer.salesforce.com/signup).
   </Step>
   [... rest of OAuth setup steps ...]
</Steps>

<Note>Changes to your Connected App can take up to 10 minutes to take effect.</Note>

## Alternative: External Client Apps

[Content about External Client Apps if present - weave in context about when to use]

<Note>For the most frictionless integration experience, Nango recommends using Connected Apps. See [Salesforce's comparison guide](https://example.com) to understand the differences.</Note>

[Weave in important gotchas where contextually relevant in the steps above]

For more details on Salesforce's OAuth implementation, see [Salesforce's OAuth documentation](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_rest.htm).

---
```

**Handling edge cases:**
- If OAuth setup tab is missing: Create a minimal guide with placeholder text and add a warning
- If useful links tab exists: Only extract link to main API documentation. Ignore link collections.
- If API gotchas exist: Weave important ones into guide prose. Skip minor ones or those that don't affect many users.
- If common scopes table exists: Remove it and add a note to "see [API's scope documentation]" instead

**Key transformations from old to new format:**
- ❌ Remove: "Useful Resources" section with link lists
- ❌ Remove: "Common Issues & Gotchas" as separate section
- ❌ Remove: "Common Scopes" table
- ✅ Add: Overview paragraph at the beginning
- ✅ Add: Contextual notes and gotchas woven into steps
- ✅ Add: Single link to main API docs at end (if helpful)

### 9. Write Transformed Files

After completing steps 1-8, write the transformed files:

**A. Main Integration File**
- **New location:** `docs/api-integrations/[integration-slug].mdx` (MOVED from `docs/integrations/all/[integration-slug].mdx`)
- **Structure:**

```markdown
---
title: '[Integration]'
sidebarTitle: '[Integration]'
description: 'Integrate your application with the [Integration] API'
---

## 🚀 Quickstart

Connect to [Integration] with Nango and see data flow in 2 minutes.

<Steps>
    [4 steps as described above]
</Steps>

## 📚 [Integration] Integration Guides

Nango maintained guides for common use cases.

- [How to register your own [Integration] API OAuth app](/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app)
Register an OAuth app with [Integration] and obtain credentials to connect it to Nango

Official docs: [[Integration] API docs]([API_DOCS_URL])

## 🧩 Pre-built syncs & actions for [Integration]

Enable them in your dashboard. [Extend and customize](/implementation-guides/platform/functions/customize-template) to fit your needs.

import PreBuiltUseCases from "/snippets/generated/[integration-slug]/PreBuiltUseCases.mdx"

<PreBuiltUseCases />

---
```

**B. Setup Guide File (Sub-guide)**
- **Location:** `docs/api-integrations/[integration-slug]/how-to-register-your-own-[integration-slug]-api-oauth-app.mdx`
- **Structure:** As described in step 8

**C. Connect Guide File (if exists)**
- **Check for existence:** Use Read tool to check if `docs/integrations/all/[integration-slug]/connect.mdx` exists
- **Location (if exists):** Move content to `docs/api-integrations/[integration-slug]/connect.mdx`
- **Content:** Preserve exactly as-is (no modifications to frontmatter or content)
- **Link:** Add link to main integration page Integration Guides section if connect guide exists

**D. Additional Sub-guides (if user approved splitting)**
- **Location:** `docs/api-integrations/[integration-slug]/how-to-[descriptive-slug]-for-[integration-slug].mdx`
- **Structure:** As described in step 8

### 10. Validation Checklist

Before writing the transformed files, verify:

**Main integration file (MOVED to new location):**
- [ ] **File location:** `docs/api-integrations/[slug].mdx` (NOT `docs/integrations/all/[slug].mdx`)
- [ ] Frontmatter properly formatted (single opening `---`, no extra separators)
- [ ] Description updated to new format without emojis
- [ ] Tabs structure completely removed
- [ ] Quickstart has 4 steps with new intro sentence
- [ ] "✅ You're connected!" moved inside Step 3
- [ ] Tip block removed from end of Quickstart
- [ ] New Step 4 added with implementation guide reference
- [ ] Integration Guides section created with correct link format
- [ ] Guide link uses format: `/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app` (e.g., `/api-integrations/salesforce/how-to-register-your-own-salesforce-api-oauth-app`)
  - **Important:** Links to the SETUP guide (with title-based filename), not the main page
  - **Important:** TWO SPACES added after closing parenthesis `)` before line break
- [ ] **Connect guide checked:** If `docs/integrations/all/[slug]/connect.mdx` exists, link to connect guide added
- [ ] **Connect guide link format:** If exists, uses format `/api-integrations/[slug]/connect`
- [ ] API docs link extracted and included
- [ ] Pre-built syncs & actions section included using snippet import (always include)
- [ ] Snippet import uses correct path: `/snippets/generated/[slug]/PreBuiltUseCases.mdx`
- [ ] Snippet file will handle empty state automatically (no manual empty state needed)
- [ ] No old tab content remains in the file
- [ ] Final `---` separator at end of file

**Setup guide file (Sub-guide):**
- [ ] **Checked auth_mode:** Determined if provider uses OAUTH2 or non-OAUTH2
- [ ] **For OAUTH2 - File location:** `docs/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app.mdx`
- [ ] **For non-OAUTH2 - File location:** `docs/api-integrations/[slug]/connect.mdx` (connect guide serves as the primary guide)
- [ ] **Content quality checked:** Typos and grammar issues fixed, Nango-specific instructions preserved
- [ ] Proper frontmatter with SEO-optimized title, sidebarTitle, description
- [ ] Overview paragraph explaining what reader will accomplish
- [ ] **For OAUTH2:** OAuth setup content extracted and formatted
- [ ] **For non-OAUTH2:** Connect guide explains how to obtain credentials AND enter them in Connect UI
- [ ] **Scanned for h2 sections that should become separate guides**
- [ ] **If separate guide candidates found, asked user for confirmation**
- [ ] **If user approved splitting, created separate guide files and updated links**
- [ ] Important gotchas woven into guide prose (not as separate section)
- [ ] Link to main API docs included (if helpful)
- [ ] Removed: Useful Resources section with link lists
- [ ] Removed: Common Issues & Gotchas as separate section
- [ ] Removed: Common Scopes table
- [ ] Uses descriptive, SEO-friendly headings (h2, h3)
- [ ] Follows guide writing principles (focused, end-to-end, links to external docs)
- [ ] Final `---` separator at end of file

**Connect guide file (if exists):**
- [ ] **Checked for existence:** Used Read tool to check if `docs/integrations/all/[slug]/connect.mdx` exists
- [ ] **File location (if exists):** Moved to `docs/api-integrations/[slug]/connect.mdx`
- [ ] **Content preserved exactly:** All content copied as-is without modifications
- [ ] **Frontmatter preserved:** Title, sidebarTitle, description kept unchanged
- [ ] **Image paths checked:** If connect guide has images, verify they still work or update paths if needed
- [ ] **Added to Integration Guides section:** Link added to main integration page if connect guide exists
- [ ] **NOT added to docs.json:** Connect guide exists only as file, accessed via links

**docs.json updates:**
- [ ] **Added redirect:** `{"source": "/integrations/all/[slug]", "destination": "/api-integrations/[slug]"}` to redirects array
- [ ] **Replaced old entry:** `"integrations/all/[slug]"` with ONE new entry in "APIs & Integrations" group
- [ ] **Added main page ONLY:** `"api-integrations/[slug]"` in same location
- [ ] **Did NOT add setup guide:** Setup guide exists at file path but NOT in docs.json
- [ ] **Did NOT add additional guides:** Additional guides exist at file paths but NOT in docs.json
- [ ] **Entry kept in SAME position** within "APIs & Integrations" pages array
- [ ] **Valid JSON syntax:** Proper commas, quotes, brackets verified

**providers.yaml updates:**
- [ ] **Checked auth_mode:** Determined if provider uses OAUTH2 or non-OAUTH2 (API_KEY, BASIC, etc.)
- [ ] **Updated docs URL:** `docs: https://nango.dev/docs/api-integrations/[slug]`
- [ ] **For OAUTH2:** Added/updated `setup_guide_url: https://nango.dev/docs/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app`
- [ ] **For non-OAUTH2:** Added/updated `docs_connect: https://nango.dev/docs/api-integrations/[slug]/connect` (instead of setup_guide_url)
- [ ] **For OAUTH2 with connect guide:** Also added `docs_connect: https://nango.dev/docs/api-integrations/[slug]/connect`
- [ ] **Valid YAML syntax:** Proper indentation and formatting verified
