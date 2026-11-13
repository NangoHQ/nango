import { useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router-dom';

import { PAGE_SIZE } from './catalog.utils';

import type { RefObject } from 'react';

interface Place {
    visibleCount: number;
    scrollTop: number;
}

const places = new Map<string, Place>();

export function useCatalogPlace({ scrollRef, filterKey, isReady }: { scrollRef: RefObject<HTMLElement | null>; filterKey: string; isReady: boolean }) {
    const location = useLocation();
    const navigationType = useNavigationType();
    // Keyed by history entry, so only Back restores a place. A fresh visit to the same URL starts at the top.
    const [saved] = useState(() => (navigationType === NavigationType.Pop ? places.get(location.key) : undefined));

    const [loaded, setLoaded] = useState({ filterKey, count: saved?.visibleCount ?? PAGE_SIZE });
    let visibleCount = loaded.count;
    if (loaded.filterKey !== filterKey) {
        visibleCount = PAGE_SIZE;
        setLoaded({ filterKey, count: PAGE_SIZE });
    }

    // useInfiniteScroll re-observes when `isLoadingMore` turns false. That loads the next page if the sentinel is still in view.
    const [isLoadingMore, startTransition] = useTransition();
    const loadMore = useCallback(() => {
        // A page requested under the previous filters must not land on top of the reset.
        startTransition(() => setLoaded((current) => (current.filterKey === filterKey ? { filterKey, count: current.count + PAGE_SIZE } : current)));
    }, [filterKey]);

    const scrolledFilterKey = useRef(filterKey);
    useLayoutEffect(() => {
        if (scrolledFilterKey.current === filterKey) {
            return;
        }
        scrolledFilterKey.current = filterKey;
        scrollRef.current?.scrollTo({ top: 0 });
    }, [filterKey, scrollRef]);

    const pendingScrollTop = useRef(saved?.scrollTop);
    useLayoutEffect(() => {
        if (!isReady || pendingScrollTop.current === undefined || !scrollRef.current) {
            return;
        }
        scrollRef.current.scrollTop = pendingScrollTop.current;
        pendingScrollTop.current = undefined;
    }, [isReady, scrollRef]);

    // Track scrollTop on scroll. By the time the unmount cleanup runs, the container is detached and reads 0.
    const placeRef = useRef<Place & { key: string }>({ key: location.key, visibleCount, scrollTop: saved?.scrollTop ?? 0 });
    useEffect(() => {
        placeRef.current.key = location.key;
        placeRef.current.visibleCount = visibleCount;
    }, [location.key, visibleCount]);
    useEffect(() => {
        const node = scrollRef.current;
        if (!node) {
            return;
        }
        const onScroll = () => {
            placeRef.current.scrollTop = node.scrollTop;
        };
        node.addEventListener('scroll', onScroll, { passive: true });
        return () => node.removeEventListener('scroll', onScroll);
    }, [scrollRef]);
    useEffect(
        () => () => {
            const { key, ...place } = placeRef.current;
            places.set(key, place);
        },
        []
    );

    return { visibleCount, loadMore, isLoadingMore };
}
