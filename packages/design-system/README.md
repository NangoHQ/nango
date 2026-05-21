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

### Stories

| Story | Path |
|---|---|
| Typography — Type Scale | `Design System / Typography` |
| Typography — Font Families | `Design System / Typography` |
| Color Palette — Semantic Tokens | `Design System / Color Palette` |
| Color Palette — Primitive Ramps | `Design System / Color Palette` |

### Adding component stories

Create a `*.stories.tsx` file anywhere under `packages/design-system/src/`. Follow the `src/stories/Typography.stories.tsx` pattern.

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
