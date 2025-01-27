import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import * as tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import eslint from '@eslint/js';
import importPlugin from 'eslint-plugin-import';

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
            'docs-v2/script.js',
            'packages/runner-sdk/models.d.ts'
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

            'unicorn/catch-error-name': [
                'error',
                {
                    name: 'err'
                }
            ]
        }
    },
    {
        files: ['**/*.{ts,tsx}'],
        plugins: {
            '@typescript-eslint': tseslint.plugin
        },
        extends: [
            tseslint.configs.recommended,
            tseslint.configs.recommendedTypeChecked,
            tseslint.configs.strict,
            tseslint.configs.stylistic,
            tseslint.configs.strictTypeChecked
        ],

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

        rules: {
            'no-unused-vars': 'off',
            '@typescript-eslint/no-inferrable-types': 'off',
            '@typescript-eslint/require-await': 'error',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn',

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
            '@typescript-eslint/no-base-to-string': 'warn',
            '@typescript-eslint/restrict-plus-operands': 'warn',
            '@typescript-eslint/consistent-type-exports': 'error',
            '@typescript-eslint/no-unnecessary-condition': 'off',
            '@typescript-eslint/only-throw-error': 'warn',

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
            '@typescript-eslint/no-deprecated': 'warn',
            '@typescript-eslint/no-floating-promises': 'warn',
            '@typescript-eslint/no-unsafe-assignment': 'warn',
            '@typescript-eslint/no-unsafe-member-access': 'warn',
            '@typescript-eslint/no-unsafe-call': 'warn',
            '@typescript-eslint/no-unsafe-argument': 'warn',
            '@typescript-eslint/no-misused-promises': 'warn',
            '@typescript-eslint/no-unsafe-return': 'warn',
            '@typescript-eslint/no-empty-function': 'warn',
            '@typescript-eslint/no-unsafe-enum-comparison': 'warn'
        }
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
        files: ['packages/frontend/**/*.ts'],
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
        files: ['packages/webapp/src/**/*.{tsx,ts}'],
        plugins: {
            react: react,
            'react-hooks': reactHooks
        },
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
            react: react,
            'react-hooks': reactHooks
        },

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
            ],

            'import/order': [
                'error',
                {
                    groups: ['builtin', 'external', 'unknown', 'internal', 'parent', 'sibling', 'type', 'index', 'object'],

                    'newlines-between': 'always',

                    alphabetize: {
                        order: 'asc'
                    },

                    warnOnUnassignedImports: true,

                    pathGroups: [
                        {
                            pattern: '@/**',
                            group: 'parent'
                        },
                        {
                            pattern: '@nangohq/*',
                            group: 'internal',
                            position: 'after'
                        }
                    ]
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
        files: ['**/**.test.ts'],
        rules: {
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off'
        }
    }
);
