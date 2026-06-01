import * as tseslint from 'typescript-eslint';

import baseConfig from './eslint.config.mjs';

// Extends the full ESLint config with type-aware rules disabled.
// No ts-build needed, runs in ~Xs locally instead of ~72s.
//   npm run lint:fast        - check (includes prettier)
//   npm run lint:fast:fix    - autofix imports, formatting, and type-import style
export default tseslint.config(
    ...baseConfig,

    // Disable type-aware TypeScript rules for all TS files.
    // disableTypeChecked also sets parserOptions.project: false so the
    // TypeScript program is never loaded — this is where the speed comes from.
    {
        files: ['**/*.{ts,tsx,mts,mtsx}'],
        extends: [tseslint.configs.disableTypeChecked]
    },

    // Disable slow resolution-based import rules. These check whether named/default
    // exports actually exist by reading the imported module — not useful for autofixing
    // imports after a refactor, and they account for ~45% of rule execution time.
    {
        rules: {
            'import/named': 'off',
            'import/default': 'off'
        }
    }
);
