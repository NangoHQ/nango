Use `npm` as the project package manager.
After running the initial `npm install` or `npm ci`, run `npm run prepare` to install Husky git hooks.

## ESLint

**Never run `npm run lint:fix` from the repo root.** It runs `eslint . --fix` across the entire monorepo and will modify files in unrelated packages, including making semantic code changes (e.g. removing type assertions via `@typescript-eslint/consistent-type-assertions`) that break TypeScript compilation in other packages.

For webapp-only lint fixes, run from inside the package:
```
cd packages/webapp && npx eslint src --fix --quiet
```
