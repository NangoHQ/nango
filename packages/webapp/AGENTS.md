# Webapp agent notes

## Component directory structure

The `src/` directory encodes *shared vs app-specific* in the folder name. Read this before adding, moving, or importing any React component.

### Taxonomy

| Layer | Definition | Directory |
|-------|-----------|-----------|
| **Elements / Components** | Design-system lift candidates — generic primitives that belong in a published component library; Storybook story required | `components-v2/ui/` |
| **Patterns** | Stays in the webapp — either Nango-specific compositions, or generic helpers not suitable for a design system (e.g. wrappers that reduce boilerplate without adding visual value) | `components-v2/patterns/` |
| **Features** | Self-contained modules with their own Zustand store or dedicated utils | `features/` |
| **Layout** | App shell — rendered once, frames the entire app | `layout/` |

### Directory map

```
src/
  layout/               App shell: AppHeader, AppSidebar, DashboardLayout, DefaultLayout
  app/                  Bootstrap only: App.tsx, router.tsx, providers.tsx
  features/             Self-contained modules with own store/hooks/utils
    DevToolPanel.tsx
    Playground/
  pages/                Route-level page components
  components-v2/
    ui/                 Design-system lift candidates (PascalCase filenames)
    patterns/           Webapp-only: Nango-specific compositions + generic helpers
  components/           Legacy components — do not add new files here
    ui/
    patterns/
  hooks/
  store/
  utils/
```

### Rules for placing new files

- **Would it belong in a published component library with a Storybook story?** → `components-v2/ui/`
- **Otherwise (Nango-specific, or a generic helper/wrapper that doesn't fit a design system)** → `components-v2/patterns/`
- **Has own Zustand store or dedicated utils** → `features/<FeatureName>`
- **Part of the app shell** (header, sidebar, layout wrapper) → `layout/`
- **Bootstrap / wiring only** (routing, providers, no independent state) → `app/`

### Filename convention

All React component files in the webapp use **PascalCase** (`Button.tsx`, `DropdownMenu.tsx`, `ConnectionList.tsx`). This applies across all directories.
