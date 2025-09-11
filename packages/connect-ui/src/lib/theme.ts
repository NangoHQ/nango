import type { ConnectUIThemeSettings } from '@nangohq/types';

export function setTheme(theme: ConnectUIThemeSettings) {
    const root = document.documentElement;

    root.style.setProperty('--color-primary', theme.light.buttonBackground);
    root.style.setProperty('--color-on-primary', theme.light.buttonText);
}
