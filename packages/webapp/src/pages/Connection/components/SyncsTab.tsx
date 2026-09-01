import { useVirtualizer } from '@tanstack/react-virtual';
import { Ellipsis, Info, List, OctagonPause, Play, RefreshCw, Search, Wrench, X } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInterval } from 'react-use';

import {
    Badge,
    Button,
    Dialog,
    DialogBody,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    IconButton,
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
    Tooltip,
    TooltipContent,
    TooltipTrigger
} from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Checkbox } from '@/components/ui/Checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { EmptyCard } from '@/components/ui/EmptyCard';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { SimpleCodeBlock } from '@/components/ui/SimpleCodeBlock';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useRunSyncCommand, useSyncs } from '@/hooks/useSyncs';
import { useToast } from '@/hooks/useToast';
import { useConnectionContext } from '@/pages/Connection/Show';
import { CatalogBadge } from '@/pages/Integrations/components/CatalogBadge';
import { useStore } from '@/store';
import { UserFacingSyncCommand } from '@/types';
import { getLogsUrl } from '@/utils/logs';
import { cn, formatDateToUSFormat, formatFrequency, formatQuantity, getRunTime, interpretNextRun, truncateMiddle } from '@/utils/utils';

import type { RunSyncCommand } from '@/types';
import type { ApiConnectionSync } from '@nangohq/types';
import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';

const ROW_HEIGHT_PX = 44;
const MAX_TABLE_HEIGHT_VH = 70;
const POLL_INTERVAL_MS = 5000;

// `display: grid` disables the browser's column sizing, so the header and the cells only line up
// while they share these classes.
const cellBase = 'flex items-center px-6 min-w-0 whitespace-nowrap';
const col = {
    name: 'min-w-50 flex-1 basis-0',
    models: 'w-32 shrink-0',
    lastExecution: 'w-30 shrink-0',
    frequency: 'w-24 shrink-0',
    records: 'w-20 shrink-0',
    lastStart: 'w-34 shrink-0',
    nextStart: 'w-36 shrink-0',
    actions: 'w-14 shrink-0 justify-end'
} as const;

const columns = [
    { key: 'name', label: 'Sync Name' },
    { key: 'models', label: 'Models' },
    { key: 'lastExecution', label: 'Last Execution' },
    { key: 'frequency', label: 'Frequency' },
    { key: 'records', label: 'Records' },
    { key: 'lastStart', label: 'Last Sync Start' },
    { key: 'nextStart', label: 'Next Sync Start' },
    { key: 'actions', label: '' }
] as const;

/** Kept as a snapshot so the dialog survives its originating row scrolling out of the virtual window. */
interface TriggerTarget {
    id: string;
    name: string;
    variant: string;
    nango_connection_id: number;
}

export const SyncsTab = () => {
    const env = useStore((state) => state.env);
    const { connectionData, integrationData } = useConnectionContext();
    const { connection } = connectionData;
    const providerConfigKey = integrationData.integration.unique_key;

    const [search, setSearch] = useQueryState('search', parseAsString.withDefault(''));
    const debouncedSearch = useDebouncedValue(search);

    const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useSyncs({
        env,
        provider_config_key: providerConfigKey,
        connection_id: connection.connection_id,
        search: debouncedSearch || undefined
    });

    const syncs = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);
    const total = data?.pages[0]?.pagination.total ?? 0;

    const { toast } = useToast();
    const navigate = useNavigate();
    const { mutateAsync: runSyncCommand, isPending: isRunningSyncCommand } = useRunSyncCommand({
        env,
        connection_id: connection.connection_id,
        provider_config_key: providerConfigKey
    });

    const [triggerTarget, setTriggerTarget] = useState<TriggerTarget | null>(null);
    const [pendingSyncId, setPendingSyncId] = useState<string | null>(null);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const [isAtTop, setIsAtTop] = useState(true);

    const onSyncCommand = useCallback(
        async (
            sync: Pick<ApiConnectionSync, 'id' | 'name' | 'variant' | 'nango_connection_id'>,
            command: RunSyncCommand,
            opts?: { deleteRecords?: boolean }
        ) => {
            setPendingSyncId(sync.id);
            try {
                await runSyncCommand({
                    command,
                    nango_connection_id: sync.nango_connection_id,
                    sync_id: sync.id,
                    sync_name: sync.name,
                    sync_variant: sync.variant,
                    provider: providerConfigKey,
                    ...(command === 'RUN_FULL' || command === 'RUN' ? { delete_records: opts?.deleteRecords ?? false } : {})
                });
                toast({ title: `The sync was successfully ${UserFacingSyncCommand[command]}`, variant: 'success' });
            } catch (err) {
                const message = err instanceof Error ? err.message : undefined;
                toast({ title: message || `Failed to ${UserFacingSyncCommand[command]} sync`, variant: 'error' });
            } finally {
                setPendingSyncId(null);
            }
        },
        [providerConfigKey, runSyncCommand, toast]
    );

    const onViewLogs = useCallback(
        (sync: ApiConnectionSync) => {
            void navigate(
                getLogsUrl({
                    env,
                    integrations: providerConfigKey,
                    connections: connection.connection_id,
                    syncs: sync.name,
                    day: sync.latest_sync?.updated_at ? new Date(sync.latest_sync.updated_at) : null
                })
            );
        },
        [connection.connection_id, env, navigate, providerConfigKey]
    );

    // Gated on the top of the list, where page 1 is the only page on screen and so the only one worth refetching.
    useInterval(
        () => {
            void refetch({ cancelRefetch: true });
        },
        isAtTop && !debouncedSearch && !isFetchingNextPage && document.visibilityState === 'visible' ? POLL_INTERVAL_MS : null
    );

    // A new search leaves the previous rows in place (keepPreviousData), so the offset has to be reset
    // explicitly or a shorter result set lurches.
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 });
    }, [debouncedSearch]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        const root = scrollRef.current;
        if (!sentinel || !root || !hasNextPage || isFetchingNextPage) {
            return;
        }
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    void fetchNextPage();
                }
            },
            { root, rootMargin: '400px' }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage, syncs.length]);

    if (error) {
        return <CriticalErrorAlert message="Failed to load syncs" />;
    }

    if (isLoading) {
        return <Skeleton className="w-full h-42" />;
    }

    const hasSearch = Boolean(debouncedSearch);

    if (syncs.length === 0 && !hasSearch) {
        const integrationName = integrationData.integration.display_name || integrationData.template.display_name;
        return (
            <EmptyCard>
                <span className="text-text-strong text-title-body">No models are syncing for {integrationName}.</span>
                <span className="text-text-secondary text-body-medium-regular">Start syncing models for {integrationName} on the Function settings tab.</span>
                <ButtonLink variant="primary" to={`/${env}/integrations/${providerConfigKey}/functions#syncs`}>
                    <Wrench />
                    Function configuration
                </ButtonLink>
            </EmptyCard>
        );
    }

    const tableHeight = Math.min(
        window.innerHeight * (MAX_TABLE_HEIGHT_VH / 100),
        ROW_HEIGHT_PX + syncs.length * ROW_HEIGHT_PX + (hasNextPage ? ROW_HEIGHT_PX : 0)
    );

    return (
        <div className="flex flex-col gap-3 w-full">
            <div className="flex items-center gap-3">
                <InputGroup>
                    <InputGroupInput type="text" placeholder="Search syncs" value={search} onChange={(e) => void setSearch(e.target.value || null)} />
                    <InputGroupAddon>
                        <Search />
                    </InputGroupAddon>
                </InputGroup>
                <span className="text-text-secondary text-body-small-regular whitespace-nowrap">
                    {formatQuantity(total)} {total === 1 ? 'sync' : 'syncs'}
                </span>
            </div>

            {syncs.length === 0 ? (
                <EmptyCard>
                    <span className="text-text-secondary text-body-medium-regular">No syncs match your search.</span>
                </EmptyCard>
            ) : (
                <div
                    ref={scrollRef}
                    onScroll={(e) => setIsAtTop(e.currentTarget.scrollTop === 0)}
                    className="overflow-y-auto overflow-x-hidden rounded border border-border-muted"
                    style={{ height: `${tableHeight}px` }}
                >
                    <table className="grid border-separate border-spacing-0 w-full">
                        <thead className="grid sticky top-0 z-10 bg-surface-canvas">
                            <tr className="flex w-full border-b border-border-muted" style={{ height: `${ROW_HEIGHT_PX}px` }}>
                                {columns.map((column) => (
                                    <th key={column.key} className={cn(cellBase, col[column.key], 'text-left text-body-small-semi text-text-secondary')}>
                                        {column.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <VirtualizedSyncRows
                            syncs={syncs}
                            scrollRef={scrollRef}
                            pendingSyncId={pendingSyncId}
                            isRunningSyncCommand={isRunningSyncCommand}
                            onSyncCommand={onSyncCommand}
                            onRequestTrigger={setTriggerTarget}
                            onViewLogs={onViewLogs}
                        />
                    </table>
                    <div ref={sentinelRef} aria-hidden />
                    {isFetchingNextPage && <Skeleton className="w-full h-11" />}
                </div>
            )}

            <TriggerSyncDialog
                key={triggerTarget?.id ?? 'none'}
                target={triggerTarget}
                isPending={isRunningSyncCommand}
                onClose={() => setTriggerTarget(null)}
                onTrigger={onSyncCommand}
            />
        </div>
    );
};

const VirtualizedSyncRows = ({
    syncs,
    scrollRef,
    pendingSyncId,
    isRunningSyncCommand,
    onSyncCommand,
    onRequestTrigger,
    onViewLogs
}: {
    syncs: ApiConnectionSync[];
    scrollRef: React.MutableRefObject<HTMLDivElement | null>;
    pendingSyncId: string | null;
    isRunningSyncCommand: boolean;
    onSyncCommand: (sync: ApiConnectionSync, command: RunSyncCommand) => void;
    onRequestTrigger: (target: TriggerTarget) => void;
    onViewLogs: (sync: ApiConnectionSync) => void;
}) => {
    const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
        count: syncs.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => ROW_HEIGHT_PX,
        measureElement:
            typeof window !== 'undefined' && navigator.userAgent.indexOf('Firefox') === -1 ? (element) => element?.getBoundingClientRect().height : undefined,
        overscan: 5
    });

    useLayoutEffect(() => {
        rowVirtualizer.measure();
    }, [syncs.length, rowVirtualizer]);

    return (
        <tbody className="grid relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const sync = syncs[virtualRow.index]!;
                return (
                    <SyncRow
                        key={sync.id}
                        sync={sync}
                        virtualRow={virtualRow}
                        rowVirtualizer={rowVirtualizer}
                        isPending={pendingSyncId === sync.id}
                        actionsDisabled={isRunningSyncCommand}
                        onSyncCommand={onSyncCommand}
                        onRequestTrigger={onRequestTrigger}
                        onViewLogs={onViewLogs}
                    />
                );
            })}
        </tbody>
    );
};

const SyncRow = memo(function SyncRow({
    sync,
    virtualRow,
    rowVirtualizer,
    isPending,
    actionsDisabled,
    onSyncCommand,
    onRequestTrigger,
    onViewLogs
}: {
    sync: ApiConnectionSync;
    virtualRow: VirtualItem;
    rowVirtualizer: Virtualizer<HTMLDivElement, HTMLTableRowElement>;
    isPending: boolean;
    actionsDisabled: boolean;
    onSyncCommand: (sync: ApiConnectionSync, command: RunSyncCommand) => void;
    onRequestTrigger: (target: TriggerTarget) => void;
    onViewLogs: (sync: ApiConnectionSync) => void;
}) {
    const models = sync.models.join(', ');
    const recordCount = sync.record_count ? formatQuantity(Object.values(sync.record_count).reduce((acc, count) => acc + count, 0)) : '0';

    return (
        <tr
            data-index={virtualRow.index}
            ref={rowVirtualizer.measureElement}
            className="flex w-full absolute border-b border-border-muted hover:bg-surface-hover"
            style={{ height: `${ROW_HEIGHT_PX}px`, transform: `translateY(${virtualRow.start}px)` }}
        >
            <td className={cn(cellBase, col.name, 'gap-2')}>
                <span className="text-body-small-semi text-text-strong truncate min-w-0 flex-1">{sync.name}</span>
                {sync.variant !== 'base' && (
                    <Tooltip>
                        <TooltipTrigger className="shrink-0">
                            {/* TODO: Replace badge */}
                            <Badge>{truncateMiddle(sync.variant)}</Badge>
                        </TooltipTrigger>
                        <TooltipContent>{sync.variant}</TooltipContent>
                    </Tooltip>
                )}
            </td>

            <td className={cn(cellBase, col.models)}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="text-body-small-semi text-text-strong truncate block">{models}</span>
                    </TooltipTrigger>
                    <TooltipContent>{models}</TooltipContent>
                </Tooltip>
            </td>

            <td className={cn(cellBase, col.lastExecution)}>
                <Tooltip>
                    <TooltipTrigger>
                        <StatusBadge sync={sync} />
                    </TooltipTrigger>
                    {sync.latest_sync && <TooltipContent>{getRunTime(sync.latest_sync.created_at, sync.latest_sync.updated_at)}</TooltipContent>}
                </Tooltip>
            </td>

            <td className={cn(cellBase, col.frequency)}>{sync.frequency ? formatFrequency(sync.frequency) : '-'}</td>

            <td className={cn(cellBase, col.records)}>
                <Tooltip>
                    <TooltipTrigger>{recordCount}</TooltipTrigger>
                    <TooltipContent>
                        <SimpleCodeBlock language={'json'}>{JSON.stringify(sync.record_count, null, 2)}</SimpleCodeBlock>
                    </TooltipContent>
                </Tooltip>
            </td>

            <td className={cn(cellBase, col.lastStart)}>
                <Tooltip>
                    <TooltipTrigger>{formatDateToUSFormat(sync.latest_sync?.updated_at)}</TooltipTrigger>
                    {sync.latest_sync && (
                        <TooltipContent>
                            <SimpleCodeBlock language={'json'}>{JSON.stringify(sync.latest_sync.result, null, 2)}</SimpleCodeBlock>
                        </TooltipContent>
                    )}
                </Tooltip>
            </td>

            <td className={cn(cellBase, col.nextStart)}>
                {sync.schedule_status === 'STARTED' &&
                    (interpretNextRun(sync.futureActionTimes) === '-' ? (
                        <span>-</span>
                    ) : (
                        <span>{interpretNextRun(sync.futureActionTimes, sync.latest_sync?.updated_at)[0]}</span>
                    ))}

                {sync.schedule_status === 'PAUSED' && <CatalogBadge variant="warning">Schedule Paused</CatalogBadge>}
            </td>

            <td className={cn(cellBase, col.actions)}>
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                        <IconButton variant="ghost" size="2xs" label="Sync actions" loading={isPending}>
                            <Ellipsis />
                        </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            disabled={actionsDisabled}
                            onClick={() => onSyncCommand(sync, sync.schedule_status === 'STARTED' ? 'PAUSE' : 'UNPAUSE')}
                        >
                            {sync.schedule_status !== 'STARTED' ? (
                                <>
                                    <Play />
                                    <span>Resume Schedule</span>
                                </>
                            ) : (
                                <>
                                    <OctagonPause />
                                    <span>Pause Schedule</span>
                                </>
                            )}
                        </DropdownMenuItem>

                        {sync.status === 'RUNNING' && (
                            <DropdownMenuItem disabled={actionsDisabled} onClick={() => onSyncCommand(sync, 'CANCEL')}>
                                <X />
                                <span>Cancel Execution</span>
                            </DropdownMenuItem>
                        )}

                        {sync.status !== 'RUNNING' && (
                            <DropdownMenuItem
                                disabled={actionsDisabled}
                                onClick={() =>
                                    onRequestTrigger({
                                        id: sync.id,
                                        name: sync.name,
                                        variant: sync.variant,
                                        nango_connection_id: sync.nango_connection_id
                                    })
                                }
                            >
                                <RefreshCw />
                                <span>Trigger execution</span>
                            </DropdownMenuItem>
                        )}

                        <DropdownMenuItem onClick={() => onViewLogs(sync)}>
                            <List />
                            <span>View logs</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </td>
        </tr>
    );
});

/** Controlled because dialogs don't work well inside dropdowns. */
const TriggerSyncDialog = ({
    target,
    isPending,
    onClose,
    onTrigger
}: {
    target: TriggerTarget | null;
    isPending: boolean;
    onClose: () => void;
    onTrigger: (sync: TriggerTarget, command: RunSyncCommand, opts?: { deleteRecords?: boolean }) => Promise<void> | void;
}) => {
    const [fullResync, setFullResync] = useState(false);
    const [emptyCache, setEmptyCache] = useState(false);

    if (!target) {
        return null;
    }

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()} modal={true}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Trigger sync execution</DialogTitle>
                    <DialogDescription>
                        Trigger a sync execution for function <span className="font-mono text-text-strong">{target.name}</span> in the current connection.
                    </DialogDescription>
                </DialogHeader>

                <DialogBody>
                    <div className="flex flex-col gap-8">
                        <div className="inline-flex gap-2 items-center">
                            <Checkbox checked={fullResync} onCheckedChange={(e) => setFullResync(e === true)} />
                            <span className="text-text-strong text-body-medium-medium">Resync entire dataset</span>
                            <InfoTooltip icon={<Info />} side="bottom">
                                The current checkpoint (and the deprecated <span className="font-mono text-text-strong">nango.lastSyncDate</span>) will be set
                                to <span className="font-mono text-text-strong">null</span>. The whole dataset will be resynced.
                            </InfoTooltip>
                        </div>

                        <div className="inline-flex gap-2 items-center">
                            <Checkbox checked={emptyCache} onCheckedChange={(e) => setEmptyCache(e === true)} />
                            <span className="text-text-strong text-body-medium-medium">Empty cache</span>
                            <InfoTooltip icon={<Info />} side="bottom">
                                All records will be reported as new by Nango. Record cursors will be invalidated. Your backend should reprocess all records.
                            </InfoTooltip>
                        </div>
                    </div>
                </DialogBody>

                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline" size="sm">
                            Cancel
                        </Button>
                    </DialogClose>
                    <Button
                        variant="primary"
                        size="sm"
                        loading={isPending}
                        onClick={async () => {
                            await onTrigger(target, fullResync ? 'RUN_FULL' : 'RUN', { deleteRecords: emptyCache });
                            onClose();
                        }}
                    >
                        Trigger
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const StatusBadge = ({ sync }: { sync: ApiConnectionSync }) => {
    const status = sync.latest_sync?.status;

    let text = 'Never run';
    let variant: 'success' | 'info' | 'warning' | 'error' | 'light' = 'light';

    switch (status) {
        case 'SUCCESS':
            text = 'Success';
            variant = 'success';
            break;
        case 'STOPPED':
            text = 'Failed';
            variant = 'error';
            break;
        case 'RUNNING':
            text = 'Running';
            variant = 'info';
            break;
        case 'PAUSED':
            text = 'Paused';
            variant = 'warning';
            break;
    }

    return (
        <CatalogBadge variant={variant} className="-uppercase">
            {text}
        </CatalogBadge>
    );
};
