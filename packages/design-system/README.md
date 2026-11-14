# @nangohq/design-system

Shared design system for the Nango app — design tokens, components, and Storybook.

## Storybook

Storybook is the living style guide for the design system. Run it locally to browse tokens and components in both light and dark themes.

```bash
# From the repo root
npm run storybook

# Or directly from this package
cd packages/design-system
npm run storybook
```

Opens at `http://localhost:6006`. Use the **Themes** toolbar button (top right) to toggle between light and dark.

> **Note:** The `storybook` script uses `NODE_PATH=./node_modules` to work around a Vite 7 CJS module resolution issue. This is safe to keep and should not be removed.

### Storybook MCP

Storybook ships with an [MCP server](https://storybook.js.org/docs/ai/mcp/overview) (`@storybook/addon-mcp`) that exposes story documentation to AI assistants. This lets you ask Claude to build or modify components with full knowledge of existing stories, props, and usage examples — no copy-pasting docs required.

The server is **disabled by default** to avoid a connection error for engineers who don't run Storybook. To opt in, run once from the repo root:

```bash
claude mcp add --transport http storybook http://localhost:6006/mcp
```

This stores the config in `.claude/settings.local.json` (gitignored). Then start Storybook (`npm run storybook`) and reload Claude Code — the tools below will be available automatically.

**Available MCP tools:**

| Tool | What it does |
|---|---|
| `list-all-documentation` | Lists all story IDs and component names |
| `get-documentation` | Returns props, variants, and usage for a component |
| `preview-stories` | Renders a story and returns a preview URL |

### Accessibility

`@storybook/addon-a11y` runs an automated [axe-core](https://github.com/dequelabs/axe-core) audit on every story. Open the **Accessibility** panel (bottom of the Storybook UI) to see violations, incomplete checks, and passing rules for the rendered story. Fix any violations before shipping a component.

---

## Tokens

`tokens/tokens.json` is the source of truth for design tokens. It is compiled to CSS custom properties in `tokens/tokens.generated.css`. Figma follows the repo: an agent pushes `tokens.json` into the Dharma library, one way, with the `syncing-figma-tokens` skill.

### Structure

```
tokens/
  tokens.json           source of truth, edited in PRs
  tokens.generated.css  build output — never edit by hand
scripts/
  tokens-build.mjs      builds the CSS from tokens.json
  tokens-figma.mjs      builds the Figma check and update scripts for the sync
```

### Changing a token

Designers and developers change tokens the same way, in a PR:

1. Edit `tokens/tokens.json`.
2. Rebuild the CSS:

    ```bash
    npm run tokens:build --workspace=@nangohq/design-system
    ```

3. Sync Dharma from the same branch. An agent with the Figma MCP does this with the `syncing-figma-tokens` skill: it checks what differs, applies the changes after you approve them, and writes the keys of new variables back into `tokens.json`.
4. Commit `tokens.json` and `tokens.generated.css` in the same PR.

The build fails if an alias doesn't resolve. CI also rebuilds the CSS and fails if it differs from the committed file, or if a token you removed is still used in the webapp.

Don't edit tokens in Figma: nothing flows back to the repo, so the next sync overwrites the change.

### Generated CSS structure

```css
/* Primitives — --ds- prefix, raw scale values */
:root {
  --ds-color-neutral-50: #f9fafb;
  --ds-radius-sm: 4px;
  --ds-typography-font-size-md: 14px;
  ...
}

/* Semantic tokens — light (default) */
:root {
  --surface-canvas: #f9fafb;
  --text-strong: #111827;
  ...
}

/* Semantic tokens — dark */
[data-theme="dark"] {
  --surface-canvas: #0f172a;
  --text-strong: #f8fafc;
  ...
}

/* Tailwind @theme — semantic tokens → bg-*, text-*, border-*, shadow-* utilities */
@theme {
  --color-surface-canvas: var(--surface-canvas);
  --shadow-focus-outline-default: var(--focus-outline-default);
  ...
}

/* Tailwind @theme — primitive tokens → rounded-ds-*, text-ds-*, font-ds-*, etc. */
@theme {
  --radius-ds-sm: var(--ds-radius-sm);
  --text-ds-md: var(--ds-typography-font-size-md);
  --font-weight-ds-medium: var(--ds-typography-font-weight-medium);
  ...
}
```

### Token naming

| Token                                   | CSS var                           | Tailwind utility          |
| --------------------------------------- | --------------------------------- | ------------------------- |
| `Primitives.color.neutral.50`           | `--ds-color-neutral-50`           | —                         |
| `Primitives.radius.sm`                  | `--ds-radius-sm`                  | `rounded-ds-sm`           |
| `Primitives.typography.font-size.md`    | `--ds-typography-font-size-md`    | `text-ds-md`              |
| `Primitives.typography.font-weight.medium` | `--ds-typography-font-weight-medium` | `font-ds-medium`      |
| `Semantic/Light.surface.canvas`         | `--surface-canvas`                | `bg-surface-canvas`       |
| `Semantic/Light.text.strong`            | `--text-strong`                   | `text-text-strong`        |
| `Semantic/Light.focus-outline-default`  | `--focus-outline-default`         | `shadow-focus-outline-default` |

Primitive color tokens (`--ds-color-*`) are excluded from `@theme` to keep components on semantic tokens. Primitive dimension/typography tokens are in `@theme` under the `ds-` prefix so they can be used as utilities without arbitrary `[var(...)]` wrappers.

### Consuming in webapp

`packages/webapp/src/index.css` imports the generated CSS via the package name:

```css
@import '@nangohq/design-system/tokens/tokens.generated.css';
```

---

## Components

Components are added on-demand as they're needed in product screens. See `AGENTS.md` for the full guide on adding new components.

Available components:

```tsx
import { Button, IconButton, buttonVariants } from '@nangohq/design-system';
```

The consumer must also import the token CSS once at the app root (see above). Components use only semantic CSS variables — no raw hex, hardcoded sizes, or hardcoded spacing.

### Focus rings

Components apply focus rings via `box-shadow` using `--focus-outline-default` (or `--focus-outline-danger` for destructive actions) and suppress the native outline themselves with `focus-visible:outline-none`. No global `*:focus-visible` reset is needed — the webapp scopes the same behaviour per-component via its `focus-default` utility.
