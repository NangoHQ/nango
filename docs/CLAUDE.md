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
