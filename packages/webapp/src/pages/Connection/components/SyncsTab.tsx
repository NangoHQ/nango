import { useVirtualizer } from '@tanstack/react-virtual';
import { Ellipsis, Info, List, OctagonPause, Play, RefreshCw, Wrench, X } from 'lucide-react';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
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

const ROW_HEIGHT_PX = 44;

// TableRow's px-6 is inert in table layout but applies once the row is a flexbox, hence px-0 here.
const rowLayout = 'flex w-full px-0';
const cellLayout = 'flex items-center min-w-0';
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

export const SyncsTab = () => {
    const env = useStore((state) => state.env);
    const { connectionData, integrationData } = useConnectionContext();
    const { connection } = connectionData;
    const providerConfigKey = integrationData.integration.unique_key;

    const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useSyncs({
        env,
        provider_config_key: providerConfigKey,
        connection_id: connection.connection_id
    });
    const syncs = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);
    const total = data?.pages[0]?.pagination.total ?? 0;

    const { toast } = useToast();
    const navigate = useNavigate();
    const { mutateAsync: runSyncCommand } = useRunSyncCommand(env);

    const [triggerTarget, setTriggerTarget] = useState<ApiConnectionSync | null>(null);
    const [pendingSyncId, setPendingSyncId] = useState<string | null>(null);

    const tableRef = useRef<HTMLDivElement | null>(null);
    const sentinelRef = useInfiniteScroll({ hasNextPage, isFetchingNextPage, fetchNextPage, threshold: 400 });

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
                // APIError.message is always 'api_error'; the useful text is in the response body.
                const apiError = err as { json?: { error?: { message?: string } } };
                toast({ title: apiError.json?.error?.message || `Failed to ${UserFacingSyncCommand[command]} sync`, variant: 'error' });
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

    if (error) {
        return <CriticalErrorAlert message="Failed to load syncs" />;
    }

    if (isLoading) {
        return <Skeleton className="w-full h-42" />;
    }

    if (syncs.length === 0) {
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

    return (
        <div className="flex flex-col gap-3 w-full">
            <span className="text-text-secondary text-body-small-regular self-end">{total === 1 ? '1 sync' : `${formatQuantity(total)} syncs`}</span>
            <div ref={tableRef}>
                <Table className="grid border-separate border-spacing-0">
                    <TableHeader className="grid">
                        <TableRow className={rowLayout}>
                            {columns.map((column) => (
                                <TableHead key={column.key} className={cn(cellLayout, col[column.key])}>
                                    {column.label}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <VirtualizedSyncRows
                        syncs={syncs}
                        tableRef={tableRef}
                        pendingSyncId={pendingSyncId}
                        actionsDisabled={pendingSyncId !== null}
                        onSyncCommand={onSyncCommand}
                        onRequestTrigger={setTriggerTarget}
                        onViewLogs={onViewLogs}
                    />
                </Table>
            </div>
            <div ref={sentinelRef} aria-hidden />
            {isFetchingNextPage && <Skeleton className="w-full h-11" />}

            {triggerTarget && (
                <TriggerSyncDialog target={triggerTarget} isPending={pendingSyncId !== null} onClose={() => setTriggerTarget(null)} onTrigger={onSyncCommand} />
            )}
        </div>
    );
};

const VirtualizedSyncRows = ({
    syncs,
    tableRef,
    pendingSyncId,
    actionsDisabled,
    onSyncCommand,
    onRequestTrigger,
    onViewLogs
}: {
    syncs: ApiConnectionSync[];
    tableRef: React.MutableRefObject<HTMLDivElement | null>;
    pendingSyncId: string | null;
    actionsDisabled: boolean;
    onSyncCommand: (sync: ApiConnectionSync, command: RunSyncCommand) => void;
    onRequestTrigger: (sync: ApiConnectionSync) => void;
    onViewLogs: (sync: ApiConnectionSync) => void;
}) => {
    // Scrolls with the dashboard's own container, so the tab adds no second scrollbar. offsetTop is
    // resolved in a hook because it keys the measurement cache — a render-time read would rebuild it each frame.
    const { scrollParent, offsetTop } = useScrollParent(tableRef);
    const rowVirtualizer = useVirtualizer({
        count: syncs.length,
        getScrollElement: () => scrollParent,
        estimateSize: () => ROW_HEIGHT_PX,
        overscan: 5,
        scrollMargin: offsetTop
    });

    return (
        <TableBody className="grid relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const sync = syncs[virtualRow.index]!;
                return (
                    <SyncRow
                        key={sync.id}
                        sync={sync}
                        offsetY={virtualRow.start - rowVirtualizer.options.scrollMargin}
                        isPending={pendingSyncId === sync.id}
                        actionsDisabled={actionsDisabled}
                        onSyncCommand={onSyncCommand}
                        onRequestTrigger={onRequestTrigger}
                        onViewLogs={onViewLogs}
                    />
                );
            })}
        </TableBody>
    );
};

const SyncRow = memo(function SyncRow({
    sync,
    offsetY,
    isPending,
    actionsDisabled,
    onSyncCommand,
    onRequestTrigger,
    onViewLogs
}: {
    sync: ApiConnectionSync;
    offsetY: number;
    isPending: boolean;
    actionsDisabled: boolean;
    onSyncCommand: (sync: ApiConnectionSync, command: RunSyncCommand) => void;
    onRequestTrigger: (sync: ApiConnectionSync) => void;
    onViewLogs: (sync: ApiConnectionSync) => void;
}) {
    const models = sync.models.join(', ');
    const recordCount = sync.record_count ? formatQuantity(Object.values(sync.record_count).reduce((acc, count) => acc + count, 0)) : '0';
    const nextRun = interpretNextRun(sync.futureActionTimes, sync.latest_sync?.updated_at);
    const nextRunLabel = Array.isArray(nextRun) ? nextRun[0] : nextRun;

    return (
        <TableRow className={cn(rowLayout, 'absolute')} style={{ height: `${ROW_HEIGHT_PX}px`, transform: `translateY(${offsetY}px)` }}>
            <TableCell className={cn(cellLayout, col.name, 'gap-2')}>
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
            </TableCell>

            <TableCell className={cn(cellLayout, col.models)}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="text-body-small-semi text-text-strong truncate block">{models}</span>
                    </TooltipTrigger>
                    <TooltipContent>{models}</TooltipContent>
                </Tooltip>
            </TableCell>

            <TableCell className={cn(cellLayout, col.lastExecution)}>
                <Tooltip>
                    <TooltipTrigger>
                        <StatusBadge sync={sync} />
                    </TooltipTrigger>
                    {sync.latest_sync && <TooltipContent>{getRunTime(sync.latest_sync.created_at, sync.latest_sync.updated_at)}</TooltipContent>}
                </Tooltip>
            </TableCell>

            <TableCell className={cn(cellLayout, col.frequency)}>{sync.frequency ? formatFrequency(sync.frequency) : '-'}</TableCell>

            <TableCell className={cn(cellLayout, col.records)}>
                <Tooltip>
                    <TooltipTrigger>{recordCount}</TooltipTrigger>
                    <TooltipContent>
                        <JsonBlock value={sync.record_count} />
                    </TooltipContent>
                </Tooltip>
            </TableCell>

            <TableCell className={cn(cellLayout, col.lastStart)}>
                <Tooltip>
                    <TooltipTrigger>{formatDateToUSFormat(sync.latest_sync?.updated_at)}</TooltipTrigger>
                    {sync.latest_sync && (
                        <TooltipContent>
                            <JsonBlock value={sync.latest_sync.result} />
                        </TooltipContent>
                    )}
                </Tooltip>
            </TableCell>

            <TableCell className={cn(cellLayout, col.nextStart)}>
                {sync.schedule_status === 'STARTED' && <span>{nextRunLabel}</span>}

                {sync.schedule_status === 'PAUSED' && <CatalogBadge variant="warning">Schedule Paused</CatalogBadge>}
            </TableCell>

            <TableCell className={cn(cellLayout, col.actions)}>
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                        <IconButton variant="ghost" size="2xs" label="Sync actions" loading={isPending}>
                            <Ellipsis />
                        </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem
                            disabled={actionsDisabled || sync.schedule_status === null}
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
                            <DropdownMenuItem disabled={actionsDisabled} onClick={() => onRequestTrigger(sync)}>
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
            </TableCell>
        </TableRow>
    );
});

/** Controlled because dialogs don't work well inside dropdowns. */
const TriggerSyncDialog = ({
    target,
    isPending,
    onClose,
    onTrigger
}: {
    target: ApiConnectionSync;
    isPending: boolean;
    onClose: () => void;
    onTrigger: (sync: ApiConnectionSync, command: RunSyncCommand, opts?: { deleteRecords?: boolean }) => Promise<void> | void;
}) => {
    const [fullResync, setFullResync] = useState(false);
    const [emptyCache, setEmptyCache] = useState(false);

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

/** Stringifies in its own body, so a closed tooltip costs nothing per row. */
const JsonBlock = ({ value }: { value: unknown }) => {
    return <SimpleCodeBlock language={'json'}>{JSON.stringify(value, null, 2)}</SimpleCodeBlock>;
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

function useScrollParent(ref: React.MutableRefObject<HTMLElement | null>) {
    const [resolved, setResolved] = useState<{ scrollParent: HTMLElement | null; offsetTop: number }>({ scrollParent: null, offsetTop: 0 });

    useLayoutEffect(() => {
        const offsetTop = ref.current?.offsetTop ?? 0;
        for (let node = ref.current?.parentElement ?? null; node; node = node.parentElement) {
            const { overflowY } = getComputedStyle(node);
            if (overflowY === 'auto' || overflowY === 'scroll') {
                setResolved({ scrollParent: node, offsetTop });
                return;
            }
        }
        setResolved({ scrollParent: null, offsetTop });
    }, [ref]);

    return resolved;
}
