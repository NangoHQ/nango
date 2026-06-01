Use `npm` as the project package manager.
After running the initial `npm install` or `npm ci`, run `npm run prepare` to install Husky git hooks.

## TypeScript Build

Run `npm run ts-build` before autofixing lint errors using npm run lint:fix. Fresh worktrees don't have `dist/` (gitignored), so workspace packages like `@nangohq/types` can't resolve, causing false ESLint errors and broken type-checking.
