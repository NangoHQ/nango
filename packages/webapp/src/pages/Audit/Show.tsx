import { Box, ChevronRight, Zap } from 'lucide-react';
import { parseAsArrayOf, parseAsStringLiteral, parseAsTimestamp, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';

import { Badge, Button } from '@nangohq/design-system';

import { FilterMultiSelect } from '@/components/patterns/FilterMultiSelect';
import { PeriodSelector } from '@/components/patterns/PeriodSelector';
import { Separator } from '@/components/ui/Separator';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useApiGetAuditTrail } from '@/hooks/useAudit';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions';
import { useUser } from '@/hooks/useUser';
import DashboardLayout from '@/layout/DashboardLayout';
import { last14dPreset, logsPresets } from '@/utils/logs';
import { formatDateToLogFormat } from '@/utils/utils';
import { AuditEventDrawer } from './components/AuditEventDrawer';
import { AuditExportDialog } from './components/AuditExportDialog';
import { OutcomeTag } from './components/OutcomeTag';
import {
    actionOptionsForResources,
    actionValues,
    actorLabel,
    ALL,
    eventLabel,
    resourceOptions,
    resourcesOwningActions,
    resourceValues,
    targetsSummary,
    viaLabel
} from './constants';

import type { ActionFilter } from './constants';
import type { Period } from '@/utils/dates';
import type { ApiAuditTrailEvent, AuditAction, AuditResource } from '@nangohq/types';

const parseResources = parseAsArrayOf(parseAsStringLiteral(resourceValues), ',').withDefault([ALL]).withOptions({ history: 'push' });
const parseActions = parseAsArrayOf(parseAsStringLiteral(actionValues), ',').withDefault([ALL]).withOptions({ history: 'push' });
// A preset period has no `to` (see utils/logs), so this is variable-length by design.
const periodToParam = (period: Period | null): Date[] => (!period ? [] : period.to ? [period.from, period.to] : [period.from]);
const parsePeriod = parseAsArrayOf(parseAsTimestamp, ',').withOptions({ history: 'push' }).withDefault(periodToParam(last14dPreset.toPeriod()));

const TargetCell: React.FC<{ targets: ApiAuditTrailEvent['targets'] }> = ({ targets }) => {
    const summary = targetsSummary(targets);
    if (!summary) {
        return <>—</>;
    }
    return (
        <div className="flex items-center gap-2">
            <span className="truncate">{summary.first}</span>
            {summary.rest > 0 && <Badge variant="secondary">+{summary.rest}</Badge>}
        </div>
    );
};

export const AuditShow: React.FC = () => {
    const { data: metaData } = useMeta();
    const meta = metaData?.data;
    const { user } = useUser();
    const { can } = usePermissions();
    const canReadAuditTrail = can('account:audit_trail:read');
    const [resources, setResources] = useQueryState('resources', parseResources);
    const [actions, setActions] = useQueryState('actions', parseActions);
    const [period, setPeriod] = useQueryState('period', parsePeriod);
    const [selected, setSelected] = useState<ApiAuditTrailEvent | null>(null);

    const from = period[0]?.toISOString();
    const to = period[1]?.toISOString();
    const selectorPeriod = useMemo(() => (period[0] ? { from: period[0], to: period[1] } : null), [period]);

    const resourceSelection = useMemo(() => resources.filter((resource): resource is AuditResource => resource !== ALL), [resources]);
    const actionOptions = useMemo(() => actionOptionsForResources(resourceSelection), [resourceSelection]);

    // Reconciled here, not in the change handler: a selection also arrives from the URL, and an action the
    // chosen resources don't declare would be sent as a pair that can never match.
    const offeredActions = useMemo<ActionFilter[]>(() => {
        const offered = new Set(actionOptions.map((option) => option.value));
        const kept = actions.filter((action) => offered.has(action));
        return kept.length ? kept : [ALL];
    }, [actions, actionOptions]);
    const actionSelection = useMemo(() => offeredActions.filter((action): action is AuditAction => action !== ALL), [offeredActions]);

    const resourceFilter = useMemo(
        () => (resourceSelection.length ? resourceSelection : actionSelection.length ? resourcesOwningActions(actionSelection) : []),
        [resourceSelection, actionSelection]
    );

    // Only read audit data once the flag and the caller's permission are confirmed; stays idle otherwise.
    const { data, isLoading, isError, refetch, isFetchingNextPage, hasNextPage, fetchNextPage } = useApiGetAuditTrail(
        { from, to, resources: resourceFilter, actions: actionSelection },
        { enabled: meta?.auditTrail === true && canReadAuditTrail }
    );
    const events = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);

    // The button below stays: it is the keyboard path, and the fallback if the observer never fires.
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const canLoadMore = hasNextPage && !isFetchingNextPage;
    const observeLoadMore = useCallback((node: HTMLDivElement | null) => {
        loadMoreRef.current = node;
    }, []);
    useEffect(() => {
        const node = loadMoreRef.current;
        if (!node || !canLoadMore) {
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                void fetchNextPage();
            }
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, [canLoadMore, fetchNextPage, events.length]);
    // Absent when the count failed, in which case say nothing rather than pass the loaded rows off as the total.
    const total = data?.pages.at(-1)?.total;
    const showLoading = !meta || !user || isLoading;

    // Menu entry + route are gated on the flag and the permission, but guard direct navigation too.
    if (meta && !meta.auditTrail) {
        return (
            <DashboardLayout fullWidth title="Audit trail">
                <Helmet>
                    <title>Audit trail - Nango</title>
                </Helmet>
                <div className="flex gap-2 flex-col border border-border-muted rounded-md items-center text-text-strong text-center p-10 py-20">
                    <h2 className="text-xl text-center">Audit trail not enabled</h2>
                    <div className="text-sm text-text-muted">The audit trail is not enabled for this account.</div>
                </div>
            </DashboardLayout>
        );
    }

    if (user && !canReadAuditTrail) {
        return (
            <DashboardLayout fullWidth title="Audit trail">
                <Helmet>
                    <title>Audit trail - Nango</title>
                </Helmet>
                <div className="flex gap-2 flex-col border border-border-muted rounded-md items-center text-text-strong text-center p-10 py-20">
                    <h2 className="text-xl text-center">Access denied</h2>
                    <div className="text-sm text-text-muted">Your role does not have access to the audit trail.</div>
                </div>
            </DashboardLayout>
        );
    }

    const resultCount = !showLoading && !isError && total && total.value > 0 && (
        <div className="text-text-muted text-body-small-regular font-code">
            {total.value.toLocaleString()}
            {total.relation === 'gte' ? '+' : ''} {total.value === 1 && total.relation === 'eq' ? 'result' : 'results'} found
        </div>
    );

    return (
        <DashboardLayout fullWidth title="Audit trail" titleActions={resultCount}>
            <Helmet>
                <title>Audit trail - Nango</title>
            </Helmet>

            <div className="flex flex-col gap-5">
                <div className="flex gap-4 justify-end">
                    <div className="flex gap-2.5">
                        <FilterMultiSelect
                            label="Resource"
                            icon={<Box size={14} />}
                            options={resourceOptions}
                            selected={resources}
                            defaultSelect={[ALL]}
                            onChange={(next) => void setResources(next)}
                        />
                        <FilterMultiSelect
                            label="Action"
                            icon={<Zap size={14} />}
                            options={actionOptions}
                            selected={offeredActions}
                            defaultSelect={[ALL]}
                            onChange={(next) => void setActions(next)}
                            showSearch
                        />
                        <PeriodSelector
                            isLive={false}
                            period={selectorPeriod}
                            onChange={(next) => void setPeriod(periodToParam(next))}
                            presets={logsPresets}
                            defaultPreset={last14dPreset}
                        />
                    </div>
                    {/* Overrides the primitive's own `h-full`, which resolves to 0 against this auto-height row. */}
                    <Separator orientation="vertical" className="data-[orientation=vertical]:h-7" />
                    <AuditExportDialog
                        query={{ from, to, resources: resourceFilter, actions: actionSelection }}
                        selection={{ resources: resourceSelection, actions: actionSelection }}
                        total={total}
                        disabled={showLoading || isError}
                    />
                </div>

                {events.length > 0 && (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Time</TableHead>
                                <TableHead>Actor</TableHead>
                                <TableHead>Event</TableHead>
                                <TableHead>Target</TableHead>
                                <TableHead>Outcome</TableHead>
                                <TableHead className="w-8">
                                    <span className="sr-only">Details</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {events.map((event) => {
                                const via = viaLabel(event.via);
                                return (
                                    <TableRow key={event.id} onClick={() => setSelected(event)} className="cursor-pointer text-text-muted">
                                        <TableCell className="font-code">{formatDateToLogFormat(event.occurredAt)}</TableCell>
                                        <TableCell>
                                            {actorLabel(event.actor)}
                                            {via && <span className="text-text-muted"> via {via}</span>}
                                        </TableCell>
                                        <TableCell>{eventLabel(event)}</TableCell>
                                        <TableCell className="max-w-md">
                                            <TargetCell targets={event.targets} />
                                        </TableCell>
                                        <TableCell>
                                            <OutcomeTag outcome={event.outcome} />
                                        </TableCell>
                                        <TableCell className="text-icon-secondary">
                                            <button
                                                type="button"
                                                aria-label="View event details"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelected(event);
                                                }}
                                                className="flex items-center rounded hover:text-text-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-default"
                                            >
                                                <ChevronRight size={16} />
                                            </button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}

                {showLoading && (
                    <div className="flex flex-col gap-2">
                        <Skeleton className="w-full" />
                        <Skeleton className="w-full" />
                        <Skeleton className="w-full" />
                    </div>
                )}

                {!showLoading && isError && (
                    <div className="flex gap-2 flex-col border border-border-muted rounded-md items-center text-text-strong text-center p-10 py-20">
                        <div className="text-center">Failed to load audit events</div>
                        <Button variant="outline" onClick={() => void refetch()}>
                            Retry
                        </Button>
                    </div>
                )}

                {!showLoading && !isError && events.length === 0 && (
                    <div className="flex gap-2 flex-col border border-border-muted rounded-md items-center text-text-strong text-center p-10 py-20">
                        <div className="text-center">No audit events found</div>
                    </div>
                )}

                {events.length > 0 && hasNextPage && (
                    <div ref={observeLoadMore} className="flex justify-center mt-2">
                        <Button variant="outline" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                            Load more...
                        </Button>
                    </div>
                )}
            </div>

            {selected && <AuditEventDrawer event={selected} onClose={() => setSelected(null)} />}
        </DashboardLayout>
    );
};
