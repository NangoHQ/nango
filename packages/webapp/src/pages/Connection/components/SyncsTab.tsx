import { Ellipsis, Info, List, OctagonPause, Play, RefreshCw, Wrench, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CriticalErrorAlert } from '@/components-v2/CriticalErrorAlert';
import { EmptyCard } from '@/components-v2/EmptyCard';
import { InfoTooltip } from '@/components-v2/InfoTooltip';
import { SimpleCodeBlock } from '@/components-v2/SimpleCodeBlock';
import { Badge } from '@/components-v2/ui/badge';
import { Button, ButtonLink } from '@/components-v2/ui/button';
import { Checkbox } from '@/components-v2/ui/checkbox';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components-v2/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components-v2/ui/dropdown-menu';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components-v2/ui/tooltip';
import { useRunSyncCommand, useSyncs } from '@/hooks/useSyncs';
import { useToast } from '@/hooks/useToast';
import { CatalogBadge } from '@/pages/Integrations/components/CatalogBadge';
import { useStore } from '@/store';
import { UserFacingSyncCommand } from '@/types';
import { getLogsUrl } from '@/utils/logs';
import { formatDateToUSFormat, formatFrequency, formatQuantity, getRunTime, interpretNextRun, truncateMiddle } from '@/utils/utils';

import type { RunSyncCommand, SyncResponse } from '@/types';
import type { ApiConnectionFull, GetConnection, GetIntegration } from '@nangohq/types';

export const SyncsTab = ({
    connectionData,
    integrationData
}: {
    connectionData: GetConnection['Success']['data'];
    integrationData: GetIntegration['Success']['data'];
}) => {
    const env = useStore((state) => state.env);
    const { connection } = connectionData;
    const providerConfigKey = integrationData.integration.unique_key;
    const { data: syncs, isLoading, error } = useSyncs({ env, provider_config_key: providerConfigKey, connection_id: connection.connection_id });

    if (error) {
        return <CriticalErrorAlert message="Failed to load syncs" />;
    }

    if (isLoading) {
        return <Skeleton className="w-full h-42" />;
    }

    if (!syncs || syncs.length === 0) {
        const integrationName = integrationData.integration.display_name || integrationData.template.display_name;
        return (
            <EmptyCard>
                <span className="text-text-primary text-title-body">No models are syncing for {integrationName}.</span>
                <span className="text-text-secondary text-body-medium-regular">Start syncing models for {integrationName} on the Function settings tab.</span>
                <ButtonLink variant="primary" to={`/${env}/integrations/${providerConfigKey}/functions#syncs`}>
                    <Wrench />
                    Function configuration
                </ButtonLink>
            </EmptyCard>
        );
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Sync Name</TableHead>
                    <TableHead>Models</TableHead>
                    <TableHead>Last Execution</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Last Sync Start</TableHead>
                    <TableHead>Next Sync Start</TableHead>
                    <TableHead>{/* Actions */}</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {syncs?.map((sync) => (
                    <SyncRow key={sync.id} sync={sync} connection={connection} provider={providerConfigKey} />
                ))}
            </TableBody>
        </Table>
    );
};

const SyncRow = ({ sync, connection, provider }: { sync: SyncResponse; connection: ApiConnectionFull; provider: string }) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const navigate = useNavigate();

    const [triggerDialogOpen, setTriggerDialogOpen] = useState(false);

    const { mutateAsync: runSyncCommand, isPending: isRunningSyncCommand } = useRunSyncCommand(env);
    const recordCount = sync.record_count ? formatQuantity(Object.entries(sync.record_count).reduce((acc, [, count]) => acc + count, 0)) : '0';

    const [fullResync, setFullResync] = useState(false);
    const [emptyCache, setEmptyCache] = useState(false);

    const onSyncCommand = async (command: RunSyncCommand) => {
        try {
            await runSyncCommand({
                command,
                schedule_id: sync.schedule_id,
                nango_connection_id: sync.nango_connection_id,
                sync_id: sync.id,
                sync_name: sync.name,
                sync_variant: sync.variant,
                provider,
                ...(command === 'RUN_FULL' || command === 'RUN'
                    ? {
                          delete_records: emptyCache
                      }
                    : {})
            });

            const niceCommand = UserFacingSyncCommand[command];
            toast({ title: `The sync was successfully ${niceCommand}`, variant: 'success' });
        } catch (err) {
            const verb = command === 'RUN_FULL' || command === 'RUN' ? 'run' : 'update';
            if (err instanceof Error && 'json' in err) {
                const apiError = err as { json: { error?: { message?: string } } };
                toast({ title: apiError.json.error?.message || `Failed to ${verb} sync`, variant: 'error' });
            } else {
                toast({ title: `Failed to ${verb} sync`, variant: 'error' });
            }
        }
    };

    const onTrigger = async () => {
        await onSyncCommand(fullResync ? 'RUN_FULL' : 'RUN');
        setFullResync(false);
        setEmptyCache(false);
        setTriggerDialogOpen(false);
    };

    const logUrl = useMemo(() => {
        return getLogsUrl({
            env,
            integrations: provider,
            connections: connection?.connection_id,
            syncs: sync.name,
            day: sync.latest_sync?.updated_at ? new Date(sync.latest_sync.updated_at) : null
        });
    }, [connection?.connection_id, env, provider, sync.latest_sync?.updated_at, sync.name]);

    return (
        <>
            <TableRow key={sync.id}>
                {/* Name & Variant */}
                <TableCell>
                    <div className="flex gap-2 items-center">
                        <span className="text-code-body-small-medium text-text-secondary">{sync.name}</span>
                        {sync.variant !== 'base' && (
                            <Tooltip>
                                <TooltipTrigger>
                                    {/* TODO: Replace badge */}
                                    <Badge variant="gray" size="xs" className="-uppercase">
                                        {truncateMiddle(sync.variant)}
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent>{sync.variant}</TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                </TableCell>

                {/* Models */}
                <TableCell className="max-w-38">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="text-body-small-semi text-text-primary truncate block">
                                {Array.isArray(sync.models) ? sync.models.join(', ') : sync.models}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent className="p-2">{Array.isArray(sync.models) ? sync.models.join(', ') : sync.models}</TooltipContent>
                    </Tooltip>
                </TableCell>

                {/* Last Execution */}
                <TableCell>
                    <Tooltip>
                        <TooltipTrigger>
                            <StatusBadge sync={sync} />
                        </TooltipTrigger>
                        {sync.latest_sync && <TooltipContent>{getRunTime(sync.latest_sync?.created_at, sync.latest_sync?.updated_at)}</TooltipContent>}
                    </Tooltip>
                </TableCell>

                {/* Frequency */}
                <TableCell>{formatFrequency(sync.frequency)}</TableCell>

                {/* Records */}
                <TableCell>
                    <Tooltip>
                        <TooltipTrigger>{recordCount}</TooltipTrigger>
                        <TooltipContent className="p-2">
                            <SimpleCodeBlock language={'json'}>{JSON.stringify(sync.record_count, null, 2)}</SimpleCodeBlock>
                        </TooltipContent>
                    </Tooltip>
                </TableCell>

                {/* Last Sync Start */}
                <TableCell>
                    <Tooltip>
                        <TooltipTrigger>{formatDateToUSFormat(sync.latest_sync?.updated_at)}</TooltipTrigger>
                        {sync.latest_sync && (
                            <TooltipContent className="p-2">
                                <SimpleCodeBlock language={'json'}>{JSON.stringify(sync.latest_sync.result, null, 2)}</SimpleCodeBlock>
                            </TooltipContent>
                        )}
                    </Tooltip>
                </TableCell>

                {/* Next Sync Start */}
                <TableCell>
                    {sync.schedule_status === 'STARTED' && (
                        <>
                            {interpretNextRun(sync.futureActionTimes) === '-' ? (
                                <span>-</span>
                            ) : (
                                <span>{interpretNextRun(sync.futureActionTimes, sync.latest_sync?.updated_at)[0]}</span>
                            )}
                        </>
                    )}

                    {sync.schedule_status === 'PAUSED' && <CatalogBadge variant="warning">Schedule Paused</CatalogBadge>}
                </TableCell>

                {/* Actions */}
                <TableCell>
                    <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <Ellipsis />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {/* Pause/Resume Schedule */}
                            <DropdownMenuItem
                                disabled={isRunningSyncCommand}
                                onClick={() => onSyncCommand(sync.schedule_status === 'STARTED' ? 'PAUSE' : 'UNPAUSE')}
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

                            {/* Cancel Execution */}
                            {sync.status === 'RUNNING' && (
                                <DropdownMenuItem disabled={isRunningSyncCommand} onClick={() => onSyncCommand('CANCEL')}>
                                    <X />
                                    <span>Cancel Execution</span>
                                </DropdownMenuItem>
                            )}

                            {/* Trigger Execution */}
                            {sync.status !== 'RUNNING' && (
                                <DropdownMenuItem disabled={isRunningSyncCommand} onClick={() => setTriggerDialogOpen(true)}>
                                    <RefreshCw />
                                    <span>Trigger execution</span>
                                </DropdownMenuItem>
                            )}

                            {/* View Logs */}
                            <DropdownMenuItem onClick={() => navigate(logUrl)}>
                                <List />
                                <span>View logs</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </TableCell>
            </TableRow>

            {/* Trigger Dialog - Controlled because dialogs don't work well inside dropdowns */}
            <Dialog open={triggerDialogOpen} onOpenChange={setTriggerDialogOpen} modal={true}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Trigger sync execution</DialogTitle>
                        <DialogDescription>
                            Trigger a sync execution for function <span className="font-mono text-text-primary">{sync.name}</span> in the current connection.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-8">
                        <div className="inline-flex gap-2 items-center">
                            <Checkbox checked={fullResync} onCheckedChange={(e) => setFullResync(e === true)} />
                            <span className="text-text-primary text-body-medium-medium">Resync entire dataset</span>
                            <InfoTooltip icon={<Info />} side="bottom">
                                The current checkpoint (and the deprecated <span className="font-mono text-text-primary">nango.lastSyncDate</span>) will be set
                                to <span className="font-mono text-text-primary">null</span>. The whole dataset will be resynced.
                            </InfoTooltip>
                        </div>

                        <div className="inline-flex gap-2 items-center">
                            <Checkbox checked={emptyCache} onCheckedChange={(e) => setEmptyCache(e === true)} />
                            <span className="text-text-primary text-body-medium-medium">Empty cache</span>
                            <InfoTooltip icon={<Info />} side="bottom">
                                All records will be reported as new by Nango. Record cursors will be invalidated. Your backend should reprocess all records.
                            </InfoTooltip>
                        </div>
                    </div>

                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="secondary">Cancel</Button>
                        </DialogClose>
                        <Button variant="primary" onClick={onTrigger} loading={isRunningSyncCommand}>
                            Trigger
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

const StatusBadge = ({ sync }: { sync: SyncResponse }) => {
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
