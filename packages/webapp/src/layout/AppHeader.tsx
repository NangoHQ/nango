import { BookOpen, MessageSquareMore as HelpIcon, Moon, Sun } from 'lucide-react';

import { IconButton } from '@nangohq/design-system';

import { Breadcrumbs } from '@/components/patterns/Breadcrumbs';
import { darkModeSelector, useThemeStore } from '@/lib/theme';
import { openSupportChat } from '@/utils/support';

export const AppHeader: React.FC = () => {
    const darkMode = useThemeStore(darkModeSelector);
    const toggleDarkMode = useThemeStore((s) => s.toggleDarkMode);

    return (
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b-[0.5px] border-border-default bg-surface-canvas px-6">
            <Breadcrumbs />
            <div className="flex justify-end gap-2">
                <IconButton asChild variant="outline" size="md" label="Docs">
                    <a href="https://nango.dev/docs" target="_blank" rel="noreferrer">
                        <BookOpen />
                    </a>
                </IconButton>
                <IconButton variant="outline" size="md" label="Help" onClick={openSupportChat}>
                    <HelpIcon />
                </IconButton>
                <IconButton variant="outline" size="md" label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleDarkMode}>
                    {darkMode ? <Sun /> : <Moon />}
                </IconButton>
            </div>
        </header>
    );
};
