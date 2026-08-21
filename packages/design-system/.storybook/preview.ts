import { withThemeByDataAttribute } from '@storybook/addon-themes';
import { useEffect } from 'react';

import type { Preview, StoryContext, StoryFn } from '@storybook/react';

import './preview.css';

// tokens.generated.css uses [data-theme="dark"]; webapp uses .dark class.
// This second decorator syncs both so both token stories and component stories theme correctly.
const withDarkClass = (Story: StoryFn, context: StoryContext) => {
    const isDark = context.globals['theme'] === 'dark';
    useEffect(() => {
        document.documentElement.classList.toggle('dark', isDark);
    }, [isDark]);
    return Story(context.args, context);
};

const preview: Preview = {
    decorators: [
        withThemeByDataAttribute({
            themes: {
                light: '',
                dark: 'dark'
            },
            defaultTheme: 'light',
            attributeName: 'data-theme'
        }),
        withDarkClass
    ],
    parameters: {
        options: {
            // Design System first — it's what people reach for. Alphabetical would put "App Components"
            // (the not-yet-lifted webapp components) on top and auto-expand it on load.
            storySort: {
                method: 'alphabetical',
                order: ['Design System', 'App Components', '*']
            }
        },
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i
            }
        }
    }
};

export default preview;
