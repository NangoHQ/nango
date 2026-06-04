Use `npm` as the project package manager.
After running the initial `npm install` or `npm ci`, run `npm run prepare` to install Husky git hooks.

## TypeScript Build

Run `npm run ts-build` before autofixing lint errors using npm run lint:fix. Fresh worktrees don't have `dist/` (gitignored), so workspace packages like `@nangohq/types` can't resolve, causing false ESLint errors and broken type-checking.

## Running the webapp dev server

### Multiple worktrees (local backend)

Run `npm run dev -w packages/webapp` from each worktree. Vite picks the next free port (3000 → 3001 → 3002 …) and rewrites `apiUrl` in `env.js` to match, routing all API traffic through Vite's proxy to the local backend at `localhost:3003`.

### Remote API

Pass `REMOTE_API=<env>` to proxy all API traffic to a live backend instead. No local backend needed.

```bash
REMOTE_API=staging npm run dev -w packages/webapp   # https://api-staging.nango.dev
REMOTE_API=dev npm run dev -w packages/webapp       # https://api-development.nango.dev
REMOTE_API=prod npm run dev -w packages/webapp      # https://api.nango.dev
```
