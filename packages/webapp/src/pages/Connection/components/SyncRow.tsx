import { useMemo, useState } from 'react';
import * as Table from '../../../components/ui/Table';
import { Tag } from '../../../components/ui/label/Tag';
import { Link } from 'react-router-dom';
import { EllipsisHorizontalIcon, QueueListIcon } from '@heroicons/react/24/outline';
import { formatFrequency, getRunTime, parseLatestSyncResult, formatDateToUSFormat, interpretNextRun, formatQuantity } from '../../../utils/utils';
import { getLogsUrl } from '../../../utils/logs';
import { UserFacingSyncCommand } from '../../../types';
import type { RunSyncCommand, SyncResponse } from '../../../types';
import { useStore } from '../../../store';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '../../../components/ui/Dialog';
import type { ApiConnectionFull } from '@nangohq/types';
import { Button, ButtonLink } from '../../../components/ui/button/Button';
import { Popover, PopoverTrigger } from '../../../components/ui/Popover';
import { PopoverContent } from '@radix-ui/react-popover';
import { SimpleTooltip } from '../../../components/SimpleTooltip';
import { IconClockPause, IconClockPlay, IconRefresh, IconX } from '@tabler/icons-react';
import { useToast } from '../../../hooks/useToast';
import { mutate } from 'swr';
import { Select, SelectItem, SelectContent, SelectTrigger, SelectValue } from '../../../components/ui/Select';
import { Checkbox } from '../../../components/ui/Checkbox';
import { apiRunSyncCommand } from '../../../hooks/useSyncs';

export const SyncRow: React.FC<{ sync: SyncResponse; connection: ApiConnectionFull; provider: string | null }> = ({ sync, connection, provider }) => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);

    const [syncCommandButtonsDisabled, setSyncCommandButtonsDisabled] = useState(false);

    const [showPauseStartLoader, setShowPauseStartLoader] = useState(false);
    const [showInterruptLoader, setShowInterruptLoader] = useState(false);
    const [triggerMode, setTriggerMode] = useState<'incremental' | 'full'>(sync.sync_type?.toLocaleLowerCase() === 'full' ? 'full' : 'incremental');
    const [deleteRecords, setDeleteRecords] = useState(false);
    const [modalSpinner, setModalShowSpinner] = useState(false);
    const [openConfirm, setOpenConfirm] = useState(false);

    const confirmTrigger = async () => {
        if (!sync || !provider) {
            return;
        }

        setSyncCommandButtonsDisabled(true);
        setModalShowSpinner(true);
        const res =
            triggerMode === 'incremental'
                ? await apiRunSyncCommand(env, {
                      command: 'RUN',
                      schedule_id: sync.schedule_id,
                      nango_connection_id: sync.nango_connection_id,
                      sync_id: sync.id,
                      sync_name: sync.name,
                      provider
                  })
                : await apiRunSyncCommand(env, {
                      command: 'RUN_FULL',
                      schedule_id: sync.schedule_id,
                      nango_connection_id: sync.nango_connection_id,
                      sync_id: sync.id,
                      sync_name: sync.name,
                      provider,
                      delete_records: deleteRecords
                  });

        if (res.res.status === 200) {
            await mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/sync`));
            toast({ title: `The full resync was successfully triggered`, variant: 'success' });
        } else {
            const data = res.json;
            toast({ title: data.error.message, variant: 'error' });
        }

        setModalShowSpinner(false);
        setSyncCommandButtonsDisabled(false);
        setOpenConfirm(false);
    };

    const logUrl = useMemo(() => {
        return getLogsUrl({
            env,
            integrations: connection.provider_config_key,
            connections: connection?.connection_id,
            syncs: sync.name,
            day: sync.latest_sync?.updated_at ? new Date(sync.latest_sync.updated_at) : null
        });
    }, [env, sync.name]);

    const resetLoaders = () => {
        setShowPauseStartLoader(false);
        setShowInterruptLoader(false);
    };

    const syncCommand = async (command: RunSyncCommand, nango_connection_id: number, scheduleId: string, syncId: string, syncName: string) => {
        if (syncCommandButtonsDisabled || !provider) {
            return;
        }

        setSyncCommandButtonsDisabled(true);
        const res = await apiRunSyncCommand(env, { command, schedule_id: scheduleId, nango_connection_id, sync_id: syncId, sync_name: syncName, provider });

        if (res.res.status === 200) {
            await mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/sync`));
            const niceCommand = UserFacingSyncCommand[command];
            toast({ title: `The sync was successfully ${niceCommand}`, variant: 'success' });
        } else {
            const data = res.json;
            toast({ title: data.error.message, variant: 'error' });
        }

        setSyncCommandButtonsDisabled(false);
        resetLoaders();
    };

    return (
        <Table.Row className="text-white">
            <Table.Cell bordered>
                <div className="w-36 max-w-3xl truncate">{sync.name}</div>
            </Table.Cell>
            <Table.Cell bordered>
                <div className="w-36 max-w-3xl truncate">{Array.isArray(sync.models) ? sync.models.join(', ') : sync.models}</div>
            </Table.Cell>
            <Table.Cell bordered>
                {sync.latest_sync && (
                    <SimpleTooltip tooltipContent={getRunTime(sync.latest_sync?.created_at, sync.latest_sync?.updated_at)}>
                        <Link to={logUrl}>
                            {sync.latest_sync.status === 'PAUSED' && <Tag variant={'warning'}>Paused</Tag>}
                            {sync.latest_sync.status === 'STOPPED' && <Tag variant={'alert'}>Failed</Tag>}
                            {sync.latest_sync.status === 'RUNNING' && <Tag variant={'info'}>Syncing</Tag>}
                            {sync.latest_sync.status === 'SUCCESS' && <Tag variant={'success'}>Success</Tag>}
                        </Link>
                    </SimpleTooltip>
                )}
                {!sync.latest_sync && <Tag variant={'gray'}>NEVER RUN</Tag>}
            </Table.Cell>
            <Table.Cell bordered>{formatFrequency(sync.frequency)}</Table.Cell>
            <Table.Cell bordered>
                <SimpleTooltip tooltipContent={JSON.stringify(sync.record_count, null, 2)}>
                    {formatQuantity(Object.entries(sync.record_count).reduce((acc, [, count]) => acc + count, 0))}
                </SimpleTooltip>
            </Table.Cell>
            <Table.Cell bordered>
                <SimpleTooltip
                    tooltipContent={
                        sync.latest_sync?.result && Object.keys(sync.latest_sync?.result).length > 0 ? (
                            <pre className="text-left">{parseLatestSyncResult(sync.latest_sync?.result, sync.latest_sync?.models)}</pre>
                        ) : undefined
                    }
                >
                    <Link to={logUrl}>{formatDateToUSFormat(sync.latest_sync?.updated_at)}</Link>
                </SimpleTooltip>
            </Table.Cell>
            <Table.Cell bordered>
                {sync.schedule_status === 'STARTED' && (
                    <>
                        {interpretNextRun(sync.futureActionTimes) === '-' ? (
                            <span className="">-</span>
                        ) : (
                            <span className="">{interpretNextRun(sync.futureActionTimes, sync.latest_sync?.updated_at)[0]}</span>
                        )}
                    </>
                )}

                {sync.schedule_status === 'PAUSED' && <Tag variant="warning">Schedule Paused</Tag>}
            </Table.Cell>
            <Table.Cell bordered>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="zombie">
                            <EllipsisHorizontalIcon className="flex h-5 w-5 cursor-pointer" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="z-10">
                        <div className="bg-grayscale-800 rounded">
                            <div className="flex flex-col w-[240px] p-[10px]">
                                <Button
                                    variant="popoverItem"
                                    disabled={syncCommandButtonsDisabled}
                                    onClick={async () => {
                                        setShowPauseStartLoader(true);
                                        await syncCommand(
                                            sync.schedule_status === 'STARTED' ? 'PAUSE' : 'UNPAUSE',
                                            sync.nango_connection_id,
                                            sync.schedule_id,
                                            sync.id,
                                            sync.name
                                        );
                                    }}
                                    isLoading={showPauseStartLoader}
                                >
                                    {sync.schedule_status !== 'STARTED' ? (
                                        <>
                                            <IconClockPlay className="flex h-4 w-4" />
                                            <span className="pl-2">Resume Schedule</span>
                                        </>
                                    ) : (
                                        <>
                                            <IconClockPause className="flex h-4 w-4" />
                                            <span className="pl-2 ">Pause Schedule</span>
                                        </>
                                    )}
                                </Button>
                                {sync.status === 'RUNNING' && (
                                    <Button
                                        variant="popoverItem"
                                        disabled={syncCommandButtonsDisabled}
                                        onClick={() => {
                                            setShowInterruptLoader(true);
                                            void syncCommand('CANCEL', sync.nango_connection_id, sync.schedule_id, sync.id, sync.name);
                                        }}
                                        isLoading={showInterruptLoader}
                                    >
                                        <IconX className="flex h-4 w-4" />
                                        <span className="pl-2">Cancel Execution</span>
                                    </Button>
                                )}

                                {sync.status !== 'RUNNING' && (
                                    <Dialog open={openConfirm} onOpenChange={setOpenConfirm}>
                                        <DialogTrigger asChild>
                                            <Button variant="popoverItem" disabled={syncCommandButtonsDisabled} isLoading={modalSpinner}>
                                                <IconRefresh className="flex h-4 w-4" />
                                                <div className="pl-2 flex gap-2 items-center">Trigger Execution</div>
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="h-[368px]">
                                            <div className="flex flex-col gap-8">
                                                <DialogTitle>Trigger sync execution</DialogTitle>
                                                <div className="flex flex-col gap-7">
                                                    <div className="flex flex-col gap-4">
                                                        <div className="flex gap-4 items-center">
                                                            <label className="text-grayscale-100 text-sm">Sync mode</label>
                                                            <Select defaultValue={triggerMode} onValueChange={(value) => setTriggerMode(value as any)}>
                                                                <SelectTrigger className="w-[200px] h-8">
                                                                    <SelectValue placeholder="Sync mode" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="incremental" disabled={sync.sync_type === 'full'}>
                                                                        Incremental {sync.sync_type === 'full' && <Tag>Not supported by this sync</Tag>}
                                                                    </SelectItem>
                                                                    <SelectItem value="full">Full Refresh</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <DialogDescription>
                                                            {triggerMode === 'incremental' ? (
                                                                <>
                                                                    Incremental sync mode will fetch the data modified since the last execution.{' '}
                                                                    <Link
                                                                        to="https://docs.nango.dev/guides/syncs/large-datasets#incremental-syncing"
                                                                        className="underline"
                                                                    >
                                                                        Learn more
                                                                    </Link>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    Full refresh sync mode will fetch all the data.{' '}
                                                                    <Link
                                                                        to="https://docs.nango.dev/guides/syncs/large-datasets#full-refresh-syncing-small-datasets-only"
                                                                        className="underline"
                                                                    >
                                                                        Learn more
                                                                    </Link>{' '}
                                                                </>
                                                            )}
                                                        </DialogDescription>
                                                    </div>
                                                    {triggerMode === 'full' && (
                                                        <div className="flex flex-col gap-4">
                                                            <div className="flex gap-4 items-center">
                                                                <label className="text-grayscale-100 text-sm" htmlFor="emptycache">
                                                                    Empty cache
                                                                </label>
                                                                <Checkbox
                                                                    id="emptycache"
                                                                    checked={deleteRecords}
                                                                    onCheckedChange={(e) => setDeleteRecords(e === true)}
                                                                />
                                                            </div>
                                                            <DialogDescription>
                                                                All records will be considered new. Cursors will be invalidated. Your backend should reprocess
                                                                all records.
                                                            </DialogDescription>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <DialogFooter>
                                                <DialogClose asChild>
                                                    <Button variant="secondary">Cancel</Button>
                                                </DialogClose>
                                                <Button type="submit" disabled={modalSpinner} onClick={confirmTrigger} isLoading={modalSpinner}>
                                                    Confirm
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                )}

                                <ButtonLink to={logUrl} className="w-full" variant="popoverItem">
                                    <QueueListIcon className="flex h-4 w-4 cursor-pointer" />
                                    <div className="pl-2 flex gap-2 items-center">View Logs</div>
                                </ButtonLink>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </Table.Cell>
        </Table.Row>
    );
};
