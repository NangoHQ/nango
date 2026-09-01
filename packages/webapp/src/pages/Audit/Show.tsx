import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';

import { permissions } from '@nangohq/authz';
import { Button } from '@nangohq/design-system';

import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip';
import { FilterMultiSelect } from '@/components/patterns/FilterMultiSelect';
import { PeriodSelector } from '@/components/patterns/PeriodSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tag } from '@/components/ui/Tag';
import { useApiGetAuditTrail } from '@/hooks/useAudit';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions';
import { useUser } from '@/hooks/useUser';
import DashboardLayout from '@/layout/DashboardLayout';
import { last14dPreset, logsPresets } from '@/utils/logs';
import { formatDateToLogFormat } from '@/utils/utils';
import { AuditEventDrawer } from './components/AuditEventDrawer';
import { AuditExportDialog } from './components/AuditExportDialog';
import {
    actionLabel,
    actionOptionsFor,
    actorLabel,
    ALL,
    environmentLabel,
    resourceLabel,
    resourceOptions,
    scopeLabel,
    targetsLabel,
    viaLabel
} from './constants';

import type { ActionFilter, ResourceFilter } from './constants';
import type { Period } from '@/utils/dates';
import type { ApiAuditTrailEvent, AuditAction, AuditOutcome, AuditResource } from '@nangohq/types';

const outcomeVariant: Record<AuditOutcome, React.ComponentProps<typeof Tag>['variant']> = {
    success: 'success',
    failure: 'alert',
    denied: 'warning'
};

export const AuditShow: React.FC = () => {
    const { data: metaData } = useMeta();
    const meta = metaData?.data;
    const { user } = useUser();
    const { can } = usePermissions();
    const canReadAuditTrail = can(permissions.canReadAuditTrail);
    const [period, setPeriod] = useState<Period | null>(() => last14dPreset.toPeriod());
    const [resources, setResources] = useState<ResourceFilter[]>([ALL]);
    const [actions, setActions] = useState<ActionFilter[]>([ALL]);
    const [selected, setSelected] = useState<ApiAuditTrailEvent | null>(null);

    const from = period?.from ? period.from.toISOString() : undefined;
    const to = period?.to ? period.to.toISOString() : undefined;

    // Actions are matched as `resource.action` pairs, so they're only offered once the resource half is unambiguous.
    const singleResource: AuditResource | null = resources.length === 1 && resources[0] !== ALL ? resources[0] : null;
    const onResourcesChange = (next: ResourceFilter[]) => {
        setResources(next);
        setActions([ALL]);
    };

    const resourceFilter = useMemo(() => resources.filter((resource): resource is AuditResource => resource !== ALL), [resources]);
    const actionFilter = useMemo(() => (singleResource ? actions.filter((action): action is AuditAction => action !== ALL) : []), [actions, singleResource]);

    // Only read audit data once the flag and the caller's permission are confirmed; stays idle otherwise.
    const { data, isLoading, isError, refetch, isFetchingNextPage, hasNextPage, fetchNextPage } = useApiGetAuditTrail(
        { from, to, resources: resourceFilter, actions: actionFilter },
        { enabled: meta?.auditTrail === true && canReadAuditTrail }
    );
    const events = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);
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

    return (
        <DashboardLayout fullWidth title="Audit trail">
            <Helmet>
                <title>Audit trail - Nango</title>
            </Helmet>

            <div className="flex flex-col gap-3">
                <div className="flex gap-2 justify-between">
                    {/* Left side is reserved for search + filters (status, actor, …) added later. */}
                    <div className="flex-1 min-w-0" />
                    <div className="flex gap-2">
                        <FilterMultiSelect label="Resource" options={resourceOptions} selected={resources} defaultSelect={[ALL]} onChange={onResourcesChange} />
                        <ConditionalTooltip condition={!singleResource} content="Select a single resource to filter by action" asChild>
                            <span>
                                <FilterMultiSelect
                                    label="Action"
                                    options={singleResource ? actionOptionsFor(singleResource) : []}
                                    selected={actions}
                                    defaultSelect={[ALL]}
                                    onChange={setActions}
                                    disabled={!singleResource}
                                />
                            </span>
                        </ConditionalTooltip>
                        <PeriodSelector
                            isLive={false}
                            period={period}
                            onChange={(next) => setPeriod(next)}
                            presets={logsPresets}
                            defaultPreset={last14dPreset}
                        />
                        <AuditExportDialog from={from} to={to} resources={resourceFilter} actions={actionFilter} disabled={showLoading || isError} />
                    </div>
                </div>

                {events.length > 0 && (
                    <div className="flex items-center justify-end">
                        <div className="text-text-muted text-body-small-regular">
                            {events.length}
                            {hasNextPage ? '+' : ''} {events.length === 1 && !hasNextPage ? 'event' : 'events'}
                        </div>
                    </div>
                )}

                <table className="w-full text-s text-text-strong">
                    <thead>
                        <tr className="border-b border-border-muted">
                            <th className="px-4 py-2 text-left font-semibold">Time</th>
                            <th className="px-4 py-2 text-left font-semibold">Scope</th>
                            <th className="px-4 py-2 text-left font-semibold">Environment</th>
                            <th className="px-4 py-2 text-left font-semibold">Actor</th>
                            <th className="px-4 py-2 text-left font-semibold">Resource</th>
                            <th className="px-4 py-2 text-left font-semibold">Action</th>
                            <th className="px-4 py-2 text-left font-semibold">Target</th>
                            <th className="px-4 py-2 text-left font-semibold">Outcome</th>
                            <th className="w-8 px-4 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {events.map((event) => {
                            const via = viaLabel(event.via);
                            return (
                                <tr
                                    key={event.id}
                                    onClick={() => setSelected(event)}
                                    className="text-text-muted border-b border-border-muted transition-colors hover:bg-surface-page hover:text-text-strong cursor-pointer"
                                >
                                    <td className="px-4 py-2.5 align-middle">
                                        <div className="font-code text-s">{formatDateToLogFormat(event.occurredAt)}</div>
                                    </td>
                                    <td className="px-4 py-2.5 align-middle">{scopeLabel(event.scope)}</td>
                                    <td className="px-4 py-2.5 align-middle">{environmentLabel(event.environment)}</td>
                                    <td className="px-4 py-2.5 align-middle">
                                        {actorLabel(event.actor)}
                                        {via && <span className="text-text-muted"> via {via}</span>}
                                    </td>
                                    <td className="px-4 py-2.5 align-middle">{resourceLabel(event.resource)}</td>
                                    <td className="px-4 py-2.5 align-middle">{actionLabel(event)}</td>
                                    <td className="px-4 py-2.5 align-middle">{targetsLabel(event.targets)}</td>
                                    <td className="px-4 py-2.5 align-middle">
                                        <Tag variant={outcomeVariant[event.outcome]}>{event.outcome}</Tag>
                                    </td>
                                    <td className="px-4 py-2.5 align-middle text-icon-secondary">
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
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

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
                    <div className="flex justify-center mt-2">
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
