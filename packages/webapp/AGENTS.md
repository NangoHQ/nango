# Webapp agent notes

## Component directory structure

The `src/` directory encodes _shared vs app-specific_ in the folder name. Read this before adding, moving, or importing any React component.

### Taxonomy

| Layer                     | Definition                                                                                                                                                                        | Directory              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **Elements / Components** | Design-system lift candidates — generic primitives that belong in a published component library; Storybook story required                                                         | `components/ui/`       |
| **Patterns**              | Stays in the webapp — either Nango-specific compositions, or generic helpers not suitable for a design system (e.g. wrappers that reduce boilerplate without adding visual value) | `components/patterns/` |
| **Features**              | Self-contained modules with their own Zustand store or dedicated utils                                                                                                            | `features/`            |
| **Layout**                | App shell — rendered once, frames the entire app                                                                                                                                  | `layout/`              |

### Directory map

```
src/
  layout/               App shell: AppHeader, AppSidebar, DashboardLayout, DefaultLayout
  app/                  Bootstrap only: App.tsx, router.tsx, providers.tsx
  features/             Self-contained modules with own store/hooks/utils
    DevToolPanel.tsx
    Playground/
  pages/                Route-level page components
  components/
    ui/                 Design-system lift candidates (PascalCase filenames)
    patterns/           Webapp-only: Nango-specific compositions + generic helpers
  hooks/
  store/
  utils/
```

Components that belong in the published design system live in `packages/design-system`, not here — see that package's own `AGENTS.md`. There is no `components-v2/` — components were fully migrated and the `v2` suffix dropped; don't reintroduce it.

### Rules for placing new files

- **Would it belong in a published component library with a Storybook story?** → `components/ui/`
- **Otherwise (Nango-specific, or a generic helper/wrapper that doesn't fit a design system)** → `components/patterns/`
- **Has own Zustand store or dedicated utils** → `features/<FeatureName>`
- **Part of the app shell** (header, sidebar, layout wrapper) → `layout/`
- **Bootstrap / wiring only** (routing, providers, no independent state) → `app/`

### Filename convention

All React component files in the webapp use **PascalCase** (`Button.tsx`, `DropdownMenu.tsx`, `ConnectionList.tsx`). This applies across all directories.

## Figma text styles

A Figma text style maps 1:1 to a `type-*` class generated from the design tokens (`packages/design-system/tokens/tokens.generated.css`). The class name is the style's path with `/` replaced by `-`:

| Figma text style  | Class                  |
| ----------------- | ---------------------- |
| `text/regular/md` | `type-text-regular-md` |
| `text/medium/sm`  | `type-text-medium-sm`  |
| `heading/sm`      | `type-heading-sm`      |
| `label/md`        | `type-label-md`        |
| `code/regular/xs` | `type-code-regular-xs` |

`get_design_context` lists a design's text styles under "These styles are contained in the design". Don't rebuild a style from the raw scale (`text-ds-md font-ds-medium`): that guess usually picks the wrong size, weight or line height. The `text-body-*` utilities in `src/index.css` predate the tokens and don't match Figma's line heights, so don't use them for new Figma work. Text colour still comes from the `text-text-*` tokens. Design-system components such as `Badge` already set their own text style.

## Base UI and Radix

The webapp uses both Radix and Base UI (`@base-ui/react`).

- Radix has no combobox. Use Base UI `Combobox` for a searchable select (`components/ui/Combobox.tsx`).
- A Base UI `Menu` submenu can't host a search input. For a nested searchable menu, use a non-modal Base UI `Popover` as the outer layer and a Base UI `Combobox` inside it. A Radix outer layer with a Base UI inner one doesn't nest: the outer closes when the inner takes focus.
- Base UI renders as another element with `render={<element />}`, not Radix's `asChild`.
- For hover-to-open, use `onPointerEnter`, not only `onMouseEnter`.

Reference implementation: `components/patterns/FilterSelect.tsx`.

## Standard behaviour over workarounds

Prefer the standard behaviour of shadcn, Radix and Base UI over custom JS or CSS. Before adding a workaround, check what popular component libraries do. For example, `:focus-visible` on a text input shows the focus ring on click as well as on keyboard focus. That is the standard, not a bug to fix with keyboard-modality tracking.

## Product analytics (PostHog)

Webapp events are defined in the shared catalogue, `packages/types/lib/analytics/catalogue.ts`, and sent with `track()` from `utils/analytics.tsx`. To add, rename or remove one, use the `managing-analytics-events` skill.
