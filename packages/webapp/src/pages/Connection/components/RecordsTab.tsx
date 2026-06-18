import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUpRight, ChevronLeft, Info, Loader, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { Alert, AlertActions, AlertDescription } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { EmptyCard } from '@/components/ui/EmptyCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { StyledLink } from '@/components/ui/StyledLink';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { useConnectionRecordModels, useConnectionRecordPayload, useConnectionRecords } from '@/hooks/useRecords';
import { useConnectionContext } from '@/pages/Connection/Show';
import { ConnectionTabLayout } from '@/pages/Connection/components/ConnectionTabLayout';
import { useStore } from '@/store';
import { APIError } from '@/utils/api';
import { cn, formatDateToUSFormat } from '@/utils/utils';

import type { ConnectionRecordModel, NangoRecord } from '@nangohq/types';

const RECORDS_DOCS_URL = 'https://nango.dev/docs/implementation-guides/use-cases/syncs/implement-a-sync';
const RECORDS_PAGE_SIZE = 20;
const RECORD_ROW_HEIGHT_PX = 44;

export const RecordsTab = () => {
    const env = useStore((state) => state.env);
    const navigate = useNavigate();
    const { connectionData, providerConfigKey } = useConnectionContext();
    const { connection } = connectionData;
    const [isDocsBannerVisible, setIsDocsBannerVisible] = useState(true);

    const {
        data: models,
        isLoading: isModelsLoading,
        error: modelsError
    } = useConnectionRecordModels({ env, provider_config_key: providerConfigKey }, { connectionId: connection.connection_id });

    const handleSelectModel = (model: ConnectionRecordModel) => {
        const params = model.variant ? `?variant=${encodeURIComponent(model.variant)}` : '';
        navigate(`${encodeURIComponent(model.model)}${params}`);
    };

    return (
        <ConnectionTabLayout connectionData={connectionData}>
            <div className="flex w-full min-w-0 max-w-4xl flex-col gap-5">
                {modelsError && <CriticalErrorAlert message="Failed to load connection records" />}

                {!modelsError && isModelsLoading && <Skeleton className="h-72 w-full" />}

                {!modelsError && !isModelsLoading && models && models.length === 0 && <EmptyRecordsState />}

                {!modelsError && !isModelsLoading && models && models.length > 0 && (
                    <>
                        {isDocsBannerVisible && <RecordsDocsBanner onClose={() => setIsDocsBannerVisible(false)} />}
                        <RecordModelsTable models={models} onSelect={handleSelectModel} />
                    </>
                )}
            </div>
        </ConnectionTabLayout>
    );
};

const EmptyRecordsState = () => {
    return (
        <EmptyCard className="h-65 gap-3">
            <span className="text-title-body text-text-strong">No records found.</span>
            <span className="text-body-medium-regular text-text-secondary">Learn how to sync records.</span>
            <Button asChild size="lg">
                <a href={RECORDS_DOCS_URL} target="_blank" rel="noreferrer">
                    View docs
                    <ArrowUpRight />
                </a>
            </Button>
        </EmptyCard>
    );
};

const RecordsDocsBanner = ({ onClose }: { onClose: () => void }) => {
    return (
        <Alert variant="info">
            <Info />
            <AlertDescription>
                Records are populated by syncs.{' '}
                <StyledLink to={RECORDS_DOCS_URL} type="external" icon variant="info">
                    Docs
                </StyledLink>
            </AlertDescription>
            <AlertActions>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-status-info-text hover:text-status-info-text"
                    onClick={onClose}
                    aria-label="Dismiss records docs banner"
                >
                    <X />
                </Button>
            </AlertActions>
        </Alert>
    );
};

const RecordModelsTable = ({ models, onSelect }: { models: ConnectionRecordModel[]; onSelect: (model: ConnectionRecordModel) => void }) => {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Record count</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {models.map((model) => {
                    const modelKey = getModelKey(model);

                    return (
                        <TableRow key={modelKey} className="cursor-pointer" onClick={() => onSelect(model)}>
                            <TableCell>{formatModelLabel(model)}</TableCell>
                            <TableCell>{formatCount(model.count)}</TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
};

export const ConnectionRecordTable = ({
    connectionId,
    env,
    model,
    providerConfigKey
}: {
    connectionId: string;
    env: string;
    model: ConnectionRecordModel;
    providerConfigKey: string;
}) => {
    const { data, error, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useConnectionRecords(
        {
            env,
            provider_config_key: providerConfigKey,
            model: model.model,
            variant: model.variant || undefined,
            limit: RECORDS_PAGE_SIZE,
            metadata_only: true
        },
        { connectionId }
    );

    const records = data?.pages.flatMap((page) => page.records) || [];
    const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
    const scrollParentRef = useRef<HTMLDivElement>(null);
    const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
    const fetchNextPageRef = useRef(fetchNextPage);
    fetchNextPageRef.current = fetchNextPage;
    const loadMoreStateRef = useRef({ hasNextPage, isFetchingNextPage });
    loadMoreStateRef.current = { hasNextPage, isFetchingNextPage };

    useEffect(() => {
        const root = scrollParentRef.current;
        const el = loadMoreSentinelRef.current;
        if (!root || !el || !hasNextPage) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const [entry] = entries;
                const { hasNextPage: canLoad, isFetchingNextPage: fetching } = loadMoreStateRef.current;
                if (entry?.isIntersecting && canLoad && !fetching) {
                    void fetchNextPageRef.current();
                }
            },
            { root, rootMargin: '400px', threshold: 0 }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [hasNextPage]);

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
                <Link to=".." aria-label="Back to records" className="group inline-flex w-fit items-center gap-2 focus-default">
                    <ChevronLeft className="size-5 shrink-0 text-text-muted transition-colors group-hover:text-text-strong" />
                    <span className="text-body-large-semi text-text-strong">{formatModelLabel(model)}</span>
                </Link>
                {model.count > 0 && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="text-body-small-regular text-text-muted cursor-default">{formatCountCompact(model.count)} records found</span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{formatCount(model.count)} records</TooltipContent>
                    </Tooltip>
                )}
            </div>

            {error && <CriticalErrorAlert message="Failed to load records for this model" />}

            {!error && isLoading && <Skeleton className="h-72 w-full" />}

            {!error && !isLoading && records.length === 0 && (
                <EmptyCard className="h-52 gap-3">
                    <span className="text-title-body text-text-strong">No records found for this model.</span>
                    <span className="text-body-medium-regular text-text-secondary">This model currently has no synced records available to inspect.</span>
                </EmptyCard>
            )}

            {!error && !isLoading && records.length > 0 && (
                <>
                    <div
                        ref={scrollParentRef}
                        className="max-h-[70vh] w-full min-w-0 overflow-auto rounded border border-border-muted [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                    >
                        <VirtualizedRecordRows scrollParentRef={scrollParentRef} records={records} onOpenPayload={setActiveRecordId} />
                        {hasNextPage && (
                            <div
                                ref={loadMoreSentinelRef}
                                aria-busy={isFetchingNextPage}
                                aria-label={isFetchingNextPage ? 'Loading more records' : 'Load more records when visible'}
                                className="flex min-h-12 w-full items-center justify-center py-3"
                                role="status"
                            >
                                {isFetchingNextPage && <Loader className="size-4 animate-spin text-text-muted" />}
                            </div>
                        )}
                    </div>
                    <PayloadDialog
                        connectionId={connectionId}
                        env={env}
                        model={model}
                        providerConfigKey={providerConfigKey}
                        recordId={activeRecordId}
                        onOpenChange={(open) => {
                            if (!open) {
                                setActiveRecordId(null);
                            }
                        }}
                    />
                </>
            )}
        </div>
    );
};

const VirtualizedRecordRows = ({
    records,
    scrollParentRef,
    onOpenPayload
}: {
    records: NangoRecord[];
    scrollParentRef: React.RefObject<HTMLDivElement | null>;
    onOpenPayload: (recordId: string) => void;
}) => {
    const rowVirtualizer = useVirtualizer({
        count: records.length,
        getScrollElement: () => scrollParentRef.current,
        estimateSize: () => RECORD_ROW_HEIGHT_PX,
        overscan: 2
    });

    const cellBase = 'flex items-center px-6 py-2';
    const headerBase = `${cellBase} text-left text-body-small-semi`;
    const col = {
        id: 'min-w-0 flex-1 basis-0',
        action: 'w-36 shrink-0 whitespace-nowrap',
        modified: 'w-56 shrink-0 min-w-0 whitespace-nowrap'
    } as const;

    return (
        <table className="w-full min-w-0 border-collapse text-sm text-text-strong">
            <thead className="sticky top-0 z-10 bg-surface-canvas border-b border-border-muted">
                <tr className="flex w-full">
                    <th className={cn(headerBase, col.id)}>ID</th>
                    <th className={cn(headerBase, col.action)}>Action</th>
                    <th className={cn(headerBase, col.modified)}>Modified</th>
                </tr>
            </thead>
            <tbody className="relative block" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                {rowVirtualizer.getVirtualItems().map((vRow) => {
                    const record = records[vRow.index];
                    return (
                        <tr
                            key={String(record.id)}
                            className={cn(
                                'absolute left-0 flex w-full cursor-pointer border-b border-border-muted hover:bg-state-selected-muted',
                                'transition-colors'
                            )}
                            style={{
                                height: RECORD_ROW_HEIGHT_PX,
                                transform: `translateY(${vRow.start}px)`
                            }}
                            onClick={() => onOpenPayload(String(record.id))}
                        >
                            <td className={cn(cellBase, col.id, 'truncate text-body-small-regular')}>{String(record.id)}</td>
                            <td className={cn(cellBase, col.action)}>
                                <RecordActionBadge action={record._nango_metadata.last_action} />
                            </td>
                            <td className={cn(cellBase, col.modified, 'text-body-small-regular text-text-secondary')}>
                                {formatDateToUSFormat(record._nango_metadata.last_modified_at)}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};

const PayloadDialog = ({
    model,
    recordId,
    connectionId,
    env,
    providerConfigKey,
    onOpenChange
}: {
    model: ConnectionRecordModel;
    recordId: string | null;
    connectionId: string;
    env: string;
    providerConfigKey: string;
    onOpenChange: (open: boolean) => void;
}) => {
    const {
        data: fullRecord,
        isLoading,
        isError,
        error,
        isFetching
    } = useConnectionRecordPayload(
        {
            env,
            provider_config_key: providerConfigKey,
            model: model.model,
            variant: model.variant || undefined,
            record_id: recordId || ''
        },
        { connectionId },
        { enabled: Boolean(recordId) }
    );

    const payloadJson = fullRecord && JSON.stringify(Object.fromEntries(Object.entries(fullRecord).filter(([k]) => k !== '_nango_metadata')), null, 2);

    return (
        <Dialog open={Boolean(recordId)} onOpenChange={onOpenChange}>
            <DialogContent className="min-w-0 gap-6 sm:max-w-4xl">
                <DialogHeader className="gap-2">
                    <DialogTitle className="break-all">{recordId}</DialogTitle>
                    <DialogDescription>{formatModelLabel(model)} payload</DialogDescription>
                </DialogHeader>
                <div className="min-w-0 w-full">
                    {(isLoading || isFetching) && <Skeleton className="h-48 w-full" />}
                    {isError && (
                        <CriticalErrorAlert
                            message={
                                error instanceof APIError && error.json?.error && typeof error.json.error === 'object' && 'message' in error.json.error
                                    ? String((error.json.error as { message?: string }).message)
                                    : 'Failed to load payload'
                            }
                        />
                    )}
                    {!isLoading && !isFetching && !isError && payloadJson && (
                        <CodeBlock className="min-w-0 max-w-full" code={payloadJson} language="json" title="Payload" />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

function getModelKey(model: ConnectionRecordModel) {
    return `${model.model}::${model.variant || 'base'}`;
}

function formatModelLabel(model: ConnectionRecordModel) {
    if (!model.variant) {
        return model.model;
    }

    return `${model.model} (${model.variant})`;
}

function formatCount(count: number) {
    return count.toLocaleString('en-US');
}

function formatCountCompact(count: number) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(count).toLowerCase();
}

function RecordActionBadge({ action }: { action: string }) {
    switch (action.toUpperCase()) {
        case 'ADDED':
            return <Badge variant="green">Added</Badge>;
        case 'UPDATED':
            return <Badge variant="yellow">Updated</Badge>;
        case 'DELETED':
            return <Badge variant="gray">Deleted</Badge>;
        default:
            return <Badge variant="gray">{action}</Badge>;
    }
}
