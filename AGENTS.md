Use `npm` as the project package manager.
After running the initial `npm install` or `npm ci`, run `npm run prepare` to install Husky git hooks.

## TypeScript Build

Run `npm run ts-build` before autofixing lint errors using npm run lint:fix. Fresh worktrees don't have `dist/` (gitignored), so workspace packages like `@nangohq/types` can't resolve, causing false ESLint errors and broken type-checking.

## Running Nango locally

For full local dev setup (Docker, service URLs, auth flows, troubleshooting), use the `running-and-testing-locally` skill.

## Running the webapp dev server

### Multiple worktrees (local backend)

Run `npm run dev -w packages/webapp` from each worktree. Vite picks the next free port (3000 → 3001 → 3002 …) and each dashboard calls the local backend at `localhost:3003` directly — the API's dev CORS trusts any `localhost` port, so no proxy or `apiUrl` rewrite is needed. Only `/env.js` is proxied so `window._env` loads same-origin.

### Remote API

Pass `REMOTE_API=<env>` to proxy all API traffic to a live backend instead. No local backend needed.

```bash
REMOTE_API=dev npm run dev -w packages/webapp       # https://api-development.nango.dev
REMOTE_API=staging npm run dev -w packages/webapp   # https://api-staging.nango.dev
REMOTE_API=prod npm run dev -w packages/webapp      # https://api.nango.dev
```

## Design system

`@nangohq/design-system` components (`Button`, `IconButton`, …) own their styling. In any consuming package (webapp, connect-ui, …), **don't override it with `className` or `style`** — a lint rule (`react/forbid-component-props`) flags these props where the design system is used. Instead:

- Use the component's `variant`/`size` and other props.
- Put layout (margin, positioning, width) on a **wrapper element**, not the component.
- Need a look no prop covers? Add a variant to the design system — see `packages/design-system/AGENTS.md`.

Full guidance: [Styling & Customization](http://storybook.nango.dev/?path=/docs/design-system-guide-styling-customization--docs) in Storybook.
