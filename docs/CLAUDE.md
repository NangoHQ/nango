# Docs guidance for AI agents

## Validate links after every change that touches URLs or anchors

Run `mintlify broken-links` from `docs/` before pushing any change that:
- renames, moves, or deletes a page
- changes a heading (anchors are derived from heading text)
- updates internal `/...` links

The scan must end with `success no broken links found`.

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

## Docs architecture

The docs have two distinct section types with different purposes:

- **Use cases** — orientation and routing pages only. Help readers understand what problem a use case solves, when to use Nango for it, and which technical docs to follow. No step-by-step implementation blocks. Link to functions guides instead. Keep them flat (no nesting). Aim for ~100–200 lines.
- **Functions** — technical source of truth. Owns building, testing, deploying, triggering, syncing, scheduling, checkpoints, records cache, and HTTP invocation. Step-by-step guides live here and must be end-to-end (no missing steps).

General functions guides may mention a concept (e.g. checkpoints) but should link to the dedicated page rather than duplicating the explanation.

## Terminology: use "functions" as the core primitive

Use `function` / `functions` as the main term throughout the docs.

Only refer to `actions` or `syncs` when the specific type distinction is technically necessary:
- A sync is a function type that is scheduled and typically persists records.
- An action is a function type that is triggered by HTTP or explicit calls.

Prefer:
> Create a function

Over:
> Create an action or sync

## Content style

- Short paragraphs, clear headings, direct instructions, minimal correct examples.
- No walls of text, long generic intros, endless bullet lists, vague marketing language, AI-generated filler, or overexplaining obvious concepts.
- Do not repeat the same explanation across multiple pages — pick one owner and link from everywhere else.
- Use cases may have a light orientation tone but must stay concrete.
- Technical guides must be precise, practical, and compact.

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
