import { useLayoutEffect } from 'react';

// Fits the 220px sidebar, the page padding and the dashboard's 968px minimum content width.
const DESKTOP_VIEWPORT_WIDTH = 1280;
const DEVICE_VIEWPORT = 'width=device-width, initial-scale=1';

export function useViewport(mode: 'desktop' | 'device') {
    useLayoutEffect(() => {
        const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
        if (!meta) {
            return;
        }

        const content = mode === 'desktop' && window.screen.width < DESKTOP_VIEWPORT_WIDTH ? `width=${DESKTOP_VIEWPORT_WIDTH}` : DEVICE_VIEWPORT;
        // Every write makes mobile browsers re-apply the viewport and reset the user's zoom.
        if (meta.content !== content) {
            meta.content = content;
        }
    }, [mode]);
}
