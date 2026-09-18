import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** Scrolls to the `location.hash` section once `ready`. Any earlier and the page is still too short, so the scroll clamps above the section. */
export function useScrollToHash(containerRef: React.RefObject<HTMLElement>, ready: boolean) {
    const { hash } = useLocation();
    const scrolledTo = useRef<string | null>(null);
    const arrivedWith = useRef(hash);

    useEffect(() => {
        const container = containerRef.current;
        if (!ready || !hash || !container || scrolledTo.current === hash) {
            return;
        }

        // Only the hash we arrived with waits, so a non-zero position here is the reader scrolling
        // during that wait. A hash they click later is a request to move, whatever they scrolled to.
        if (hash === arrivedWith.current && container.scrollTop > 0) {
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
