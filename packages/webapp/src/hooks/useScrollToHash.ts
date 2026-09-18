import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Breathing room between the top of the scrollport and the section, matching the page's own gutter. */
const TOP_OFFSET = 24;
const GIVE_UP_AFTER_MS = 2500;

/** Holds the `location.hash` section at the top of `containerRef`, which must be the ref `DashboardLayout` forwards — the page itself never scrolls. */
export function useScrollToHash(containerRef: React.RefObject<HTMLElement>) {
    const { hash } = useLocation();

    useEffect(() => {
        const id = hash.slice(1);
        const container = containerRef.current;
        if (!id || !container) {
            return;
        }

        let writtenTop = container.scrollTop;
        let timer = 0;
        const listeners = new AbortController();

        // On arrival the page is shorter than its loaded height, so this scroll clamps at the
        // bottom and lands short of the section; each size change afterwards lifts that clamp.
        const align = () => {
            const target = container.querySelector(`#${CSS.escape(id)}`);
            if (!target) {
                return;
            }

            const delta = target.getBoundingClientRect().top - (container.getBoundingClientRect().top + TOP_OFFSET);
            if (Math.abs(delta) <= 1) {
                return;
            }

            container.scrollTop += delta;
            writtenTop = container.scrollTop;
        };

        const observer = new ResizeObserver(align);
        const stop = () => {
            observer.disconnect();
            clearTimeout(timer);
            listeners.abort();
        };

        const onScroll = () => {
            if (Math.abs(container.scrollTop - writtenTop) > 1) {
                stop();
            }
        };

        const { signal } = listeners;
        container.addEventListener('scroll', onScroll, { passive: true, signal });
        container.addEventListener('wheel', stop, { passive: true, signal });
        container.addEventListener('touchstart', stop, { passive: true, signal });

        // The container's own box only changes on a viewport resize; the page's height lives on its
        // children, so both are watched.
        observer.observe(container);
        for (const child of container.children) {
            observer.observe(child);
        }

        align();
        timer = window.setTimeout(stop, GIVE_UP_AFTER_MS);

        return stop;
    }, [hash, containerRef]);
}
