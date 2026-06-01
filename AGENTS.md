Use `npm` as the project package manager.
After running the initial `npm install` or `npm ci`, run `npm run prepare` to install Husky git hooks.

## Linting

- `npm run lint` / `npm run lint:fix` — full ESLint with type-aware rules (requires `ts-build` artifacts, ~72s)
- `npm run lint:fast` / `npm run lint:fast:fix` — ESLint without type-aware rules, includes Prettier (~15s, no `ts-build` needed). Use this after refactors to fix import ordering and formatting in one command.
