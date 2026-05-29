import { withThemeByDataAttribute } from '@storybook/addon-themes';

import type { Preview } from '@storybook/react';
import './preview.css';

const preview: Preview = {
    decorators: [
        withThemeByDataAttribute({
            themes: {
                light: '',
                dark: 'dark'
            },
            defaultTheme: 'light',
            attributeName: 'data-theme'
        })
    ],
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i
            }
        }
    }
};

export default preview;
