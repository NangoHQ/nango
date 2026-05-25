import { Sun, X } from 'lucide-react';
import { useEffect } from 'react';
import { create } from 'zustand';

import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { useFeatureFlagsStore } from '@/store/feature-flags';

/**
 * True when the dev tool panel should be available:
 * - local Vite dev server
 * - *.app-development.nango.dev (development deployment and PR previews)
 */
export const isDevToolsEnabled = import.meta.env.DEV || window.location.hostname.endsWith('.app-development.nango.dev');

// Toggle with: Alt+Shift+D (Option+Shift+D on Mac)
// Uses e.code (physical key) instead of e.key so that Option+Shift+D on Mac
// doesn't produce a Unicode character that breaks the check.
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
    const setFlag = useFeatureFlagsStore((s) => s.setFlag);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === DEV_PANEL_SHORTCUT && e.shiftKey && e.altKey) {
                e.preventDefault();
                toggle();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (!open) {
        return null;
    }

    return (
        <div className="fixed bottom-11 right-11 z-50 w-64 rounded border border-border-muted bg-dropdown-bg-press shadow-md">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border-muted px-3 py-2">
                <span className="text-sm font-medium text-text-default">Dev Tools</span>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="size-5 text-text-secondary hover:text-text-default">
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
                            <span className="text-sm text-text-default">Theme switcher</span>
                        </div>
                        <Switch checked={themeSwitcher} onCheckedChange={(v) => setFlag('themeSwitcher', v)} />
                    </li>
                </ul>
            </div>

            {/* Footer */}
            <div className="border-t border-border-muted px-3 py-2">
                <p className="text-sm text-text-secondary">
                    <kbd className="rounded border border-border-muted bg-surface-panel px-1.5 py-0.5 font-mono text-xs">⌥⇧D</kbd> to toggle
                </p>
            </div>
        </div>
    );
};
