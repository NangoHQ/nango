import type { GetConnectUISettingsResponse } from '@nangohq/types/lib/connect-ui-settings/dto';

export function updateTheme(colors: GetConnectUISettingsResponse['colors']) {
    if (!colors) return;

    const root = document.documentElement;

    Object.entries(colors).forEach(([key, value]) => {
        if (value) {
            const cssVarName = `--color-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
            root.style.setProperty(cssVarName, value);
        }
    });
}
