import { BarChart3, Sun, X } from 'lucide-react';
import { useEffect } from 'react';
import { create } from 'zustand';

import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { useTeam } from '@/hooks/useTeam';
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
    const themeSwitcher = useFeatureFlagsStore((s) => s.themeSwitcher);
    const usageBreakdown = useFeatureFlagsStore((s) => s.usageBreakdown);
    const setFlag = useFeatureFlagsStore((s) => s.setFlag);

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
        <div className="fixed bottom-11 right-11 z-50 w-64 rounded border border-border-muted bg-dropdown-bg-press shadow-md">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border-muted px-3 py-2">
                <span className="text-sm font-medium text-text-primary">Dev Tools</span>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="size-5 text-text-secondary hover:text-text-primary">
                    <X className="size-3.5" />
                </Button>
            </div>

            {/* Feature flags */}
            <div className="p-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">Feature Flags</p>
                <ul className="space-y-2.5">
                    <li className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Sun className="size-4 shrink-0 text-text-secondary" />
                            <span className="text-sm text-text-primary">Theme switcher</span>
                        </div>
                        <Switch checked={themeSwitcher} onCheckedChange={(v) => setFlag('themeSwitcher', v)} />
                    </li>
                    <li className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="size-4 shrink-0 text-text-secondary" />
                            <span className="text-sm text-text-primary">Usage breakdown</span>
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
