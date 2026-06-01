Use `npm` as the project package manager.
After running the initial `npm install` or `npm ci`, run `npm run prepare` to install Husky git hooks.

## TypeScript Build

Run `npm run ts-build` before autofixing lint errors using npm run lint:fix. Fresh worktrees don't have `dist/` (gitignored), so workspace packages like `@nangohq/types` can't resolve, causing false ESLint errors and broken type-checking.

## Running the webapp against a remote API

Pass `REMOTE_API=<env>` when starting the dev server to proxy all API traffic through Vite instead of a local backend. No browser CORS extension needed.

```bash
REMOTE_API=staging npm run dev   # https://api-staging.nango.dev
REMOTE_API=dev npm run dev       # https://api-development.nango.dev
REMOTE_API=prod npm run dev      # https://api.nango.dev
```

When `REMOTE_API` is not set, the dev server behaves as normal and expects a local backend on `localhost:3003`.
