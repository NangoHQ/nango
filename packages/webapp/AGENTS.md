# Webapp agent notes

## Component directory structure

The `src/` directory follows a taxonomy that encodes *shared vs app-specific* in the folder name. Understand this before adding, moving, or importing components.

### Taxonomy

| Layer | Definition | Directory |
|-------|-----------|-----------|
| **Elements / Components** | Generic, reusable — no Nango-specific logic | `components-v2/ui/` |
| **Patterns** | App-specific reusable compositions — used across multiple screens | `components-v2/patterns/` |
| **Features** | Self-contained feature modules with own state/hooks/utils | `src/features/` |
| **Layout** | App shell — rendered once as the frame of the app | `src/layout/` |

### Directory map

```
src/
  layout/               App shell: AppHeader, AppSidebar, DashboardLayout, DefaultLayout
  app/                  Bootstrap: App.tsx, router.tsx, providers.tsx, DevToolPanel.tsx
  features/             Self-contained feature modules (own store + hooks + utils)
    Playground/
  pages/                Route-level page components
  components-v2/
    ui/                 Elements + components (shadcn-flat, PascalCase filenames)
    patterns/           App-specific reusable patterns
  components/           v1 components — retiring in Phase 2A, do not add new files here
    ui/
    patterns/
  hooks/
  store/
  utils/
```

### Rules for placing new files

- **Generic UI primitive** (no Nango imports, could live in any React app) → `components-v2/ui/`
- **Nango-specific composition** used on 2+ screens (e.g. ConfirmDialog, IntegrationLogo) → `components-v2/patterns/`
- **Has own Zustand store or dedicated utils file** → `src/features/<FeatureName>/`
- **Part of the app chrome** (header, sidebar, layout wrapper) → `src/layout/`
- **App-level singleton** (mounted once at root, dev tools) → `src/app/`

### Filename convention

All files in `components-v2/ui/` use **PascalCase** (`Button.tsx`, `DropdownMenu.tsx`). This matches the export name and differs from the original shadcn kebab-case scaffolding.

### Migration context

This structure is Phase 1 of a design-system migration:
- **Phase 2A**: migrate v1 callsites (`components/`) to v2
- **Phase 3**: lift `components-v2/ui/` elements into `packages/design-system/`
- **Phase 4**: move `components-v2/patterns/` to flat `src/components/`, delete `components-v2/`

`components-v2/` is transitional. `src/layout/`, `src/app/`, and `src/features/` are permanent.

See [Taxonomy](https://www.notion.so/36ece29831218080b384fd11fa049eec) and [Migration plan](https://www.notion.so/36ece298312180d9ab34c335c151fa83) for full background.
