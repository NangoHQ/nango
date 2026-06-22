import { useEffect, useRef } from 'react';

import type { MutableRefObject } from 'react';

interface UseInfiniteScrollArgs {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => unknown;
    threshold?: number;
}

export function useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    threshold = 200
}: UseInfiniteScrollArgs): MutableRefObject<HTMLDivElement | null> {
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    // Keep the latest fetchNextPage callback in a ref so the observer effect doesn't tear down on every render.
    const fetchNextPageRef = useRef(fetchNextPage);
    useEffect(() => {
        fetchNextPageRef.current = fetchNextPage;
    }, [fetchNextPage]);

    useEffect(() => {
        const node = sentinelRef.current;
        if (!node || !hasNextPage || isFetchingNextPage) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    fetchNextPageRef.current();
                }
            },
            { rootMargin: `0px 0px ${threshold}px 0px` }
        );

        observer.observe(node);
        return () => {
            observer.disconnect();
        };
    }, [hasNextPage, isFetchingNextPage, threshold]);

    return sentinelRef;
}
