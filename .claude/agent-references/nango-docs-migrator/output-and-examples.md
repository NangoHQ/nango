## Output Format

When migrating a file, report:

**Source file:** `docs/integrations/all/[integration].mdx`

**Destination (main file):** `docs/api-integrations/[integration].mdx`

**Status:** ✅ Migrated | ⚠️ Partial | ❌ Failed

**Changes to main file:**
- Moved from `integrations/all/` to `api-integrations/`
- Restructured Quickstart (4 steps)
- Added Integration Guides section (linking to setup guide with TWO SPACES after closing parenthesis)
- Added Pre-built syncs & actions section using snippet import

**Setup guide (sub-guide):** `docs/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app.mdx`

**Status:** ✅ Created | ⚠️ Partial | ❌ Failed | 🤔 Awaiting User Decision

**H2 sections detected for potential splitting:**
If applicable, list h2 sections that could become separate guides and indicate that you're asking for user confirmation:
- `## Section Name 1` - [Brief description]
- `## Section Name 2` - [Brief description]
- **Action:** Asking user whether to split these into separate guide pages

**Setup guide includes:**
- Overview paragraph
- OAuth app setup steps
- Important gotchas woven into prose ([N] gotchas integrated)
- Link to main API documentation

**Connect guide (if exists):** `docs/api-integrations/[slug]/connect.mdx`

**Status:** ✅ Moved | ⏭️ Not Found (no connect guide for this integration)

**Connect guide details (if exists):**
- Moved from `docs/integrations/all/[slug]/connect.mdx` to `docs/api-integrations/[slug]/connect.mdx`
- Content preserved exactly as-is
- Link added to Integration Guides section in main page
- `docs_connect` property updated in providers.yaml

**docs.json updates:**
- ✅ Added redirect from `/integrations/all/[slug]` to `/api-integrations/[slug]` in redirects array
- ✅ Replaced `integrations/all/[slug]` with ONE new entry in "APIs & Integrations" group
- ✅ Added `api-integrations/[slug]` (main page ONLY) in same location
- ✅ Did NOT add setup guide to docs.json (exists only as file)
- ✅ Kept entry in same position within "APIs & Integrations" pages array

**providers.yaml updates:**
- ✅ Checked auth_mode: [OAUTH2 | API_KEY | BASIC | etc.]
- ✅ Updated docs URL to `https://nango.dev/docs/api-integrations/[slug]`
- **For OAUTH2:** ✅ Added/updated setup_guide_url to `https://nango.dev/docs/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app`
- **For non-OAUTH2:** ✅ Added/updated docs_connect to `https://nango.dev/docs/api-integrations/[slug]/connect` (instead of setup_guide_url)
- **For OAUTH2 with connect guide:** ✅ Also added docs_connect to `https://nango.dev/docs/api-integrations/[slug]/connect` | ⏭️ Skipped (no connect guide)

**Additional guides created (if user confirmed splitting):**
- `docs/api-integrations/[slug]/how-to-[descriptive-slug]-for-[slug].mdx` - [Guide title]
- ✅ Created file but did NOT add to docs.json (accessed via links only)

**Setup guide removed (following content guidelines):**
- Useful Resources section
- Common Issues & Gotchas section
- Common Scopes table

**Warnings:**
- [Any issues or missing data]

**Summary:**
- Main integration file: ✅ (moved to `api-integrations/[slug].mdx`)
- Setup guide file: ✅ (created at `api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app.mdx`) | 🤔 (awaiting decision on splitting)
- docs.json updated: ✅ (replaced old entry with ONE new entry: main page only)
- All links verified: ✅

## Handling Edge Cases

### Integration with Custom Quickstart Format

If the quickstart has unusual structure:
1. Preserve the core workflow
2. Adapt to the 4-step format as closely as possible
3. Note deviations in warnings

### Missing API Documentation Link

If you can't find the API docs link:
- Use placeholder: `[[Integration] API docs](https://www.[integration].com/docs)`
- Add warning for manual verification

### Integration Slug Ambiguity

For integrations with multi-word names:
- Use lowercase with hyphens
- Examples: `google-calendar`, `microsoft-teams`, `slack`, `salesforce`
- Preserve any existing slug conventions from the repo

### No Syncs or Actions

If the integration has no syncs/actions:
- Always include the "Pre-built syncs & actions" section with the PreBuiltUseCases import
- The snippet file will automatically display the empty state message
- Do not create custom empty states or skip the section

## Quality Standards

**Must have:**
- [ ] Valid MDX syntax
- [ ] Proper frontmatter structure
- [ ] All 4 quickstart steps present
- [ ] Working internal links
- [ ] Consistent formatting
- [ ] Typos and grammar issues fixed

**Should have:**
- [ ] Accurate syncs/actions data
- [ ] Correct API docs link
- [ ] Proper integration name capitalization
- [ ] Nango-specific instructions preserved in setup guides

**Nice to have:**
- [ ] Resource categories for syncs/actions
- [ ] Descriptive function names

## Example Transformation

**INPUT:** `docs/integrations/all/salesforce.mdx` (old format with tabs)

**OUTPUT FILES:**
1. `docs/api-integrations/salesforce.mdx` (main integration page - MOVED)
2. `docs/api-integrations/salesforce/how-to-register-your-own-salesforce-api-oauth-app.mdx` (setup guide - NEW)
3. `docs/api-integrations/salesforce/connect.mdx` (connect guide - MOVED, if it exists)

**Key differences in main file:**
1. **File moved** from `integrations/all/` to `api-integrations/`
2. Frontmatter has updated description (emojis removed)
4. No Tabs wrapper
5. Quickstart is inline with 4 steps
6. Integration Guides section added (linking to `/api-integrations/salesforce/how-to-register-your-own-salesforce-api-oauth-app` with TWO SPACES after closing parenthesis)
7. If connect guide exists, link added to `/api-integrations/salesforce/connect`
8. Pre-built syncs & actions section added
9. OAuth setup, links, and gotchas removed (moved to separate setup guide file)

**docs.json changes:**
1. Added redirect: `{"source": "/integrations/all/salesforce", "destination": "/api-integrations/salesforce"}` to redirects array
2. Removed `"integrations/all/salesforce"` from "APIs & Integrations" group
3. Added `"api-integrations/salesforce"` in same location within "APIs & Integrations" group
4. Did NOT add setup guide or connect guide to docs.json (accessed via links only)
5. Entry kept in same position (not alphabetically sorted, replaced in-place)

**providers.yaml changes:**
1. Updated `docs` property to `https://nango.dev/docs/api-integrations/salesforce`
2. Added `setup_guide_url: https://nango.dev/docs/api-integrations/salesforce/salesforce-api-oauth-app-setup`
3. If connect guide exists, updated `docs_connect: https://nango.dev/docs/api-integrations/salesforce/connect`

## Parallel Processing

When migrating multiple files:
1. Use Glob to find all integration files: `docs/integrations/all/*.mdx`
2. Process up to 5 files concurrently
3. Report progress after each batch
4. Collect warnings and errors for final summary

**Batch reporting:**
```
Batch 1 of 4 complete (5/20 files)
✅ salesforce.mdx
✅ hubspot.mdx
⚠️ google-calendar.mdx (missing syncs data)
✅ slack.mdx
❌ custom-oauth.mdx (parse error)
```

## Error Recovery

If a file fails to parse or transform:
1. Note the specific error
2. Skip to next file (don't block the batch)
3. Provide detailed error in final summary
4. Suggest manual review for failed files

## Anti-Patterns to Avoid

❌ **Don't** modify the original file without reading it first
❌ **Don't** remove or simplify Nango-specific instructions from setup guides
❌ **Don't** change the technical content or setup steps when fixing typos
❌ **Don't** guess at syncs/actions data - verify or mark as missing
❌ **Don't** preserve old tab structure in main file
❌ **Don't** include OAuth setup content in main integration file
❌ **Don't** skip validation checklist
❌ **Don't** forget to create the setup guide file
❌ **Don't** forget to check for connect guide at `docs/integrations/all/[slug]/connect.mdx`
❌ **Don't** forget to update docs.json sidebar navigation when creating guide files
❌ **Don't** forget to update `docs_connect` in providers.yaml if connect guide exists
❌ **Don't** include `<PreBuiltTooling />` in main integration files (only use `<PreBuiltUseCases />`)
❌ **Don't** automatically split h2 sections into separate guides without asking the user for confirmation first
❌ **Don't** create "how-to-obtain-your-[slug]-api-key.mdx" files for non-OAUTH2 providers - use connect.mdx instead
❌ **Don't** use `setup_guide_url` for non-OAUTH2 providers - use `docs_connect` in providers.yaml instead

## Success Criteria

A successful migration means:
1. **All integration files MOVED** from `docs/integrations/all/[slug].mdx` to `docs/api-integrations/[slug].mdx`
2. All integration files transformed to new format (4-step quickstart, guides section, syncs section)
3. **All setup guide files created** at `docs/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app.mdx` (in nested directory with title-based filename)
4. **Connect guides checked and moved (if they exist):**
   - Check for `docs/integrations/all/[slug]/connect.mdx`
   - If exists, move to `docs/api-integrations/[slug]/connect.mdx`
   - Add link to connect guide in main integration page
   - Update `docs_connect` property in providers.yaml
5. **docs.json updated correctly:**
   - Redirect added in redirects array: `{"source": "/integrations/all/[slug]", "destination": "/api-integrations/[slug]"}`
   - Old entries replaced in "APIs & Integrations" group (changed from `integrations/all/[slug]`)
   - Main page ONLY added in same location (`api-integrations/[slug]`)
   - Setup guide and connect guide NOT added to docs.json (exist as files only, accessed via links)
   - Entry kept in same position within "APIs & Integrations" pages array
6. **providers.yaml updated correctly:**
   - `docs` property updated to: `https://nango.dev/docs/api-integrations/[slug]`
   - **For OAUTH2:** `setup_guide_url` property added/updated to: `https://nango.dev/docs/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app`
   - **For non-OAUTH2 (API_KEY, BASIC, etc.):** `docs_connect` property added/updated to: `https://nango.dev/docs/api-integrations/[slug]/connect` (instead of setup_guide_url)
   - **For OAUTH2 with connect guide:** Also add `docs_connect` property to: `https://nango.dev/docs/api-integrations/[slug]/connect`
7. Valid MDX syntax in all files
8. **No broken internal links:**
   - Main page links to setup guide: `/api-integrations/[slug]/how-to-register-your-own-[slug]-api-oauth-app`
   - Main page links to connect guide: `/api-integrations/[slug]/connect` (if it exists)
   - Main page links to syncs snippet: `/snippets/generated/[slug]/PreBuiltUseCases.mdx`
9. Syncs/actions data accurate (or clearly marked as missing)
10. All tabs content properly extracted and placed in setup guides
11. PreBuiltTooling component removed from main integration files
12. **Old source files can be deleted** (optional - main file has been moved, not copied)
