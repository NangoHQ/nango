import tailwindcss from '@tailwindcss/vite';

import type { StorybookConfig } from '@storybook/react-vite';
import type { InlineConfig } from 'vite';

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.@(ts|tsx)'],
    addons: ['@storybook/addon-themes'],
    framework: {
        name: '@storybook/react-vite',
        options: {}
    },
    docs: {
        autodocs: 'tag'
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
