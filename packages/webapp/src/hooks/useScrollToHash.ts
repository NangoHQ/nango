import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Breathing room between the top of the scrollport and the section, matching the page's own gutter. */
const TOP_OFFSET = 24;
const MAX_DURATION_MS = 2500;

/** `containerRef` must be the ref `DashboardLayout` forwards — the page itself never scrolls. */
export function useScrollToHash(containerRef: React.RefObject<HTMLElement>) {
    const { hash } = useLocation();

    useEffect(() => {
        const id = hash.slice(1);
        const container = containerRef.current;
        if (!id || !container) {
            return;
        }

        let frame = 0;
        let writtenTop = container.scrollTop;
        let cancelled = false;
        const startedAt = performance.now();
        const listeners = new AbortController();

        const stop = () => {
            cancelled = true;
            cancelAnimationFrame(frame);
            listeners.abort();
        };

        const onScroll = () => {
            if (Math.abs(container.scrollTop - writtenTop) > 1) {
                stop();
            }
        };

        // Sections above the target grow, mount and unmount as their queries resolve, so one scroll
        // on mount lands against a page shorter than the one the reader ends up seeing.
        const tick = (now: number) => {
            if (cancelled) {
                return;
            }

            const target = container.querySelector(`#${CSS.escape(id)}`);
            if (target) {
                const delta = target.getBoundingClientRect().top - (container.getBoundingClientRect().top + TOP_OFFSET);
                if (Math.abs(delta) > 1) {
                    container.scrollTop += delta;
                    writtenTop = container.scrollTop;
                }
            }

            // Watch for the whole budget rather than stopping once the offset holds still: the
            // queries resolve in bursts, so an early quiet stretch is not the last one.
            if (now - startedAt >= MAX_DURATION_MS) {
                stop();
                return;
            }

            frame = requestAnimationFrame(tick);
        };

        const { signal } = listeners;
        container.addEventListener('scroll', onScroll, { passive: true, signal });
        container.addEventListener('wheel', stop, { passive: true, signal });
        container.addEventListener('touchstart', stop, { passive: true, signal });
        frame = requestAnimationFrame(tick);

        return stop;
    }, [hash, containerRef]);
}
