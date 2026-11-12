import { useLayoutEffect } from 'react';

// Fits the 220px sidebar, the page padding and the dashboard's 968px minimum content width.
const DESKTOP_VIEWPORT_WIDTH = 1280;
const DEVICE_VIEWPORT = 'width=device-width, initial-scale=1';

function desktopViewport() {
    const { width, height } = window.screen;
    const landscape = window.matchMedia('(orientation: landscape)').matches;
    // iOS reports the portrait width in both orientations.
    const deviceWidth = landscape ? Math.max(width, height) : Math.min(width, height);
    // Without initial-scale, iOS Safari keeps the zoom from the previous page and shows a cropped corner.
    return `width=${DESKTOP_VIEWPORT_WIDTH}, initial-scale=${(deviceWidth / DESKTOP_VIEWPORT_WIDTH).toFixed(3)}`;
}

export function useViewport(mode: 'desktop' | 'device') {
    useLayoutEffect(() => {
        const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
        if (!meta) {
            return;
        }

        const content = mode === 'desktop' && window.screen.width < DESKTOP_VIEWPORT_WIDTH ? desktopViewport() : DEVICE_VIEWPORT;
        // Every write makes mobile browsers re-apply the viewport and reset the user's zoom.
        if (meta.content !== content) {
            meta.content = content;
        }
    }, [mode]);
}
