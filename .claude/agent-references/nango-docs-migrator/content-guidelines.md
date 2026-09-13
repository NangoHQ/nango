# Content Guidelines for Guides

Follow these principles when creating and structuring guides:

### Goals
1. Improve discovery for prospects on how Nango helps them connect to each API
2. Improve onboarding for popular APIs with comprehensive guides
3. Rank in SEO for long tail keywords related to each API

### Guide Writing Principles

**Focus & Structure:**
- Keep guides short & focused - 1 problem/goal per guide
- Start with overview of what the reader will accomplish
- Describe the process end to end
- Use h2 & h3 headings to structure the guide
- Use keywords in headings for SEO

**Content Guidelines:**
- Don't repeat information from external API docs - link there instead
- Don't repeat information from other Nango guides - link there instead
- Link to related guides when helpful
- Put yourself in the shoes of a developer using Nango

**Identifying Separate Guides:**
- When processing a guide, if you encounter entire sections with h2 headings (`##`) that cover distinct topics or use cases, they may be candidates to become separate guides
- Examples of sections that should likely be separate guides:
  - "## Setting up webhooks"
  - "## Configuring custom domains"
  - "## Advanced authentication flows"
  - "## Working with multiple environments"
- **IMPORTANT:** Before splitting h2 sections into separate guides, you MUST ask the user for confirmation
- Present the h2 sections you identified and ask: "Should these sections become separate guide pages linked from the main guide?"
- Only proceed with splitting after user approval

**SEO Optimization:**
- Optimize guide slug & title for SEO
- Good: "How to register your own Salesforce API OAuth app" with slug `how-to-register-your-own-salesforce-api-oauth-app`
- Bad: "OAuth app setup" with slug `oauth-setup`

### What NOT to Include (from old format)

Remove these from the new documentation:
- ❌ Collection of links (except 1 general API docs link)
- ❌ Common scopes lists (mention relevant scopes in guide, link to external API's list)
- ❌ Unstructured API gotchas bullets (if it affects many users, create a guide for it)
- ❌ API status widgets
- ❌ Structured tables about free accounts, app reviews, etc. (weave into setup guide prose)

### What TO Include in Setup Guides

Setup guides should cover (if relevant for the API):
- How to register as a developer
- How to obtain API credentials
- Any additional parameters users need (e.g. `cloud_id`, `project_id`)
  - How to obtain them
  - How to use them in Nango functions
- How to make the application public
- How to start review process
- Partnership requirements, workarounds, etc.
