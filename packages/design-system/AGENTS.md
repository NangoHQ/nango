# Design System — Agent Guide

This package contains the Nango design system: design tokens, React components, and Storybook.

## Adding a variant for a new look

Consuming apps can't restyle these components (a lint rule flags `className`/`style` on them), so when a screen needs a look no existing prop or variant covers, the fix lives **here** — add a new or extended variant. First validate with a designer that the variant is genuinely missing, then add the matching variant to the **Figma design system** so code and design stay in sync. See the [Styling & Customization](http://storybook.nango.dev/?path=/docs/design-system-guide-styling-customization--docs) guide.

## Adding a new component

Components are added on-demand when first needed in a real screen — don't add components speculatively.

### Step 1: Generate the base with shadcn CLI

```bash
cd packages/design-system
npx shadcn@latest add <component-name>
```

This writes the file to `src/components/ui/<component-name>.tsx`. The generated component uses shadcn's default CSS variables (`bg-primary`, `text-muted-foreground`, etc.) — those need to be replaced in the next step.

> **Note:** The shadcn CLI resolves the `@/*` aliases in `components.json` via a tsconfig path. That path is intentionally absent from `tsconfig.json` (it would collide with Storybook's `@` → webapp alias). Temporarily add `"baseUrl": ".", "paths": { "@/*": ["./src/*"] }` to `tsconfig.json` while scaffolding, then remove it once the component is in place (its imports get rewritten to relative paths anyway).

### Step 2: Replace shadcn CSS variables with design tokens

shadcn's variables (`border-input`, `ring`, `bg-primary`, ...) don't exist in this package. Every colour, radius, spacing, and motion value must come from `tokens/tokens.generated.css` — via a token utility (preferred) or `var(--token-name)` when no utility exists.

**Tailwind v4 syntax for token values:**

Semantic tokens and the primitive dimension/typography tokens are registered in `@theme`, so they're available as plain Tailwind utilities — no `[var(...)]` wrapper needed (primitive _colours_ are intentionally excluded; use the semantic ones):

```tsx
// colours — semantic tokens (there are no component-level button-* tokens)
'bg-interactive-primary'
'text-text-on-accent'
'border-border-default'
'hover:bg-interactive-primary-hover'
'disabled:text-text-disabled'

// focus rings — registered as --shadow-* → shadow-*
'focus-visible:shadow-focus-outline-default'
'focus-visible:shadow-focus-outline-danger'

// typography — registered as --text-ds-*, --font-weight-ds-*, --tracking-ds-*
'text-ds-md'          // font-size: 14px
'text-ds-xs'          // font-size: 12px
'font-ds-medium'      // font-weight: 500
'tracking-ds-tight'   // letter-spacing: -0.01em

// radius — registered as --radius-ds-* → rounded-ds-*
'rounded-ds-xs'       // 2px
'rounded-ds-sm'       // 4px
'rounded-ds-full'     // 9999px

// border-width — registered as --border-width-ds-* → border-ds-*
'border-ds-hairline'  // 0.5px
'border-ds-1'         // 1px

// spacing — use Tailwind's default scale directly (gap-2 === --ds-space-2 === 8px)
'gap-1.5'   // 6px  (= --ds-space-1-5)
'gap-2'     // 8px  (= --ds-space-2)
'px-2.5'    // 10px (= --ds-space-2-5)
```

**When to use DS utilities vs native Tailwind:**

Rule of thumb: **appearance** (a value a designer owns) comes from a DS token utility; **layout, sizing, and motion** use native Tailwind, whose default scales line up 1:1 with our tokens.

Use `ds-*` / semantic utilities for anything a designer specifies:

| Category | Use | Example |
|---|---|---|
| Colors | Semantic utilities | `bg-surface-canvas`, `text-text-default`, `border-border-default` |
| Focus rings | `shadow-*` semantic | `shadow-focus-outline-default` |
| Font size | `text-ds-*` | `text-ds-md` not `text-sm` |
| Font weight | `font-ds-*` | `font-ds-medium` not `font-medium` |
| Line height | `leading-ds-*` | `leading-ds-normal` not `leading-normal` |
| Letter spacing | `tracking-ds-*` | `tracking-ds-tight` not `tracking-tight` |
| Border radius | `rounded-ds-*` | `rounded-ds-sm` not `rounded` |
| Border width | `border-ds-*` | `border-ds-1` not `border` |

Use native Tailwind for these — explicitly allowed because the default scale equals our tokens, so no DS utility is needed:

| Category | Use | Example |
|---|---|---|
| Spacing | Native scale | `gap-2`, `px-3` — matches `--ds-space-*` (4px scale) |
| Icon size | Native scale | `size-4` (16px), `size-3.5` (14px) — matches `--ds-icon-size-*` |
| Motion | Native scale | `duration-100` = `--ds-motion-duration-fast`; `ease-in-out` = `--ds-motion-easing-standard` |
| Layout / structural | Native | `flex`, `grid`, `items-center`, `justify-between`, `relative`, `overflow-hidden`, `truncate`, `whitespace-nowrap`, `transition`, `z-10`, … |

> **Never inline a token as an arbitrary `[var(--ds-*)]` value in `className`.** Reach for a registered utility, or the native class above for spacing/icon-size/motion. If a token you need has neither, add it to the `@theme` block so it generates a class (e.g. motion could become `duration-motion-fast`) — don't fall back to `var()`.

> **Note on existing app code:** Files written before the DS token pipeline may use `text-sm`, `rounded-md`,
> `font-medium` etc. with Tailwind's built-in values. Those are not equivalent to the DS utilities — don't
> treat them as interchangeable when editing existing components.

**Key token namespaces** (see `tokens/tokens.generated.css` for the full list):

| What | Token pattern | Example |
|---|---|---|
| Interactive colours | `--interactive-<role>[-state]` | `--interactive-primary`, `--interactive-primary-hover`, `--interactive-danger` |
| Surface colours | `--surface-<role>[-state]` | `--surface-inverse`, `--surface-inverse-hover` |
| Text colours | `--text-<role>` | `--text-default`, `--text-secondary`, `--text-disabled` |
| Spacing | `--ds-space-<n>` | `--ds-space-2` (8px), `--ds-space-2-5` (10px) |
| Radius | `--ds-radius-<size>` | `--ds-radius-sm` (4px), `--ds-radius-full` |
| Border width | `--ds-border-width-<n>` | `--ds-border-width-1` (1px), `--ds-border-width-hairline` (0.5px) |
| Typography | `--ds-typography-font-size-<size>` | `--ds-typography-font-size-md` (14px) |
| Motion | `--ds-motion-duration-<speed>`, `--ds-motion-easing-<curve>` | `--ds-motion-duration-fast` (100ms) |
| Focus rings | `--focus-outline-default`, `--focus-outline-danger` | (box-shadow value, not a colour) |
| Icon sizes | `--ds-icon-size-<size>` | `--ds-icon-size-sm` (14px) |

**Focus rings** use `box-shadow`, not `outline`:
```tsx
'focus-visible:outline-none focus-visible:shadow-focus-outline-default'
// destructive actions:
'focus-visible:outline-none focus-visible:shadow-focus-outline-danger'
```

**Motion** — all interactive components transition the same properties, using the native motion utilities (see the table above for the token mapping):
```tsx
'transition-[background-color,border-color,color,box-shadow]',
'duration-100 ease-in-out',
```

### Step 3: Follow the component pattern

See `src/components/ui/button.tsx` as the reference. The pattern is:

```tsx
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '../../lib/cn';
import type { VariantProps } from 'class-variance-authority';

// 1. Export the variants object so consumers can compose it
export const myVariants = cva(
    ['base classes using token utilities (rounded-ds-*, bg-*, text-ds-*, …)'],
    {
        variants: { ... },
        defaultVariants: { ... }
    }
);

// 2. Export the props interface
export interface MyProps
    extends React.HTMLAttributes<HTMLElement>,
        VariantProps<typeof myVariants> {
    asChild?: boolean; // include when the component should support Slot
}

// 3. forwardRef so consumers can attach refs
export const MyComponent = forwardRef<HTMLElement, MyProps>(
    ({ className, variant, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'div';
        return (
            <Comp
                ref={ref}
                className={cn(myVariants({ variant }), className)}
                {...props}
            />
        );
    }
);
MyComponent.displayName = 'MyComponent';
```

Key rules:
- **No raw hex colours, font sizes, or pixel values** — everything via a token utility (or `var(--token-name)` when no utility exists)
- **`cn()` for className** — always merge via `cn(variants(...), className)` so consumers can override
- **`asChild` via `@radix-ui/react-slot`** — include on any component that wraps an interactive element (links, router `<Link>`, etc.)
- **`forwardRef`** — always, so refs work in consuming apps
- **Export the `cva` variants object** alongside the component so it can be composed

### Step 4: Add a Storybook story

Create `src/components/ui/<component-name>.stories.tsx` co-located with the component. Show every variant and state (default, hover, disabled, focused). Use Tailwind classes for layout in stories — Tailwind's default 4px scale matches our spacing tokens exactly (`gap-2` = 8px = `--ds-space-2`), so no `var(--ds-space-*)` needed.

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { MyComponent } from './my-component';

const meta: Meta<typeof MyComponent> = {
    title: 'Design System/Components/MyComponent',
    component: MyComponent,
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const AllVariants: Story = {
    render: () => (
        <div className="flex gap-4">
            ...
        </div>
    )
};
```

### Step 5: Export from the barrel

Add to `src/index.ts`:

```ts
export { MyComponent, type MyProps, myVariants } from './components/ui/my-component';
```

## Package structure

```
src/
  components/
    ui/                    all components (flat, shadcn convention)
      button.tsx           exports Button and IconButton
      button.stories.tsx
      spinner.tsx          internal — used by Button for loading state
      …                    add new components here
  lib/
    cn.ts                  cn() helper: twMerge + clsx
  index.ts                 barrel — all public exports
  index.css                CSS entry (imports tokens.generated.css)
tokens/
  tokens.generated.css     compiled CSS custom properties (source of truth for tokens)
  tokens.json              Tokens Studio export
components.json            shadcn CLI config
```

## cn() helper

All class merging goes through `cn()` from `src/lib/cn.ts`. It combines `clsx` (conditional syntax) with `tailwind-merge` (conflict resolution), so `cn('h-8', 'h-10')` → `'h-10'` instead of `'h-8 h-10'`.

## Dark mode

The token file defines both light and dark values. Light is `:root`, dark is `[data-theme="dark"]`. Components don't need dark-mode variants — the CSS variables handle it automatically.

## Storybook

```bash
npm run storybook   # opens at http://localhost:6006
```

Use the **Themes** toolbar button to toggle light/dark. Verify every component looks correct in both themes.
