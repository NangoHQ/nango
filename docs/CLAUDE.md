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

When a PR renames or removes pages and uses a bulk `find … -exec sed` to update internal links across many files, the rewrite only touches files that exist on the branch *at that moment*. If you later `git pull --rebase` or `git merge master` and pick up new files authored on master (e.g. a new `api-integrations/<provider>.mdx`), those imported files still contain the old links and won't get caught by the earlier sed.

After every pull/merge that touches `docs/`, re-run the same sed against `docs/**/*.mdx` to bring newly imported files in line with the rename. `mintlify broken-links` may not flag these as hard failures if the old paths are kept alive via `redirects` in `docs.json` — they'll resolve via the redirect, but they're stale and should point at the canonical destination.

A `redirects` entry in `docs.json` makes a stale link "work" without surfacing as broken. Useful for external bookmarks, but it can mask drift inside the docs themselves. After a rename is fully rolled out, consider removing the redirect so any remaining stale internal link is caught as a real broken link instead.
