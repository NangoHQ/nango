import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';

import type { StorybookConfig } from '@storybook/react-vite';
import type { InlineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
    stories: ['../tokens/**/*.stories.@(ts|tsx)', '../src/**/*.stories.@(ts|tsx)', '../stories/**/*.stories.@(ts|tsx)', '../stories/**/*.mdx'],
    staticDirs: [{ from: '../../webapp/public/images', to: '/images' }],
    addons: ['@storybook/addon-a11y', '@storybook/addon-docs', '@storybook/addon-mcp', '@storybook/addon-themes'],
    framework: {
        name: '@storybook/react-vite',
        options: {}
    },
    viteFinal(config): InlineConfig {
        const existingAlias = Array.isArray(config.resolve?.alias)
            ? Object.fromEntries(
                  (config.resolve.alias as { find: string; replacement: string }[])
                      .filter((a) => typeof a.find === 'string')
                      .map((a) => [a.find, a.replacement])
              )
            : (config.resolve?.alias ?? {});
        return {
            ...config,
            plugins: [...(config.plugins ?? []), tailwindcss()],
            resolve: {
                ...config.resolve,
                alias: {
                    ...existingAlias,
                    '@': path.resolve(__dirname, '../../webapp/src'),
                    // CI builds Storybook without building workspace packages, so dist/ doesn't exist there.
                    '@nangohq/frontend': path.resolve(__dirname, '../../frontend/lib/index.ts')
                }
            },
            server: {
                ...config.server,
                fs: {
                    allow: [path.resolve(__dirname, '../..')]
                }
            }
        };
    }
};

export default config;
