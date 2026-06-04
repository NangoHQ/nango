import { useState } from 'react';
import { Helmet } from 'react-helmet';

import { TimelineModal } from './components/TimelineModal';
import { ErrorPageComponent } from '@/components/patterns/ErrorComponent';
import { IntegrationLogo } from '@/components-v2/patterns/IntegrationLogo';
import { Badge } from '@/components-v2/ui/Badge';
import { Skeleton } from '@/components-v2/ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/Table';
import { useIntegrationHealth } from '@/hooks/useHealth';
import DashboardLayout from '@/layout/DashboardLayout';

export const IntegrationHealth = () => {
    const { data: metrics, error, isLoading } = useIntegrationHealth();
    const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);

    if (error) {
        return <ErrorPageComponent title="Integration Health" error={error?.message || 'Failed to load health metrics'} />;
    }

    return (
        <DashboardLayout fullWidth className="flex flex-col gap-8">
            <Helmet>
                <title>Integration Health - Nango</title>
            </Helmet>
            <header className="flex justify-between items-center">
                <h2 className="text-text-primary text-title-subsection">Integration Health</h2>
            </header>

            {isLoading && (
                <div className="flex flex-col gap-1">
                    <Skeleton className="h-10 w-full" />
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton className="h-13 w-full" key={index} />
                    ))}
                </div>
            )}

            {metrics && metrics.length === 0 && (
                <div className="flex flex-col gap-5 p-20 items-center justify-center bg-bg-elevated rounded">
                    <h3 className="text-title-body text-text-primary">No health metrics available</h3>
                    <p className="text-text-secondary text-body-medium-regular">Check back after some syncs or actions have run.</p>
                </div>
            )}

            {metrics && metrics.length > 0 && (
                <Table>
                    <TableHeader className="h-11">
                        <TableRow>
                            <TableHead>Integration</TableHead>
                            <TableHead>Connection ID</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Success (24h)</TableHead>
                            <TableHead>Failure (24h)</TableHead>
                            <TableHead>Avg Runtime</TableHead>
                            <TableHead>Last Success</TableHead>
                            <TableHead>Top Error</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {metrics.map((metric) => (
                            <TableRow
                                key={`${metric.integration_id}-${metric.connection_id}`}
                                className="h-14 cursor-pointer"
                                onClick={() => setSelectedIntegration(metric.integration_id)}
                            >
                                <TableCell className="text-text-primary text-body-small-semi">
                                    <div className="flex gap-1.5 items-center">
                                        <IntegrationLogo provider={metric.provider} />
                                        {metric.integration_id}
                                    </div>
                                </TableCell>
                                <TableCell className="text-text-secondary text-body-small-regular">{metric.connection_id}</TableCell>
                                <TableCell>
                                    <Badge variant={metric.status === 'HEALTHY' ? 'green' : metric.status === 'DEGRADED' ? 'yellow' : 'pink'}>
                                        {metric.status}
                                    </Badge>
                                </TableCell>
                                <TableCell>{metric.success_count_24h}</TableCell>
                                <TableCell>{metric.failure_count_24h}</TableCell>
                                <TableCell>{metric.avg_runtime_ms ? `${Math.round(metric.avg_runtime_ms)} ms` : '-'}</TableCell>
                                <TableCell>{metric.last_success_at ? new Date(metric.last_success_at).toLocaleString() : '-'}</TableCell>
                                <TableCell>{metric.top_error_type || '-'}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            {selectedIntegration && <TimelineModal integrationId={selectedIntegration} onClose={() => setSelectedIntegration(null)} />}
        </DashboardLayout>
    );
};
