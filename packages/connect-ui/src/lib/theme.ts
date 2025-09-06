import type { ConnectUIThemeSettings } from '@nangohq/types';

export function setTheme(theme: ConnectUIThemeSettings) {
    const root = document.documentElement;

    root.style.setProperty('--color-background-surface', theme.light.backgroundSurface);
    root.style.setProperty('--color-background-elevated', theme.light.backgroundElevated);
    root.style.setProperty('--color-primary', theme.light.primary);
    root.style.setProperty('--color-on-primary', theme.light.onPrimary);
    root.style.setProperty('--color-text-primary', theme.light.textPrimary);
    root.style.setProperty('--color-text-secondary', theme.light.textSecondary);

    // Set dark theme variables in the .dark class
    const darkRoot = document.querySelector<HTMLElement>('.dark');
    if (darkRoot) {
        darkRoot.style.setProperty('--color-background-surface', theme.dark.backgroundSurface);
        darkRoot.style.setProperty('--color-background-elevated', theme.dark.backgroundElevated);
        darkRoot.style.setProperty('--color-primary', theme.dark.primary);
        darkRoot.style.setProperty('--color-on-primary', theme.dark.onPrimary);
        darkRoot.style.setProperty('--color-text-primary', theme.dark.textPrimary);
        darkRoot.style.setProperty('--color-text-secondary', theme.dark.textSecondary);
    }
}
