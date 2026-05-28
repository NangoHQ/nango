# Webapp agent notes

## Component directory structure

The `src/` directory encodes *shared vs app-specific* in the folder name. Read this before adding, moving, or importing any React component.

### Taxonomy

| Layer | Definition | Directory |
|-------|-----------|-----------|
| **Elements / Components** | Generic, reusable — no Nango-specific logic | `components-v2/ui/` |
| **Patterns** | App-specific reusable compositions — used across multiple screens | `components-v2/patterns/` |
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
    ui/                 Elements + components (shadcn-flat, PascalCase filenames)
    patterns/           App-specific reusable patterns
  components/           Legacy components — do not add new files here
    ui/
    patterns/
  hooks/
  store/
  utils/
```

### Rules for placing new files

- **Generic UI primitive** (no Nango imports, could live in any React app) → `components-v2/ui/`
- **Nango-specific reusable composition** (used on 2+ screens) → `components-v2/patterns/`
- **Has own Zustand store or dedicated utils** → `features/<FeatureName>`
- **Part of the app shell** (header, sidebar, layout wrapper) → `layout/`
- **Bootstrap / wiring only** (routing, providers, no independent state) → `app/`

### Filename convention

All React component files in the webapp use **PascalCase** (`Button.tsx`, `DropdownMenu.tsx`, `ConnectionList.tsx`). This applies across all directories.
