import { useGlobal } from './store';
import { setTheme } from './theme';

import type { ConnectUISettings } from '@nangohq/types';

export function updateSettings(settings: ConnectUISettings) {
    setTheme(settings.theme);
    useGlobal.getState().setShowWatermark(settings.showWatermark);
}
