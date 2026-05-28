import eslint from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import * as tseslint from 'typescript-eslint';

// Same as eslint.config.mjs but without type-aware rules.
// Runs without needing ts-build dist artifacts (~3s vs ~77s locally).
// Use for quickly autofixing imports and style after a refactor:
//   npm run lint:fast        - check
//   npm run lint:fast:fix    - autofix
const tseslintExtends = [
    tseslint.configs.recommended,
    tseslint.configs.strict,
    tseslint.configs.stylistic,
    tseslint.configs.disableTypeChecked
];

// Only non-type-aware rules — type-aware ones are disabled by disableTypeChecked
// and must not be re-added here (rules override extends, so they'd crash without project).
const tseslintRules = {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-inferrable-types': 'off',

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

    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-empty-function': 'warn',
    '@typescript-eslint/no-unnecessary-type-parameters': 'off',
    '@typescript-eslint/no-invalid-void-type': 'warn'
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

    {
        files: ['**/*.{js,mjs,cjs,ts,jsx,tsx,mts,mtsx}'],
        plugins: {
            unicorn,
            import: importPlugin,
            prettier: prettierPlugin
        },
        languageOptions: {
            globals: {
                ...globals.node
            }
        },
        rules: {
            ...eslint.configs.recommended.rules,

            // Registered but off — files have eslint-disable prettier/prettier inline comments
            // which would error if the plugin is unknown. Not running the rule keeps it fast.
            'prettier/prettier': 'off',

            // Skip import/named, import/default — slow resolution-based rules
            // not needed for the fast autofix use case.

            'import/no-duplicates': 'error',
            'import/no-empty-named-blocks': 'error',
            'import/no-absolute-path': 'error',
            'import/no-self-import': 'error',
            'import/newline-after-import': 'error',
            'import/consistent-type-specifier-style': ['error', 'prefer-top-level'],
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
        // Browser packages are excluded — each has its own block with its tsconfig.
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
                }
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
                }
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
                }
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
                jsxPragma: null
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
