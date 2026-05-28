Use `npm` as the project package manager.
After running the initial `npm install` or `npm ci`, run `npm run prepare` to install Husky git hooks.

## TypeScript Build

Run `npm run ts-build` before linting. Fresh worktrees don't have `dist/` (gitignored), so workspace packages like `@nangohq/types` can't resolve, causing false ESLint errors and broken type-checking.

## ESLint

**Never run `npm run lint:fix` from the repo root.** It touches all packages and will auto-fix false positives in packages whose `dist/` isn't built, removing valid type assertions and breaking TypeScript compilation.

For package-specific lint fixes, run from inside the package:
```
cd packages/webapp && npx eslint src --fix --quiet
```
