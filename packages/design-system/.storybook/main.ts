import tailwindcss from '@tailwindcss/vite';

import type { StorybookConfig } from '@storybook/react-vite';
import type { InlineConfig } from 'vite';

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.@(ts|tsx)', '../tokens/**/*.stories.@(ts|tsx)'],
    addons: ['@storybook/addon-a11y', '@storybook/addon-mcp', '@storybook/addon-themes'],
    framework: {
        name: '@storybook/react-vite',
        options: {}
    },
    viteFinal(config): InlineConfig {
        return {
            ...config,
            plugins: [...(config.plugins ?? []), tailwindcss()]
        };
    }
};

export default config;
