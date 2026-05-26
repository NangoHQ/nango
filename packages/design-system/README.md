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

### Stories

| Story | Path |
|---|---|
| Button — All variants / sizes / states | `Design System / Components / Button` |
| IconButton — All variants / sizes / states | `Design System / Components / Button` |
| Input — States / with icons / password | `Design System / Components / Input` |
| Badge — All variants / shapes | `Design System / Components / Badge` |
| FilterBadge — Selected / unselected / disabled | `Design System / Components / Badge` |
| Spinner — All sizes | `Design System / Components / Spinner` |
| Typography — Type Scale | `Design System / Typography` |
| Color Palette — Semantic Tokens | `Design System / Color Palette` |

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

### Adding component stories

Token stories live in `packages/design-system/tokens/` alongside the token files they document. When adding component stories, place them under `packages/design-system/src/` and add `'../src/**/*.stories.@(ts|tsx)'` to the `stories` glob in `.storybook/main.ts`. Follow the `tokens/Typography.stories.tsx` pattern.

---

## Tokens

Design tokens are authored in Figma via [Tokens Studio](https://tokens.studio/) and compiled to CSS custom properties.

Tokens Studio is configured with **GitHub sync** pointing at the `design/tokens` branch in this repo. This means the designer can push token changes directly from the Figma plugin, and any Figma file connected to the same sync config shares the same token set.

### Structure

```
tokens/
  tokens.json           Tokens Studio export (source of truth, committed to git)
  tokens.generated.css  generated CSS custom properties (committed to git)
scripts/
  tokens-fetch.mjs     token pipeline script
```

### Sync workflow

**Designer → code:**

1. Edit tokens in Figma via the Tokens Studio plugin
2. Push changes to the `design/tokens` branch (plugin Settings → Sync provider → GitHub)
3. Notify a developer to run `npm run tokens:fetch`

**Developer picking up latest tokens:**

```bash
cd packages/design-system
npm run tokens:fetch
git add tokens/
git commit -m "chore(design-system): update tokens"
```

**Rebuild CSS without fetching (e.g. after resolving merge conflicts in tokens.json):**

```bash
npm run tokens:build
```

### Canonical direction

Token changes should always originate in Figma — the designer owns the source of truth. Editing `tokens.json` directly and pushing to `design/tokens` is technically possible (the GitHub sync is bidirectional) but not the intended workflow, and risks diverging from the Figma file.

### Generated CSS structure

```css
/* Primitives — --ds- prefix, NOT in @theme (enforce semantic-only usage) */
:root {
  --ds-color-neutral-50: #f9fafb;
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

/* Tailwind v4 @theme — generates bg-surface-canvas, text-text-strong, etc. */
@theme {
  --color-surface-canvas: var(--surface-canvas);
  ...
}
```

### Token naming

| Token                           | CSS var                 | Tailwind utility    |
| ------------------------------- | ----------------------- | ------------------- |
| `Primitives.color.neutral.50`   | `--ds-color-neutral-50` | —                   |
| `Semantic/Light.surface.canvas` | `--surface-canvas`      | `bg-surface-canvas` |
| `Semantic/Light.text.strong`    | `--text-strong`         | `text-text-strong`  |

Primitives are excluded from `@theme` to nudge components toward semantic tokens. They can still be used directly via `var(--ds-*)` in CSS when a semantic token doesn't exist yet.

### Consuming in webapp

`packages/webapp/src/index.css` imports the generated CSS via the package name:

```css
@import '@nangohq/design-system/tokens/tokens.generated.css';
```

Legacy tokens in `index.css` (`--color-*`) are separate and untouched.

---

## Package structure

```
src/
  components/
    Button/
      Button.tsx           component implementation
      Button.stories.tsx   Storybook story
    Input/
      Input.tsx
      Input.stories.tsx
    …                      one directory per component
    ui/                    shadcn CLI scratch pad — generated files land here,
                           then get adapted into the component directory above
  lib/
    cn.ts                  cn() helper (twMerge + clsx)
  index.ts                 barrel — all public exports
  index.css                CSS entry point (imports tokens.generated.css)
tokens/
  tokens.json              Tokens Studio source of truth
  tokens.generated.css     compiled CSS custom properties
scripts/
  tokens-fetch.mjs         token pipeline
components.json            shadcn CLI config
```

Each component lives in its own directory alongside its story. When adding a new component via the shadcn CLI (`npx shadcn add <name>`), the generated file is placed in `src/components/ui/` as a starting point. Move and adapt it into `src/components/<Name>/` — replacing shadcn's hardcoded Tailwind utilities with our `--ds-*` token variables — then delete the `ui/` file.

---

## Components

Components are available from the package root:

```tsx
import { Button, Input, Badge, FilterBadge, IconButton, Spinner } from '@nangohq/design-system';
```

The consumer must also import the token CSS once at the app root (see above). Components use only semantic CSS variables — no raw hex, hardcoded sizes, or hardcoded spacing.

### Focus rings

Components apply focus rings via `box-shadow` using `--focus-outline-default` (or `--focus-outline-danger` for destructive actions). The app shell should include:

```css
*:focus-visible { outline: none; }
```

This is included in Storybook's `preview.css` automatically.

### Tokens Studio GitHub sync config

| Field | Value |
|---|---|
| Repository | `NangoHQ/nango` |
| Branch | `design/tokens` |
| File path | `packages/design-system/tokens/tokens.json` |

### Figma plugin setup (first time)

1. Install the [Tokens Studio for Figma](https://tokens.studio/) plugin
2. Plugin should detect existing GitHub sync and pre-fill all fields except for the access token
3. For the **Personal Access Token** field, retrieve it from 1Password:
   - Vault: **Eng**
   - Item: **GitHub PAT - Figma Tokens Studio Sync**
4. Click **Save** — the plugin will load the existing tokens from the `design/tokens` branch
