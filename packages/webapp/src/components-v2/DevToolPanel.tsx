import { Moon, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { useFeatureFlagsStore } from '@/store/feature-flags';

// Dev tool panel — only rendered when import.meta.env.DEV is true.
// Toggle with: Ctrl+Shift+D (Windows/Linux) or Cmd+Shift+D (Mac)
export const DEV_PANEL_SHORTCUT = 'd';

export const DevToolPanel: React.FC = () => {
    const [open, setOpen] = useState(false);
    const darkMode = useFeatureFlagsStore((s) => s.darkMode);
    const toggleDarkMode = useFeatureFlagsStore((s) => s.toggleDarkMode);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === DEV_PANEL_SHORTCUT && e.shiftKey && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((prev) => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (!open) {
        return null;
    }

    return (
        <div className="fixed bottom-4 right-4 z-50 w-72 rounded-md border border-border-default bg-surface-panel shadow-lg">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-text-secondary">Dev Tools</span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="text-text-secondary hover:text-text-default">
                    <X className="size-3.5" />
                </Button>
            </div>

            {/* Feature flags list */}
            <div className="p-4">
                <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary">Feature Flags</p>
                <ul className="space-y-3">
                    <li className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {darkMode ? <Moon className="size-3.5 text-text-secondary" /> : <Sun className="size-3.5 text-text-secondary" />}
                            <span className="text-sm text-text-default">Dark mode</span>
                        </div>
                        <Switch checked={darkMode} onCheckedChange={toggleDarkMode} />
                    </li>
                </ul>
            </div>

            {/* Footer hint */}
            <div className="border-t border-border-default px-4 py-2">
                <p className="text-[11px] text-text-secondary">
                    <kbd className="rounded bg-surface-panel-inset px-1 py-0.5 text-[10px] font-mono">⌘⇧D</kbd> to toggle
                </p>
            </div>
        </div>
    );
};
