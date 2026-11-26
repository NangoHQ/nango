import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, Search, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDebounce, useInterval } from 'react-use';

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, SegmentedControl, SegmentedControlItem } from '@nangohq/design-system';

import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Skeleton } from '@/components/ui/Skeleton';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useStore } from '@/store';
import { APIError, apiFetch } from '@/utils/api';
import { findScrollParent } from '@/utils/scroll';
import { formatQuantity } from '@/utils/utils';
import { LOG_GRID, LogRow } from './LogRow';

import type { LogLevel, MessageRow, OperationRow, SearchMessages } from '@nangohq/types';

const PAGE_SIZE = 50;
const ROW_HEIGHT_PX = 33;

type Order = NonNullable<SearchMessages['Body']['order']>;
type LevelFilter = 'all' | LogLevel;
const levelOptions: { value: LevelFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'error', label: 'Error' },
    { value: 'warn', label: 'Warn' },
    { value: 'info', label: 'Info' },
    { value: 'debug', label: 'Debug' }
];

function levelCount(counts: Record<LogLevel, number>, level: LevelFilter): number {
    if (level === 'all') {
        return counts.debug + counts.info + counts.warn + counts.error;
    }
    return counts[level];
}

function useScrollParent(listRef: React.RefObject<HTMLDivElement | null>) {
    const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);
    const [offsetTop, setOffsetTop] = useState(0);

    useLayoutEffect(() => {
        const list = listRef.current;
        const parent = list ? findScrollParent(list) : null;
        setScrollParent(parent);
        if (!list || !parent) {
            return;
        }
        // Content above the list (the payload) can grow and push the list down.
        const measure = () => setOffsetTop(list.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop);
        measure();
        const observer = new ResizeObserver(measure);
        for (const child of Array.from(parent.children)) {
            observer.observe(child);
        }
        return () => observer.disconnect();
    }, [listRef]);

    return { scrollParent, offsetTop };
}

export const Logs: React.FC<{ operation: OperationRow; operationId: string; isLive: boolean }> = ({ operation, operationId, isLive }) => {
    const env = useStore((state) => state.env);
    const [search, setSearch] = useState<string | undefined>();
    const [debouncedSearch, setDebouncedSearch] = useState<string | undefined>();
    const [level, setLevel] = useState<LevelFilter>('all');
    const [order, setOrder] = useState<Order>('asc');
    const [openId, setOpenId] = useState<string | null>(null);

    useDebounce(() => setDebouncedSearch(search), 250, [search]);

    const { data, isLoading, isFetching, isFetchingNextPage, fetchNextPage, fetchPreviousPage } = useInfiniteQuery<
        SearchMessages['Success'],
        SearchMessages['Errors'],
        { pages: SearchMessages['Success'][] },
        unknown[],
        { before: string | null } | { after: string | null } | null
    >({
        queryKey: [env, 'logs:messages:infinite', operationId, debouncedSearch, level, order],
        queryFn: async ({ pageParam, signal }) => {
            const res = await apiFetch(`/api/v1/logs/messages?env=${env}`, {
                method: 'POST',
                body: JSON.stringify({
                    operationId,
                    limit: PAGE_SIZE,
                    search: debouncedSearch,
                    levels: level === 'all' ? undefined : [level],
                    order,
                    cursorAfter: pageParam && 'after' in pageParam ? pageParam.after : undefined,
                    cursorBefore: pageParam && 'before' in pageParam ? pageParam.before : undefined
                } satisfies SearchMessages['Body']),
                signal
            });
            if (res.status !== 200) {
                throw new APIError({ res, json: (await res.json()) as Record<string, unknown> });
            }

            return (await res.json()) as SearchMessages['Success'];
        },
        initialPageParam: null,
        staleTime: isLive ? 0 : 10_000,
        gcTime: isLive ? 0 : 10_000,
        getNextPageParam: (lastPage) => ({ after: lastPage.pagination.cursorAfter }),
        getPreviousPageParam: (firstPage) => ({ before: firstPage.pagination.cursorBefore }),
        // Refetching would reload every page ever loaded
        refetchOnWindowFocus: false,
        refetchOnMount: false
    });

    const messages = useMemo<MessageRow[]>(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);

    // Only the page at the newest edge carries the current total and counts.
    const newestPage = order === 'asc' ? data?.pages.at(-1) : data?.pages[0];
    const total = newestPage?.pagination.total ?? 0;

    // Kept across level switches, so the counts don't blank out while the new level loads
    const [levelCounts, setLevelCounts] = useState<Record<LogLevel, number>>();
    useEffect(() => {
        if (newestPage?.levelCounts) {
            setLevelCounts(newestPage.levelCounts);
        }
    }, [newestPage]);

    const hasMore = messages.length < total;
    const allLoaded = Boolean(data) && !hasMore;

    useInterval(
        () => {
            if (order === 'desc') {
                void fetchPreviousPage({ cancelRefetch: false });
            } else if (allLoaded) {
                void fetchNextPage({ cancelRefetch: false });
            }
        },
        isLive ? 5000 : null
    );

    const listRef = useRef<HTMLDivElement>(null);
    const { scrollParent, offsetTop } = useScrollParent(listRef);
    const sentinelRef = useInfiniteScroll({ hasNextPage: hasMore, isFetchingNextPage, fetchNextPage: () => fetchNextPage({ cancelRefetch: false }) });

    const rowVirtualizer = useVirtualizer({
        count: messages.length,
        getScrollElement: () => scrollParent,
        estimateSize: () => ROW_HEIGHT_PX,
        getItemKey: (index) => messages[index]?.id ?? index,
        overscan: 10,
        scrollMargin: offsetTop
    });

    const pinnedToBottom = useRef(false);
    useEffect(() => {
        if (!scrollParent) {
            return;
        }
        const onScroll = () => {
            pinnedToBottom.current = scrollParent.scrollHeight - scrollParent.scrollTop - scrollParent.clientHeight < 8;
        };
        scrollParent.addEventListener('scroll', onScroll, { passive: true });
        return () => scrollParent.removeEventListener('scroll', onScroll);
    }, [scrollParent]);
    const lineCount = messages.length;
    useLayoutEffect(() => {
        if (order === 'asc' && isLive && pinnedToBottom.current && scrollParent) {
            scrollParent.scrollTop = scrollParent.scrollHeight;
        }
    }, [lineCount, order, isLive, scrollParent]);

    const onToggle = useCallback((id: string) => setOpenId((current) => (current === id ? null : id)), []);

    const filtered = Boolean(debouncedSearch) || level !== 'all';

    return (
        <section className="flex flex-col gap-2">
            <div className="flex min-h-7 items-center gap-2">
                <h3 className="type-label-md text-text-strong">Logs</h3>
                {data && (
                    <span className="type-text-regular-sm text-text-muted">
                        {formatQuantity(total)} {total === 1 ? 'log' : 'logs'}
                    </span>
                )}
                {operation.operation.type === 'sync' && operation.operation.action === 'run' && (
                    <span className="flex items-center type-text-regular-sm text-text-muted">
                        <InfoTooltip size="sm">
                            Only some successful HTTP calls are stored for sync runs. Errors, warnings and other lines are always stored.
                        </InfoTooltip>
                        Sampling is on
                    </span>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-48 flex-1">
                    <InputGroup>
                        <InputGroupAddon>
                            <Search />
                        </InputGroupAddon>
                        <InputGroupInput value={search ?? ''} placeholder="Search logs…" onChange={(e) => setSearch(e.target.value)} />
                        {search && (
                            <InputGroupAddon align="inline-end">
                                <InputGroupButton
                                    label="Clear search"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => {
                                        setDebouncedSearch('');
                                        setSearch('');
                                    }}
                                >
                                    <X />
                                </InputGroupButton>
                            </InputGroupAddon>
                        )}
                    </InputGroup>
                </div>
                <SegmentedControl
                    aria-label="Level"
                    value={level}
                    onValueChange={(value) => {
                        setOpenId(null);
                        setLevel(levelOptions.find((option) => option.value === value)?.value ?? 'all');
                    }}
                >
                    {levelOptions.map((option) => (
                        <SegmentedControlItem
                            key={option.value}
                            value={option.value}
                            count={levelCounts ? formatQuantity(levelCount(levelCounts, option.value)) : undefined}
                            disabled={!isLive && option.value !== 'all' && option.value !== level && levelCounts?.[option.value] === 0}
                        >
                            {option.label}
                        </SegmentedControlItem>
                    ))}
                </SegmentedControl>
            </div>

            <div className="overflow-hidden rounded border border-border-muted">
                <div className={`${LOG_GRID} min-h-7 border-b border-border-muted bg-surface-panel-muted type-text-regular-xs text-text-secondary`}>
                    <button
                        type="button"
                        className="focus-default -mx-1 flex w-fit cursor-pointer items-center gap-1 rounded-ds-xs px-1 outline-none hover:text-text-strong"
                        aria-label={order === 'asc' ? 'Timestamp, oldest first. Show newest first' : 'Timestamp, newest first. Show oldest first'}
                        onClick={() => {
                            setOpenId(null);
                            setOrder(order === 'asc' ? 'desc' : 'asc');
                        }}
                    >
                        Timestamp
                        {order === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                    </button>
                    <span>Level</span>
                    <span>Message</span>
                    <span className="text-right">Duration</span>
                </div>

                <div ref={listRef} data-owns-arrow-keys className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
                    {rowVirtualizer.getVirtualItems().map((item) => {
                        const message = messages[item.index];
                        if (!message) {
                            return null;
                        }
                        return (
                            <div
                                key={item.key}
                                data-index={item.index}
                                ref={rowVirtualizer.measureElement}
                                className="absolute left-0 top-0 w-full"
                                style={{ transform: `translateY(${item.start - rowVirtualizer.options.scrollMargin}px)` }}
                            >
                                <LogRow message={message} open={openId === message.id} onToggle={() => onToggle(message.id)} />
                            </div>
                        );
                    })}
                </div>

                {isLoading && (
                    <div className={`${LOG_GRID} min-h-8`}>
                        <Skeleton className="w-20" />
                        <Skeleton className="w-10" />
                        <Skeleton className="w-48" />
                        <span />
                    </div>
                )}
                {!isFetching && messages.length === 0 && (
                    <p className="px-3 py-2 type-text-regular-sm text-text-muted">{filtered ? 'No logs match' : 'No logs'}</p>
                )}
            </div>
            {hasMore && <div ref={sentinelRef} className="h-px" />}
        </section>
    );
};
