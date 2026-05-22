import tailwindcss from '@tailwindcss/vite';

import type { StorybookConfig } from '@storybook/react-vite';
import type { InlineConfig } from 'vite';

const config: StorybookConfig = {
    stories: ['../tokens/**/*.stories.@(ts|tsx)'],
    addons: ['@storybook/addon-a11y', '@storybook/addon-mcp', '@storybook/addon-themes'],
    framework: {
        name: '@storybook/react-vite',
        options: {}
    },
    viteFinal(config): InlineConfig {
        return {
            ...config,
            plugins: [...(config.plugins ?? []), tailwindcss()],
            optimizeDeps: {
                ...config.optimizeDeps,
                include: [...(config.optimizeDeps?.include ?? []), 'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client']
            }
        };
    }
};

export default config;
