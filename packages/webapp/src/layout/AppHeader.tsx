import { BookOpen, Box, Moon, Sun } from 'lucide-react';

import { permissions } from '@nangohq/authz';

import { SlackIcon } from '@/assets/SlackIcon';
import { Breadcrumbs } from '@/components/patterns/Breadcrumbs';
import { PermissionGate } from '@/components/patterns/PermissionGate';
import { Button, ButtonLink } from '@/components/ui/Button';
import { useIsDevToolsEnabled } from '@/features/DevToolPanel';
import { useEnvironment } from '@/hooks/useEnvironment';
import { usePermissions } from '@/hooks/usePermissions';
import { useThemeStore } from '@/lib/theme';
import { useStore } from '@/store';
import { useFeatureFlagsStore } from '@/store/feature-flags';
import { usePlaygroundStore } from '@/store/playground';

export const AppHeader: React.FC = () => {
    const env = useStore((s) => s.env);
    const playgroundOpen = usePlaygroundStore((s) => s.isOpen);
    const setPlaygroundOpen = usePlaygroundStore((s) => s.setOpen);
    const { data: envData } = useEnvironment(env);
    const environment = envData?.environmentAndAccount?.environment;
    const { can } = usePermissions();
    const canUsePlayground = envData != null && (can(permissions.canUseProdPlayground) || !environment?.is_production);
    const isDevToolsEnabled = useIsDevToolsEnabled();
    const themeSwitcher = useFeatureFlagsStore((s) => s.themeSwitcher);
    const darkMode = useThemeStore((s) => s.darkMode);
    const toggleDarkMode = useThemeStore((s) => s.toggleDarkMode);

    return (
        <header className="h-16 px-10 pl-2 py-2.5 items-center flex justify-between shrink-0 gap-1.5 bg-surface-canvas">
            <Breadcrumbs />
            <div className="flex gap-1.5 justify-end">
                <PermissionGate condition={canUsePlayground}>
                    {(allowed) => (
                        <Button variant="outline" size="sm" disabled={!allowed} onClick={() => setPlaygroundOpen(!playgroundOpen)}>
                            <Box />
                            Playground
                        </Button>
                    )}
                </PermissionGate>
                <ButtonLink to="https://nango.dev/docs" target="_blank" variant="outline" size="sm">
                    <BookOpen />
                    Docs
                </ButtonLink>
                <ButtonLink to="https://nango.dev/slack" target="_blank" variant="outline" size="sm">
                    <SlackIcon />
                    Help
                </ButtonLink>
                {isDevToolsEnabled && themeSwitcher && (
                    <Button variant="outline" size="sm" className="size-8 p-0" onClick={toggleDarkMode} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
                        {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
                    </Button>
                )}
            </div>
        </header>
    );
};
