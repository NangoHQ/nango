import type { ConnectUIThemeSettings } from '@nangohq/types';

export function setTheme(theme: ConnectUIThemeSettings) {
    return;
    const root = document.documentElement;

    root.style.setProperty('--color-primary', theme.light.buttonBackground);
    root.style.setProperty('--color-primary-foreground', theme.light.buttonText);
}
