import { Prism } from '@mantine/prism';

import { darkModeSelector, useThemeStore } from '@/lib/theme';

import type { PrismProps } from '@mantine/prism';

export const SimpleCodeBlock = ({ children, language }: { children: string; language: PrismProps['language'] }) => {
    const darkMode = useThemeStore(darkModeSelector);
    return (
        <Prism className="w-full min-w-0" language={language} colorScheme={darkMode ? 'dark' : 'light'} noCopy={true}>
            {children}
        </Prism>
    );
};
