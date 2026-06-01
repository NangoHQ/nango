Use `npm` as the project package manager.
After running the initial `npm install` or `npm ci`, run `npm run prepare` to install Husky git hooks.

## Linting

Use `npm run lint` to lint the codebase (oxlint). Use `npm run lint:fix` to auto-fix lint errors.

## Formatting and import sorting

Run `npm run prettier-format` to format TypeScript files and sort imports automatically. This uses `@ianvs/prettier-plugin-sort-imports` with the following import group order:

1. Node built-ins
2. Third-party packages (alphabetical)
3. `@nangohq/*` packages
4. Local `@/*` paths and relative imports
5. Type imports
