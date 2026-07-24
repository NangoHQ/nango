import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';

import { Button } from '@nangohq/design-system';

import { PeriodSelector } from '@/components/patterns/PeriodSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tag } from '@/components/ui/Tag';
import { useApiGetAuditTrail } from '@/hooks/useAudit';
import { useMeta } from '@/hooks/useMeta';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { last14dPreset, logsPresets } from '@/utils/logs';
import { formatDateToLogFormat } from '@/utils/utils';
import { AuditEventDrawer } from './components/AuditEventDrawer';

import type { Period } from '@/utils/dates';
import type { ApiAuditTrailEvent, AuditOutcome } from '@nangohq/types';

const outcomeVariant: Record<AuditOutcome, React.ComponentProps<typeof Tag>['variant']> = {
    success: 'success',
    failure: 'alert',
    denied: 'warning'
};

export const AuditShow: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: metaData } = useMeta();
    const meta = metaData?.data;
    const [period, setPeriod] = useState<Period | null>(() => last14dPreset.toPeriod());
    const [selected, setSelected] = useState<ApiAuditTrailEvent | null>(null);

    const from = period?.from ? period.from.toISOString() : undefined;
    const to = period?.to ? period.to.toISOString() : undefined;

    // Gate the request on a confirmed flag: don't read audit data while meta is pending or when it's off.
    const { data, isLoading, isError, refetch, isFetchingNextPage, hasNextPage, fetchNextPage } = useApiGetAuditTrail(
        env,
        { from, to },
        { enabled: meta?.auditTrail === true }
    );
    const events = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);
    const showLoading = !meta || isLoading;

    // Defensive: the menu entry + route are gated on the flag, but guard direct navigation too.
    if (meta && !meta.auditTrail) {
        return (
            <DashboardLayout fullWidth title="Audit log">
                <Helmet>
                    <title>Audit log - Nango</title>
                </Helmet>
                <div className="flex gap-2 flex-col border border-border-muted rounded-md items-center text-text-strong text-center p-10 py-20">
                    <h2 className="text-xl text-center">Audit log not enabled</h2>
                    <div className="text-sm text-text-muted">The audit log is not enabled for this account.</div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout fullWidth title="Audit log">
            <Helmet>
                <title>Audit log - Nango</title>
            </Helmet>

            <div key={env} className="flex flex-col gap-3">
                <div className="flex gap-2 justify-between">
                    {/* Left side is reserved for search + filters (status, actor, resource, …) added later. */}
                    <div className="flex-1 min-w-0" />
                    <div className="flex gap-2">
                        <PeriodSelector
                            isLive={false}
                            period={period}
                            onChange={(next) => setPeriod(next)}
                            presets={logsPresets}
                            defaultPreset={last14dPreset}
                        />
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
                            <th className="px-4 py-2 text-left font-semibold">Actor</th>
                            <th className="px-4 py-2 text-left font-semibold">Action</th>
                            <th className="px-4 py-2 text-left font-semibold">Target</th>
                            <th className="px-4 py-2 text-left font-semibold">Outcome</th>
                            <th className="w-8 px-4 py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {events.map((event) => (
                            <tr
                                key={event.id}
                                onClick={() => setSelected(event)}
                                className="text-text-muted border-b border-border-muted transition-colors hover:bg-surface-page hover:text-text-strong cursor-pointer"
                            >
                                <td className="px-4 py-2.5 align-middle">
                                    <div className="font-code text-s">{formatDateToLogFormat(event.occurredAt)}</div>
                                </td>
                                <td className="px-4 py-2.5 align-middle">{event.actor.display ?? `${event.actor.type} ${event.actor.id}`}</td>
                                <td className="px-4 py-2.5 align-middle">{`${event.resource} ${event.action.replace(/_/g, ' ')}`}</td>
                                <td className="px-4 py-2.5 align-middle">
                                    {event.targets.map((target) => target.display ?? `${target.type}:${target.id}`).join(', ') || '—'}
                                </td>
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
                        ))}
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
