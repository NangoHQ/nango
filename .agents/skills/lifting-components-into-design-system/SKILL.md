---
name: lifting-components-into-design-system
description: Use when moving a webapp component from packages/webapp/src/components/ui into @nangohq/design-system, or when deciding which components a screen redesign should lift - covers the Figma parity gate, lift buckets, the lift recipe (tokenize, lint lock, co-located story, call-site migration), the follow-up consolidation ticket, and what the lift PR must link
---

# Lifting Components into the Design System

## Overview

A lift moves one component from `packages/webapp/src/components/ui/` into `@nangohq/design-system`, brings it to parity with its Figma source, and migrates its existing call-sites. It does nothing else. Each lift is its own ticket and PR, never part of a screen's diff.

How to author a design-system component (tokens, cva pattern, story format, barrel export) is in `packages/design-system/AGENTS.md`. This skill covers what is specific to moving an existing one.

## When to Use

- Lifting a named webapp component into the design system.
- A screen redesign uses webapp components, and you need to decide which to lift first.

Not for adding a brand-new component with no webapp predecessor. Follow `packages/design-system/AGENTS.md` for that.

## Deciding what to lift

Don't turn a single-screen redesign into a library-wide migration.

**Parity gate.** A component enters the design system only when it has a source in the Figma library **Nango — Design System [Dharma]** and the code reaches full parity with it. No Dharma source means it stays in the webapp.

**Radix is not a blocker.** `Dialog`, `AlertDialog` and `Tooltip` were lifted as-is on Radix. Don't fold a Radix → Base UI swap into a lift; that is separate work.

| Bucket                                     | Examples                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Lift to the design system                  | Has a Dharma source: `Card`, `Badge`, `Dialog`, `Tooltip` (all lifted)                                    |
| Stay in `webapp/src/components/ui`         | No Dharma source (`Dot`, `InfoTooltip`), or peripheral to the screen (`Skeleton`, `Table`). Each a future ticket. |
| Stay in `webapp/src/components/patterns`   | App compositions, never design-system primitives: `EditableInput`, `PermissionGate`, `ConditionalTooltip` |
| Page-local                                 | Screen-specific layout: `pages/Team/components/RoleSelect.tsx`, a label-left settings grid                |

Example: the Team Settings redesign (NAN-5626) lifted `Card` (NAN-6385) and `Badge` (NAN-6386), and left `Dot` (no Dharma source) and `Table` (deferred) in the webapp. The screen picked up each lifted component with an import-path swap once its ticket landed.

## Ticket

One ticket per lift, in the Linear project **App Redesign — Design System**, milestone **Component consolidation**, label `Frontend`. Before the move, the ticket works through:

1. **Figma source.** List its variants, props and states. That is the parity target.
2. **Usage and gaps.** Inventory every call-site. A gap is a code variant Figma lacks, or a Figma variant nothing uses.
3. **Close the gaps.** Drop unused code variants, or get the Figma source updated with design. Code and Figma match before the move.
4. **Move.** Follow the recipe below.

## Lift recipe

For `packages/webapp/src/components/ui/<X>.tsx` → `packages/design-system/src/components/ui/<x>.tsx`:

1. **Refresh against upstream shadcn.** Diff the webapp file against the current shadcn source for the same primitive, `https://ui.shadcn.com/docs/components/radix/<x>` or `.../base/<x>`, and adopt structural updates before writing the design-system file.
2. **Tokenize** every appearance class to a design-system utility (`text-sm` → `text-ds-*` or a `type-*` text style, `rounded-xl` → `rounded-ds-*`). Pre-token classes aren't equivalent. Remap them; don't copy them.
3. **Lock down overrides.** Add the component, and each styled sub-component, to both `className` and `style` `disallowedFor` lists of `react/forbid-component-props` in `.oxlintrc.json` (the `packages/webapp/src/**` override). Cover common layout needs with semantic props. Where a wrapper element can't do the job, add an escape hatch named for its intent, not a generic `className`.
4. **Story.** Co-locate it at `src/components/ui/<x>.stories.tsx`, titled `Design System/Components/<X>`, covering every variant. Then **delete** the webapp story at `packages/design-system/stories/<X>.stories.tsx` (titled `App Components/UI/<X>`). This step is easy to forget.
5. **Export** from `packages/design-system/src/index.ts`.
6. **Migrate every call-site** to `@nangohq/design-system`, then delete the webapp file. Imports come as `@/components/ui/<X>` and as relative paths (`../../components/ui/<X>`), so grep for `components/ui/<X>`. Grep `packages/design-system/stories` as well as the webapp: those stories import webapp components through Storybook's `@` alias.
7. **Verify**: `npm run ts-build`, `npm run lint`, `npm run format:check`, and `npm run -w @nangohq/design-system build-storybook`. Then check every migrated screen in the browser, in light and dark.
8. **File a separate consolidation ticket.** While in the code, grep for UI elsewhere with the same shape that could adopt the lifted component: other bespoke components and ad-hoc markup. Capture it in its own ticket under **Component consolidation**, split into:
   - **direct map**: an existing variant fits;
   - **needs a new variant**: Figma parity first, probably with design input.

   Without that split, the ticket quietly turns into a design project. Templates: NAN-6388 (Card), NAN-6401 (Badge). The consolidation ticket never blocks the lift PR.

Keeping consolidation separate keeps the lift PR a reviewable, mechanical move. An app-wide visual change is a different risk and carries its own design decisions.

## What the lift PR must link

A lift changes how many screens look, so the PR description gives reviewers something to check without hunting:

1. **Screenshots of the affected UI**: each migrated screen, in light and dark, before and after where the look changed.
2. **Every new or changed Storybook story**, as a clickable link into the PR's Storybook preview: `https://pr-<N>-storybook.app-development.nango.dev/?path=/story/<storyId>`. Take story IDs from `<preview-url>/index.json`. Don't derive them by hand, and don't list bare story names.

## Common Mistakes

| Mistake                                                          | Fix                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| Lifting a component with no Dharma source                        | It stays in the webapp                                              |
| Bundling the lift into the screen redesign PR                    | Separate ticket and PR; the screen swaps the import afterwards      |
| Widening the lift to adopt the component in new places           | That goes in the consolidation ticket                               |
| Leaving the old `App Components/UI/<X>` story behind             | Delete it in the lift PR                                            |
| Copying `text-sm`, `rounded-md` and the like into the design system | Remap to design-system utilities                                 |
| Swapping Radix for Base UI during the lift                       | Lift as-is; the swap is separate work                               |
