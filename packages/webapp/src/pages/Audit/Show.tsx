import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';

import { Button } from '@nangohq/design-system';

import { PeriodSelector } from '@/components/patterns/PeriodSelector';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useApiGetAuditTrail } from '@/hooks/useAudit';
import { useMeta } from '@/hooks/useMeta';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { last24hPreset, logsPresets } from '@/utils/logs';

import type { Period } from '@/utils/dates';

export const AuditShow: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: metaData } = useMeta();
    const meta = metaData?.data;
    const [period, setPeriod] = useState<Period | null>(() => last24hPreset.toPeriod());

    const from = period?.from ? period.from.toISOString() : undefined;
    const to = period?.to ? period.to.toISOString() : undefined;

    const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useApiGetAuditTrail(env, { from, to });
    const events = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);

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

            <div key={env} className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl text-text-strong">Audit log</h2>
                    <PeriodSelector isLive={false} period={period} onChange={(next) => setPeriod(next)} presets={logsPresets} defaultPreset={last24hPreset} />
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Actor</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>Target</TableHead>
                            <TableHead>Outcome</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {events.map((event) => (
                            <TableRow key={event.id}>
                                <TableCell>{new Date(event.occurredAt).toLocaleString()}</TableCell>
                                <TableCell>{event.actor.display ?? `${event.actor.type} ${event.actor.id}`}</TableCell>
                                <TableCell>{`${event.resource} ${event.action.replace(/_/g, ' ')}`}</TableCell>
                                <TableCell>{event.targets.map((target) => target.display ?? `${target.type}:${target.id}`).join(', ') || '—'}</TableCell>
                                <TableCell>{event.outcome}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                {isLoading && (
                    <div className="flex flex-col gap-2">
                        <Skeleton className="w-full" />
                        <Skeleton className="w-full" />
                        <Skeleton className="w-full" />
                    </div>
                )}

                {!isLoading && events.length === 0 && (
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
        </DashboardLayout>
    );
};
