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

## Product analytics (PostHog)

Webapp events are defined in the shared catalogue, `packages/types/lib/analytics/catalogue.ts`, and sent with `track()` from `utils/analytics.tsx`. To add, rename or remove one, use the `adding-analytics-events` skill.
