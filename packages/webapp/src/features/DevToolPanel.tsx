import { ChevronRight, CreditCard, Palette, X } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { create } from 'zustand';

import { IconButton } from '@nangohq/design-system';

import { syncPersistedOverridesToTheme } from '@/features/tokenEditorPersistence';
import { useTeam } from '@/hooks/useTeam';
import { darkModeSelector, useThemeStore } from '@/lib/theme';
import { useStore } from '@/store';
import { SentryErrorBoundary } from '@/utils/sentry';

// Lazy-loaded so the Token Editor — and its bundled tokens.json + usage snapshot — is code-split
// out of the main bundle. It's a dev/admin-only tool, so the chunk is only fetched when opened.
const TokenEditorContent = lazy(() => import('./TokenEditorOverlay').then((m) => ({ default: m.TokenEditorContent })));
const PlanOverrideContent = lazy(() => import('./PlanOverrideOverlay').then((m) => ({ default: m.PlanOverrideContent })));

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

type DevPanelView = 'home' | 'token-editor' | 'plan-override';

interface DevPanelState {
    open: boolean;
    view: DevPanelView;
    setOpen: (open: boolean) => void;
    setView: (view: DevPanelView) => void;
    toggle: () => void;
}

export const useDevPanelStore = create<DevPanelState>((set, get) => ({
    open: false,
    view: 'home',
    // Reset to home view when closing so reopening always starts fresh
    setOpen: (open) => set(open ? { open } : { open, view: 'home' }),
    setView: (view) => set({ view }),
    toggle: () => {
        const next = !get().open;
        set(next ? { open: true } : { open: false, view: 'home' });
    }
}));

export const DevToolPanel: React.FC = () => {
    const open = useDevPanelStore((s) => s.open);
    const view = useDevPanelStore((s) => s.view);
    const setOpen = useDevPanelStore((s) => s.setOpen);
    const setView = useDevPanelStore((s) => s.setView);
    const toggle = useDevPanelStore((s) => s.toggle);
    const darkMode = useThemeStore(darkModeSelector);

    // Restore persisted token overrides on load and when the app theme changes, without opening the editor.
    useEffect(() => {
        syncPersistedOverridesToTheme(darkMode ? 'dark' : 'light');
    }, [darkMode]);

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

    const close = () => setOpen(false);

    return (
        <div className="fixed inset-y-0 right-0 z-50 flex w-[640px] flex-col border-l border-border-muted bg-surface-panel shadow-lg">
            {view === 'home' ? (
                <>
                    {/* Header */}
                    <div className="flex shrink-0 items-center justify-between border-b border-border-muted px-4 py-3">
                        <span className="font-medium text-text-default">Dev Tools</span>
                        <IconButton variant="ghost" size="2xs" label="Close" onClick={close} className="text-text-muted hover:text-text-default">
                            <X className="size-3.5" />
                        </IconButton>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-4">
                        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">Tools</p>
                        <ul className="space-y-1">
                            <li>
                                <button
                                    onClick={() => setView('token-editor')}
                                    className="flex w-full cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm text-text-default hover:bg-surface-panel-inset"
                                >
                                    <Palette className="size-4 shrink-0 text-text-muted" />
                                    <span className="flex-1 text-left">Token Editor</span>
                                    <ChevronRight className="size-4 shrink-0 text-text-muted" />
                                </button>
                            </li>
                            <li>
                                <button
                                    onClick={() => setView('plan-override')}
                                    className="flex w-full cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm text-text-default hover:bg-surface-panel-inset"
                                >
                                    <CreditCard className="size-4 shrink-0 text-text-muted" />
                                    <span className="flex-1 text-left">Plan Override</span>
                                    <ChevronRight className="size-4 shrink-0 text-text-muted" />
                                </button>
                            </li>
                        </ul>
                    </div>

                    {/* Footer */}
                    <div className="shrink-0 border-t border-border-muted px-4 py-3">
                        <p className="text-sm text-text-muted">
                            <kbd className="rounded border border-border-muted bg-surface-panel-inset px-1.5 py-0.5 font-mono text-xs">Ctrl+Shift+D</kbd> to
                            toggle
                        </p>
                    </div>
                </>
            ) : (
                // Scoped boundary so a failed lazy chunk (or a crash in the editor) stays contained to the
                // panel and is reported to Sentry, instead of bubbling to the app-level boundary.
                <SentryErrorBoundary
                    fallback={
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-sm text-text-muted">
                            <span>This tool failed to load.</span>
                            <button onClick={() => window.location.reload()} className="rounded border border-border-muted px-2 py-1 hover:text-text-default">
                                Reload
                            </button>
                        </div>
                    }
                >
                    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-text-muted">Loading…</div>}>
                        {view === 'token-editor' ? (
                            <TokenEditorContent onBack={() => setView('home')} onClose={close} />
                        ) : (
                            <PlanOverrideContent onBack={() => setView('home')} onClose={close} />
                        )}
                    </Suspense>
                </SentryErrorBoundary>
            )}
        </div>
    );
};
