# Docs guidance for AI agents

## Validate links after every change that touches URLs or anchors

Run `mintlify broken-links` from `docs/` before pushing any change that:
- renames, moves, or deletes a page
- changes a heading (anchors are derived from heading text)
- updates internal `/...` links

The scan must end with `success no broken links found`.

## Prefix docs PR titles with `docs:`

Pull requests that only change docs must have a PR title prefixed with `docs:`.

## Use sentence case for docs titles

Use sentence case for page titles, sidebar titles, card titles, and headings. Keep proper nouns and initialisms in their standard casing, such as Nango, MCP, API, OAuth, CI/CD, and GDPR.

## Use HTTP APIs in agent instructions

In "For agents" accordions and other coding-agent-specific instructions, prefer Nango's HTTP APIs over backend SDK snippets. Coding agents can translate HTTP examples into the user's stack, and API examples avoid assuming a specific language or package.

When an agent instruction calls the Nango API, include or reference Nango API authentication: the user must create/sign into a Nango account, provide a Nango API key from the Environment settings tab > API Keys, and send it as `Authorization: Bearer <NANGO-API-KEY>`. Mention the required scopes when a scoped API key can be used instead of the default full-access API key.

Use the term "API key" for Nango environment keys. Avoid legacy key terminology in docs or examples, except when referencing exact current CLI environment variables such as `NANGO_SECRET_KEY_<ENV_NAME>`. In those cases, explain that the variable stores a Nango API key.

## Keep link maintenance tightly scoped

When asked to update docs links, only edit links. In application or package code, a docs-link change must be limited to replacing the URL string itself. Do not make type changes, formatting changes, lint fixes, refactors, or behavior changes while touching links.

The only legitimate reason for a docs task to edit application or package code is to update docs URLs. When that happens, run `npx prettier --check <changed-code-files>` before pushing to catch formatting changes caused by longer or shorter URLs.

Generated docs output must stay out of link-only PRs unless the user explicitly asks to include it. If a generator needs changes, update the generator or source metadata and leave the generated files for a separate generation PR.

## Reference dashboard tabs by name, not URL

When guiding readers to a tab in the Nango dashboard, reference the tab by its visible name instead of linking to a dashboard URL. Dashboard URLs include the environment, and that environment is not predictable across accounts.

## Never use `{#anchor}` heading-id syntax

Mintlify's MDX parser treats `{...}` as a JavaScript expression and chokes on `#` inside it. A single `## Heading {#anchor}` anywhere in the docs aborts `mintlify broken-links` for the **entire site** before it can scan for actual broken links.

To pin an anchor to a heading, use an inline HTML anchor on the line above:

```mdx
<a id="my-anchor"></a>
## My heading
```

Browsers honor `id` attributes for fragment scrolling identically to heading-generated IDs.

## Re-run link rewrites after pulling/merging master

After every pull/merge that touches `docs/`, re-run the same sed against `docs/**/*.mdx` to bring newly imported files in line with the rename. `mintlify broken-links` may not flag these as hard failures if the old paths are kept alive via `redirects` in `docs.json` — they'll resolve via the redirect, but they're stale and should point at the canonical destination.

## Documentation tab structure

Keep the documentation tab organized around the reader's journey and the ownership of each topic.

### Getting started

Getting started is the first experience with Nango. Keep it minimal, low friction, and optimized for simplicity and conviction.

- **Introduction** — explain Nango in the simplest possible way. Help readers understand what Nango is and why it matters without technical depth.
- **Quick start** — show how Nango works at a high level and create the "wow" moment quickly. Favor a smooth path over completeness.

Do not overload Getting started with edge cases, limits, architecture details, or exhaustive implementation guidance. Link out to Guides and Reference for depth.

### Guides

Guides are the home for practical technical content and customer-orientation content. They should help readers understand Nango's primitives, platform behavior, constraints, and implementation paths.

Use these ownership rules:

- **Auth** — technical guides specific to Nango Auth, connection flows, auth configuration, credentials, provider setup, and auth-specific behavior.
- **Functions** — technical guides specific to Nango Functions. This includes building, testing, deploying, CI/CD, sync functions, action functions, webhook functions, event functions, tool calling, data validation, checkpoints, records cache, and other function-only concerns.
- **Platform** — technical guides for concepts common to Auth and Functions. This includes environments, observability, limits, security, self-hosting, webhook forwarding, and webhooks received from Nango.
- **Use cases** — orientation and routing pages only. Start from the customer's problem or investigation context, explain when Nango is useful, and point to the right primitives, guides, and references. Use cases can lightly pitch the value, but they should not contain step-by-step implementation details or become the technical source of truth.

When deciding where content belongs, ask whether it is specific to Auth, specific to Functions, or common to both. Specific content belongs under the relevant primitive; shared platform behavior belongs under Platform.

Examples:

- Webhook forwarding belongs under Platform.
- Webhook functions belong under Functions.
- Webhooks received from Nango belong under Platform.
- Sync functions, action functions, event functions, CI/CD, testing, and data validation belong under Functions.

General functions guides may mention a concept (e.g. checkpoints) but should link to the dedicated page rather than duplicating the explanation.

### Reference

Reference is the code-adjacent surface area: API endpoints, SDK methods, method signatures, schemas, parameters, return values, events, and other exact interfaces Nango exposes.

Reference should be precise and easy to scan. Guides should link to Reference for exact details, and Reference can link back to Guides when a concept needs explanation or an end-to-end implementation path.

## Terminology: use function type names

Use `function` / `functions` as the main term throughout the docs. Nango Functions are the core primitive; avoid positioning actions and syncs as separate top-level primitives.

Use specific function type names only when the distinction matters for implementation, navigation, or exact API/SDK fields. For example, a quickstart can say "call the function" while the HTTP request still uses the literal `action_name` field required by the API.

Use these names for function types:
- **Sync functions** — functions that keep external API data fresh and typically persist records.
- **Action functions** — functions your app, backend job, or agent calls on demand.
- **Webhook functions** — functions that process external API webhooks inside Nango.
- **Event functions** — functions that run on Nango connection lifecycle events.

Prefer canonical function type names over labels based on trigger mechanics.

## Glossary

Keep this glossary current as docs terminology evolves.

- **Template** — the reusable blueprint for a Nango function. A template is code, not a deployed function. Customers can deploy a template to Nango directly or clone it into their local functions repo before customizing it.
- **Template function** — product-facing term for a Nango-maintained, pre-built function implementation that customers can deploy from the UI, and soon via API. Use this when discussing the implementation or product workflow.
- **Template use case** — marketing-facing term for the business need a template function solves. Use this before readers are familiar with Nango Functions.

## Content style

- Short paragraphs, clear headings, direct instructions, minimal correct examples.
- No walls of text, long generic intros, endless bullet lists, vague marketing language, AI-generated filler, or overexplaining obvious concepts.
- Do not repeat the same explanation across multiple pages — pick one owner and link from everywhere else.
- Use cases may have a light orientation tone but must stay concrete.
- Technical guides must be precise, practical, and compact.
- Write for developers who want signal. Optimize for specificity, clarity, and insight, not fancy wording.
- Use the most compact, simple phrasing that still preserves the technical point, similar to Paul Graham's essays.
- Prefer concrete details over generic claims. Prefer technical detail over marketing language. Prefer real examples over abstractions.
- Avoid theoretical claims unless they are tied to a real implementation detail, API behavior, limit, example, or tradeoff.
- After drafting copy, review it with these questions:
  - Is this specific enough?
  - Would a developer learn something from this?
  - Does this include real details, or just polished wording?
- Copy is strong if it would still be useful with imperfect English. Copy is weak if it relies on polished wording to sound good.

## Agent accordions

In step-by-step technical guides, add an agent-focused accordion where there is a real programmatic alternative to a dashboard step. These help agents or users implementing things programmatically.

An accordion should contain:
- The programmatic API or CLI alternative to the dashboard step
- Relevant references (API paths, CLI commands, SDK methods)
- Required arguments or configuration details
- Important implementation notes

Do not add agent accordions mechanically on every page — only where a genuine programmatic path exists and an agent would need the extra references to complete the step correctly.

## Workflow for restructuring docs

When restructuring docs, work in structured passes:

1. **Audit** — map existing pages, identify misplaced content, flag likely broken links and anchors.
2. **Propose structure** — define new page names and content ownership before editing.
3. **Move and rewrite** — relocate technical content into functions guides; rewrite use cases as orientation pages.
4. **Technical accuracy** — verify every code snippet: imports, function names, CLI commands, API paths, config fields. Check against the codebase. Do not guess provider-specific behavior; if uncertain, remove, simplify, or leave a `TODO`.
5. **Completeness** — ensure every step-by-step guide is end-to-end with no missing steps.
6. **Information architecture** — confirm use cases link to functions guides and nothing is duplicated.
7. **Links and anchors** — update all internal links and anchors after any rename or move; run `mintlify broken-links`.
8. **Final quality** — read through for style, accuracy, and completeness.

Before the final pass, compare against the live docs at `https://nango.dev/docs` to confirm no useful information was lost.
