import { Badge } from '@/components-v2/ui/Badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components-v2/ui/Dialog';
import { Skeleton } from '@/components-v2/ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/Table';
import { useIntegrationTimeline } from '@/hooks/useHealth';

export const TimelineModal = ({ integrationId, onClose }: { integrationId: string; onClose: () => void }) => {
    const { data: timeline, isLoading } = useIntegrationTimeline(integrationId);

    return (
        <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Execution Timeline: {integrationId}</DialogTitle>
                </DialogHeader>

                {isLoading && (
                    <div className="flex flex-col gap-1 mt-4">
                        <Skeleton className="h-10 w-full" />
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton className="h-12 w-full" key={i} />
                        ))}
                    </div>
                )}

                {timeline && timeline.length === 0 && <div className="p-8 text-center text-text-secondary">No recent executions found.</div>}

                {timeline && timeline.length > 0 && (
                    <Table className="mt-4">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Time</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead>Error</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {timeline.map((event, index) => (
                                <TableRow key={index}>
                                    <TableCell>{new Date(event.created_at).toLocaleString()}</TableCell>
                                    <TableCell>{event.type}</TableCell>
                                    <TableCell>
                                        <Badge variant={event.status === 'SUCCESS' ? 'green' : event.status === 'FAILURE' ? 'pink' : 'gray'}>
                                            {event.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{event.duration_ms ? `${event.duration_ms} ms` : '-'}</TableCell>
                                    <TableCell className="max-w-xs truncate" title={event.error_message || ''}>
                                        {event.error_type || '-'}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </DialogContent>
        </Dialog>
    );
};
