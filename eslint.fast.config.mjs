import * as tseslint from 'typescript-eslint';

import baseConfig from './eslint.config.mjs';

// The full ESLint config with type-aware rules disabled — for fast local linting.
//   npm run lint:fast        - check (includes prettier)
//   npm run lint:fast:fix    - autofix imports, formatting, and type-import style
//
// Type-aware rules require building a TypeScript program per tsconfig, which
// dominates runtime (full `npm run lint` ~74s, and a single webapp file ~3-5s).
// Disabling them drops a single file to ~0.5s and the whole repo to ~20s, with no
// `ts-build` needed. CI still runs the full type-aware `npm run lint`, so the
// type-aware rules remain enforced there.
export default tseslint.config(
    ...baseConfig,

    // disableTypeChecked sets parserOptions.project: false so the TypeScript
    // program is never loaded — this is where the speed comes from — and turns
    // off every rule that needs type information.
    {
        files: ['**/*.{ts,tsx,mts,mtsx}'],
        extends: [tseslint.configs.disableTypeChecked]
    },

    // Resolution-based import rules read each imported module to verify its
    // exports exist. They don't help autofix imports/formatting and account for a
    // large share of the remaining runtime, so turn them off in the fast path.
    {
        rules: {
            'import/named': 'off',
            'import/default': 'off'
        }
    },

    // Type-aware rules are disabled here, so the codebase's inline
    // `// eslint-disable @typescript-eslint/...` directives for those rules read
    // as "unused" — but they're needed by the full lint. Silence these false
    // positives so the fast path doesn't suggest removing real directives.
    {
        linterOptions: {
            reportUnusedDisableDirectives: 'off'
        }
    }
);
