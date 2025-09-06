import type { ConnectUIThemeSettings } from '@nangohq/types';

export function setTheme(theme: ConnectUIThemeSettings) {
    const root = document.documentElement;

    root.style.setProperty('--color-background-surface', theme.light.background);
    root.style.setProperty('--color-background-elevated', theme.light.foreground);
    root.style.setProperty('--color-primary', theme.light.primary);
    root.style.setProperty('--color-on-primary', theme.light.primaryForeground);
    root.style.setProperty('--color-text-primary', theme.light.textPrimary);
    root.style.setProperty('--color-text-secondary', theme.light.textMuted);
}
