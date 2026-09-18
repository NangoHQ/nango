import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** Scrolls to the `location.hash` section once `ready`. Any earlier and the page is still too short, so the scroll clamps above the section. */
export function useScrollToHash(containerRef: React.RefObject<HTMLElement>, ready: boolean) {
    const { hash } = useLocation();
    const scrolledTo = useRef<string | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!ready || !hash || !container || scrolledTo.current === hash) {
            return;
        }

        // Nothing scrolls the page before this runs, so a non-zero position is the reader's own.
        if (container.scrollTop > 0) {
            scrolledTo.current = hash;
            return;
        }

        const target = container.querySelector(`#${CSS.escape(hash.slice(1))}`);
        if (!target) {
            return;
        }

        scrolledTo.current = hash;
        target.scrollIntoView({ block: 'start' });
    }, [hash, ready, containerRef]);
}
