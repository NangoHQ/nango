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
            storySort: {
                method: 'alphabetical'
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
