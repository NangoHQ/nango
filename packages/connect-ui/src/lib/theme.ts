import type { ConnectUIThemeSettings } from '@nangohq/types';

export function setTheme(theme: ConnectUIThemeSettings) {
    return;
    const root = document.documentElement;

    root.style.setProperty('--color-background-surface', theme.light.backgroundSurface);
    root.style.setProperty('--color-background-elevated', theme.light.backgroundElevated);
    root.style.setProperty('--color-primary', theme.light.primary);
    root.style.setProperty('--color-on-primary', theme.light.onPrimary);
    root.style.setProperty('--color-text-primary', theme.light.textPrimary);
    root.style.setProperty('--color-text-secondary', theme.light.textSecondary);
}
