import eslint from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import * as tseslint from 'typescript-eslint';

// Shared typescript-eslint preset extends and custom rule overrides.
//
// We use these in both the root `**/*.{ts,tsx}` block (with the root tsconfig)
// AND in each browser-package block (webapp / frontend / connect-ui) that has
// its own incompatible tsconfig.  Keeping them in one place ensures the rules
// are identical regardless of which block applies to a file.
//
// Background: IDEs (e.g. VS Code ESLint extension) create a separate TypeScript
// program for every unique `parserOptions.project` value they see in matching
// config blocks.  If a file matches both the root block (project: './tsconfig.json')
// and a package block (project: 'packages/webapp/tsconfig.json'), the IDE runs
// type-aware rules from the root block with the root tsconfig — which has no
// DOM/React lib, so every React hook import degrades to `error` type and fires
// spurious `no-unnecessary-type-assertion` / unsafe-* violations.
//
// The fix: exclude browser-package source trees from the root block (via
// `ignores`) so only one TypeScript program is created for those files, and
// replicate the shared typescript-eslint setup directly in each package block.
const tseslintExtends = [
    tseslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    tseslint.configs.strict,
    tseslint.configs.stylistic,
    tseslint.configs.strictTypeChecked
];

const tseslintRules = {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-inferrable-types': 'off',
    '@typescript-eslint/require-await': 'error',

    '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
            allowNumber: true,
            allowBoolean: true,
            allowNever: true
        }
    ],

    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-invalid-void-type': 'warn',
    '@typescript-eslint/no-base-to-string': 'error',
    '@typescript-eslint/restrict-plus-operands': 'warn',
    '@typescript-eslint/consistent-type-exports': 'error',
    '@typescript-eslint/no-unnecessary-condition': 'off',
    '@typescript-eslint/only-throw-error': 'error',

    '@typescript-eslint/no-unused-vars': [
        'error',
        {
            args: 'all',
            argsIgnorePattern: '^_',
            caughtErrors: 'all',
            caughtErrorsIgnorePattern: '^_',
            destructuredArrayIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            ignoreRestSiblings: true
        }
    ],

    '@typescript-eslint/consistent-type-imports': [
        'error',
        {
            prefer: 'type-imports',
            fixStyle: 'separate-type-imports'
        }
    ],

    '@typescript-eslint/no-confusing-void-expression': [
        'warn',
        {
            ignoreVoidOperator: true,
            ignoreArrowShorthand: true
        }
    ],

    // To re-enable as error progressively
    '@typescript-eslint/no-floating-promises': 'warn',
    '@typescript-eslint/no-unsafe-assignment': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unsafe-member-access': 'warn',
    '@typescript-eslint/no-unsafe-call': 'warn',
    '@typescript-eslint/no-unsafe-argument': 'warn',
    '@typescript-eslint/no-misused-promises': 'warn',
    '@typescript-eslint/no-unsafe-return': 'warn',
    '@typescript-eslint/no-empty-function': 'warn',
    '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
    '@typescript-eslint/no-unnecessary-type-parameters': 'off',

    // Off for good reason
    '@typescript-eslint/no-deprecated': 'off' // takes 33% of the whole linting time
};

export default tseslint.config(
    {
        ignores: [
            '**/node_modules',
            '**/dist/',
            '**/build/',
            '**/coverage/',
            '**/bin/',
            'packages/server/nango-integrations/',
            'packages/node-client/tests',
            'packages/cli/fixtures/',
            'docs/script.js',
            'packages/runner-sdk/models.d.ts',
            'packages/cli/templates/'
        ]
    },

    prettier,
    prettierRecommended,

    {
        files: ['**/*.{js,mjs,cjs,ts,jsx,tsx,mts,mtsx}'],
        plugins: {
            unicorn,
            import: importPlugin
        },
        languageOptions: {
            globals: {
                ...globals.node
            }
        },
        rules: {
            ...eslint.configs.recommended.rules,
            ...importPlugin.flatConfigs.errors.rules,
            ...importPlugin.flatConfigs.warnings.rules,
            ...importPlugin.flatConfigs.recommended.rules,
            'no-console': 'warn',
            'prettier/prettier': 'error',

            'import/extensions': [
                'error',
                'always',
                {
                    json: 'always',
                    js: 'always',
                    ts: 'never',
                    ignorePackages: true
                }
            ],

            'import/no-unresolved': 'off',
            'import/no-duplicates': 'error',
            'import/no-extraneous-dependencies': 'error',
            'import/no-empty-named-blocks': 'error',
            'import/no-absolute-path': 'error',
            'import/no-self-import': 'error',
            'import/newline-after-import': 'error',
            'import/consistent-type-specifier-style': ['error', 'prefer-top-level'],
            'import/namespace': 'off',
            'import/order': [
                'error',
                {
                    'newlines-between': 'always',
                    named: true,

                    alphabetize: {
                        order: 'asc'
                    },
                    distinctGroup: false,

                    warnOnUnassignedImports: false,
                    // sortTypesGroup: true, not avail yet

                    pathGroupsExcludedImportTypes: [
                        // allows us to split npm package from our @nango
                        'builtin',
                        // allow us to have our own types at the end anyway
                        'type'
                    ],
                    pathGroups: [
                        {
                            pattern: '@nangohq/**',
                            group: 'internal',
                            position: 'after'
                        },
                        {
                            pattern: '@/**',
                            group: 'parent',
                            position: 'after'
                        }
                    ],
                    groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type', 'object']
                }
            ],

            'unicorn/catch-error-name': [
                'error',
                {
                    name: 'err'
                }
            ]
        }
    },
    {
        // Root typescript-eslint block — covers every TypeScript file that does NOT
        // have its own package-specific block below (server, jobs, cli, shared libs…).
        // Browser packages (webapp, frontend, connect-ui) are excluded because they
        // use incompatible tsconfigs (DOM lib, different module mode) and each has its
        // own block that sets up the same rules via the shared `tseslintExtends` /
        // `tseslintRules` variables above.
        files: ['**/*.{ts,tsx}'],
        ignores: ['packages/webapp/src/**', 'packages/frontend/**', 'packages/connect-ui/src/**'],
        plugins: {
            '@typescript-eslint': tseslint.plugin
        },
        extends: tseslintExtends,

        languageOptions: {
            parser: tsParser,
            ecmaVersion: 5,
            sourceType: 'module',

            parserOptions: {
                ecmaFeatures: {
                    impliedStrict: true,
                    jsx: true
                },

                project: './tsconfig.json'
            }
        },

        rules: tseslintRules
    },
    {
        files: ['integration-templates/**/*.ts'],
        rules: {
            'no-constant-condition': 'off',
            '@typescript-eslint/no-dynamic-delete': 'off',
            '@typescript-eslint/no-redundant-type-constituents': 'off'
        }
    },
    {
        files: ['packages/**/*/migrations/**'],
        rules: {
            'import/order': 'off'
        }
    },
    {
        files: ['packages/frontend/**/*.ts'],
        plugins: {
            '@typescript-eslint': tseslint.plugin
        },
        extends: tseslintExtends,
        languageOptions: {
            globals: {
                ...globals.browser,
                ...Object.fromEntries(Object.entries(globals.node).map(([key]) => [key, 'off']))
            },

            ecmaVersion: 2018,
            sourceType: 'module',

            parserOptions: {
                ecmaFeatures: {
                    impliedStrict: true,
                    jsx: false
                },

                project: 'packages/frontend/tsconfig.json'
            }
        },
        rules: {
            ...tseslintRules,
            'no-console': 'off',

            '@typescript-eslint/no-misused-promises': [
                'warn',
                {
                    checksVoidReturn: {
                        arguments: false,
                        attributes: false
                    }
                }
            ]
        }
    },
    {
        // Design-system: disable type-aware rules to avoid loading a second
        // TypeScript program alongside the root one, which OOMs in CI.
        files: ['packages/design-system/{src,tokens,.storybook}/**/*.{tsx,ts}'],
        extends: [tseslint.configs.disableTypeChecked],
        rules: {
            'import/extensions': 'off'
        }
    },
    {
        files: ['packages/webapp/src/**/*.{tsx,ts}'],
        plugins: {
            '@typescript-eslint': tseslint.plugin,
            react: react,
            'react-hooks': reactHooks
        },
        extends: tseslintExtends,
        settings: {
            react: {
                version: 'detect'
            }
        },

        languageOptions: {
            globals: {
                ...globals.browser,
                ...Object.fromEntries(Object.entries(globals.node).map(([key]) => [key, 'off']))
            },

            ecmaVersion: 2018,
            sourceType: 'module',

            parserOptions: {
                ecmaFeatures: {
                    impliedStrict: true,
                    jsx: true
                },

                project: 'packages/webapp/tsconfig.json'
            }
        },

        rules: {
            ...tseslintRules,
            ...react.configs.flat.recommended.rules,
            ...react.configs.flat['jsx-runtime'].rules,
            ...reactHooks.configs.recommended.rules,
            'no-console': 'off',
            'react/prop-types': 'off',

            '@typescript-eslint/no-unused-expressions': 'off', // bugged
            '@typescript-eslint/no-empty-function': 'off',

            '@typescript-eslint/no-misused-promises': [
                'warn',
                {
                    checksVoidReturn: {
                        arguments: false,
                        attributes: false
                    }
                }
            ],

            'import/extensions': 'off'
        }
    },
    {
        files: ['packages/connect-ui/src/**/*.{tsx,ts}'],

        plugins: {
            '@typescript-eslint': tseslint.plugin,
            react: react,
            'react-hooks': reactHooks
        },
        extends: tseslintExtends,

        settings: {
            react: {
                version: 'detect'
            }
        },

        languageOptions: {
            globals: {
                ...globals.browser,
                ...Object.fromEntries(Object.entries(globals.node).map(([key]) => [key, 'off']))
            },

            ecmaVersion: 2018,
            sourceType: 'module',

            parserOptions: {
                ecmaFeatures: {
                    impliedStrict: true,
                    jsx: true
                },
                jsxPragma: null,

                project: 'packages/connect-ui/tsconfig.json'
            }
        },

        rules: {
            ...tseslintRules,
            ...react.configs.flat.recommended.rules,
            ...react.configs.flat['jsx-runtime'].rules,
            ...reactHooks.configs.recommended.rules,

            'import/extensions': 'off',
            '@typescript-eslint/member-ordering': 'error',
            '@typescript-eslint/no-non-null-assertion': 'error',
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/only-throw-error': 'error',
            'react/prop-types': 'off',

            'react/jsx-sort-props': [
                'error',
                {
                    callbacksLast: true,
                    shorthandFirst: true,
                    reservedFirst: true
                }
            ]
        }
    },
    {
        files: ['packages/cli/**/*.ts'],
        rules: {
            'no-console': 'off'
        }
    },
    {
        files: ['scripts/**/**.test.ts'],
        rules: {
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off'
        }
    },
    {
        files: ['**/*.ts'],
        rules: {
            'no-console': 'off'
        }
    }
);
