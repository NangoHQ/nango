import { BookOpen, Box, LifeBuoy as HelpIcon, Moon, Sun } from 'lucide-react';

import { permissions } from '@nangohq/authz';
import { Button, IconButton } from '@nangohq/design-system';

import { Breadcrumbs } from '@/components/patterns/Breadcrumbs';
import { PermissionGate } from '@/components/patterns/PermissionGate';
import { useEnvironment } from '@/hooks/useEnvironment';
import { usePermissions } from '@/hooks/usePermissions';
import { darkModeSelector, useThemeStore } from '@/lib/theme';
import { useStore } from '@/store';
import { usePlaygroundStore } from '@/store/playground';

export const AppHeader: React.FC = () => {
    const env = useStore((s) => s.env);
    const playgroundOpen = usePlaygroundStore((s) => s.isOpen);
    const setPlaygroundOpen = usePlaygroundStore((s) => s.setOpen);
    const { data: envData } = useEnvironment(env);
    const environment = envData?.environmentAndAccount?.environment;
    const { can } = usePermissions();
    const canUsePlayground = envData != null && (can(permissions.canUseProdPlayground) || !environment?.is_production);
    const darkMode = useThemeStore(darkModeSelector);
    const toggleDarkMode = useThemeStore((s) => s.toggleDarkMode);

    return (
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b-[0.5px] border-border-default bg-surface-canvas px-6">
            <Breadcrumbs />
            <div className="flex justify-end gap-2">
                <PermissionGate condition={canUsePlayground}>
                    {(allowed) => (
                        <Button variant="outline" size="md" disabled={!allowed} onClick={() => setPlaygroundOpen(!playgroundOpen)}>
                            <Box />
                            Playground
                        </Button>
                    )}
                </PermissionGate>
                <IconButton asChild variant="outline" size="md" label="Docs">
                    <a href="https://nango.dev/docs" target="_blank" rel="noreferrer">
                        <BookOpen />
                    </a>
                </IconButton>
                <IconButton variant="outline" size="md" label="Help" onClick={() => window.Plain?.open()}>
                    <HelpIcon />
                </IconButton>
                <IconButton variant="outline" size="md" label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleDarkMode}>
                    {darkMode ? <Sun /> : <Moon />}
                </IconButton>
            </div>
        </header>
    );
};
