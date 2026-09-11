import { useGlobal } from './store';

import type { ConnectUISettings, Theme } from '@nangohq/types';

export function updateSettings(settings: ConnectUISettings, themeOverride?: Theme) {
    const { setSettings, setTheme } = useGlobal.getState();
    setSettings(settings);
    setTheme(themeOverride ?? settings.defaultTheme);
}
