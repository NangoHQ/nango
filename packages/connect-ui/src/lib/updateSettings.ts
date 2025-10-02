import { useGlobal } from './store';
import { getEffectiveTheme, setColors, setTheme } from './theme';

import type { ConnectUISettings, Theme } from '@nangohq/types';

export function updateSettings(settings: ConnectUISettings, themeOverride?: Theme) {
    const themeToUse = getEffectiveTheme(themeOverride ?? settings.defaultTheme);
    setTheme(themeToUse);
    setColors(settings.theme, themeToUse);
    useGlobal.getState().setShowWatermark(settings.showWatermark);
}
