import { BarChart3, Moon, Sun, X } from 'lucide-react';
import { useEffect } from 'react';
import { create } from 'zustand';

import { Button } from '@nangohq/design-system';

import { Switch } from '@/components/ui/Switch';
import { useTeam } from '@/hooks/useTeam';
import { darkModeSelector, useThemeStore } from '@/lib/theme';
import { useStore } from '@/store';
import { useFeatureFlagsStore } from '@/store/feature-flags';

/**
 * True when the dev tool panel is available based on the current hostname:
 * - local Vite dev server
 * - *.app-development.nango.dev (development deployment and PR previews)
 * - app-staging.nango.dev (staging deployment)
 */
const isDevToolsEnabledByHostname =
    import.meta.env.DEV ||
    window.location.hostname === 'app-development.nango.dev' ||
    window.location.hostname.endsWith('.app-development.nango.dev') ||
    window.location.hostname === 'app-staging.nango.dev';

/**
 * Returns true when the dev tool panel should be available — either on a dev
 * hostname or when the signed-in account is the Nango admin team.
 *
 * Defaults to false until the team query resolves, so there is no flash on
 * first paint for non-admin accounts.
 */
export function useIsDevToolsEnabled(): boolean {
    const env = useStore((s) => s.env);
    const { data } = useTeam(env);
    return isDevToolsEnabledByHostname || (data?.data.isAdminTeam ?? false);
}

// Toggle with: Ctrl+Shift+D
export const DEV_PANEL_SHORTCUT = 'KeyD';

interface DevPanelState {
    open: boolean;
    setOpen: (open: boolean) => void;
    toggle: () => void;
}

export const useDevPanelStore = create<DevPanelState>((set, get) => ({
    open: false,
    setOpen: (open) => set({ open }),
    toggle: () => set({ open: !get().open })
}));

export const DevToolPanel: React.FC = () => {
    const open = useDevPanelStore((s) => s.open);
    const setOpen = useDevPanelStore((s) => s.setOpen);
    const toggle = useDevPanelStore((s) => s.toggle);
    const usageBreakdown = useFeatureFlagsStore((s) => s.usageBreakdown);
    const setFlag = useFeatureFlagsStore((s) => s.setFlag);
    const theme = useThemeStore((s) => s.theme);
    const darkMode = useThemeStore(darkModeSelector);
    const toggleDarkMode = useThemeStore((s) => s.toggleDarkMode);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === DEV_PANEL_SHORTCUT && e.shiftKey && e.ctrlKey) {
                e.preventDefault();
                toggle();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggle]);

    if (!open) {
        return null;
    }

    return (
        <div className="fixed bottom-11 right-11 z-50 w-64 rounded border border-border-muted bg-surface-overlay shadow-md">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border-muted px-3 py-2">
                <span className="text-sm font-medium text-text-strong">Dev Tools</span>
                <Button variant="ghost" size="2xs" onClick={() => setOpen(false)} className="size-5 text-text-secondary hover:text-text-strong">
                    <X className="size-3.5" />
                </Button>
            </div>

            {/* Theme */}
            <div className="p-3 border-b border-border-muted">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">Theme</p>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {darkMode ? <Moon className="size-4 shrink-0 text-text-secondary" /> : <Sun className="size-4 shrink-0 text-text-secondary" />}
                        <span className="text-sm text-text-strong">
                            {theme === 'system' ? `System (${darkMode ? 'dark' : 'light'})` : darkMode ? 'Dark' : 'Light'}
                        </span>
                    </div>
                    <Switch checked={darkMode} onCheckedChange={toggleDarkMode} />
                </div>
            </div>

            {/* Feature flags */}
            <div className="p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">Feature Flags</p>
                <ul className="space-y-2.5">
                    <li className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="size-4 shrink-0 text-text-secondary" />
                            <span className="text-sm text-text-strong">Usage breakdown</span>
                        </div>
                        <Switch checked={usageBreakdown} onCheckedChange={(v) => setFlag('usageBreakdown', v)} />
                    </li>
                </ul>
            </div>

            {/* Footer */}
            <div className="border-t border-border-muted px-3 py-2">
                <p className="text-sm text-text-secondary">
                    <kbd className="rounded border border-border-muted bg-surface-panel px-1.5 py-0.5 font-mono text-xs">Ctrl+Shift+D</kbd> to toggle
                </p>
            </div>
        </div>
    );
};
