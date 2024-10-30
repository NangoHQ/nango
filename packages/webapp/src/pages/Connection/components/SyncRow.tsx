import { useMemo, useState } from 'react';

import { toast } from 'react-toastify';
import * as Table from '../../../components/ui/Table';
import { Tag } from '../../../components/ui/label/Tag';
import { Link } from 'react-router-dom';
import { EllipsisHorizontalIcon, QueueListIcon } from '@heroicons/react/24/outline';
import { formatFrequency, getRunTime, parseLatestSyncResult, formatDateToUSFormat, interpretNextRun } from '../../../utils/utils';
import { getLogsUrl } from '../../../utils/logs';
import { UserFacingSyncCommand } from '../../../types';
import type { RunSyncCommand, SyncResponse } from '../../../types';
import { useRunSyncAPI } from '../../../utils/api';
import { useStore } from '../../../store';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '../../../components/ui/Dialog';
import type { Connection } from '@nangohq/types';
import Button from '../../../components/ui/button/Button';
import { Popover, PopoverTrigger } from '../../../components/ui/Popover';
import { PopoverContent } from '@radix-ui/react-popover';
import { SimpleTooltip } from '../../../components/SimpleTooltip';
import { IconClockPause, IconClockPlay, IconPlayerPlay, IconRefresh, IconX } from '@tabler/icons-react';

export const SyncRow: React.FC<{ sync: SyncResponse; connection: Connection; provider: string | null; reload: () => void }> = ({
    sync,
    connection,
    provider,
    reload
}) => {
    const env = useStore((state) => state.env);
    const runCommandSyncAPI = useRunSyncAPI(env);

    const [syncCommandButtonsDisabled, setSyncCommandButtonsDisabled] = useState(false);

    const [showPauseStartLoader, setShowPauseStartLoader] = useState(false);
    const [showInterruptLoader, setShowInterruptLoader] = useState(false);
    const [showTriggerIncrementalLoader, setShowTriggerIncrementalLoader] = useState(false);
    const [modalSpinner, setModalShowSpinner] = useState(false);
    const [openConfirm, setOpenConfirm] = useState(false);

    const confirmFullRefresh = async () => {
        if (!sync || syncCommandButtonsDisabled) {
            return;
        }

        setSyncCommandButtonsDisabled(true);
        setModalShowSpinner(true);
        const res = await runCommandSyncAPI('RUN_FULL', sync.schedule_id, sync.nango_connection_id, sync.id, sync.name, provider || '');

        if (res?.status === 200) {
            reload();
            toast.success('The full resync was successfully triggered', { position: toast.POSITION.BOTTOM_CENTER });
        } else {
            const data = await res?.json();
            toast.error(data.error, { position: toast.POSITION.BOTTOM_CENTER });
        }

        setModalShowSpinner(false);
        setSyncCommandButtonsDisabled(false);
        setOpenConfirm(false);
    };

    const logUrl = useMemo(() => {
        return getLogsUrl({
            env,
            connections: connection?.connection_id,
            syncs: sync.name,
            day: sync.latest_sync?.updated_at ? new Date(sync.latest_sync.updated_at) : null
        });
    }, [env, sync.name]);

    const resetLoaders = () => {
        setShowPauseStartLoader(false);
        setShowInterruptLoader(false);
        setShowTriggerIncrementalLoader(false);
    };

    const syncCommand = async (command: RunSyncCommand, nango_connection_id: number, scheduleId: string, syncId: string, syncName: string) => {
        if (syncCommandButtonsDisabled) {
            return;
        }

        setSyncCommandButtonsDisabled(true);
        const res = await runCommandSyncAPI(command, scheduleId, nango_connection_id, syncId, syncName, provider || '');

        if (res?.status === 200) {
            reload();
            const niceCommand = UserFacingSyncCommand[command];
            toast.success(`The sync was successfully ${niceCommand}`, { position: toast.POSITION.BOTTOM_CENTER });
        } else {
            const data = await res?.json();
            toast.error(data.error, { position: toast.POSITION.BOTTOM_CENTER });
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
                            {sync.latest_sync.status === 'PAUSED' && (
                                <Tag bgClassName="bg-yellow-500 bg-opacity-30" textClassName="text-yellow-500">
                                    Paused
                                </Tag>
                            )}
                            {sync.latest_sync.status === 'STOPPED' && (
                                <Tag bgClassName="bg-red-base bg-opacity-30" textClassName="text-red-base">
                                    Failed
                                </Tag>
                            )}
                            {sync.latest_sync.status === 'RUNNING' && (
                                <Tag bgClassName="bg-blue-base bg-opacity-30" textClassName="text-blue-base">
                                    Syncing
                                </Tag>
                            )}
                            {sync.latest_sync.status === 'SUCCESS' && (
                                <Tag bgClassName="bg-green-base bg-opacity-30" textClassName="text-green-base">
                                    Success
                                </Tag>
                            )}
                        </Link>
                    </SimpleTooltip>
                )}
                {!sync.latest_sync && (
                    <Tag bgClassName="bg-gray-500 bg-opacity-30" textClassName="text-gray-500">
                        NEVER RUN
                    </Tag>
                )}
            </Table.Cell>
            <Table.Cell bordered>{formatFrequency(sync.frequency)}</Table.Cell>
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

                {sync.schedule_status === 'PAUSED' && (
                    <Tag bgClassName="bg-yellow-500 bg-opacity-30" textClassName="text-yellow-500">
                        Schedule Paused
                    </Tag>
                )}
            </Table.Cell>
            <Table.Cell bordered>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="zombie">
                            <EllipsisHorizontalIcon className="flex h-5 w-5 cursor-pointer" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="z-10">
                        <div className="bg-active-gray rounded">
                            <div className="flex flex-col w-[340px] p-[10px]">
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
                                    <Button
                                        variant="popoverItem"
                                        disabled={syncCommandButtonsDisabled}
                                        isLoading={showTriggerIncrementalLoader}
                                        onClick={() => {
                                            setShowTriggerIncrementalLoader(true);
                                            void syncCommand('RUN', sync.nango_connection_id, sync.schedule_id, sync.id, sync.name);
                                        }}
                                    >
                                        <IconPlayerPlay className="flex h-4 w-4" />
                                        <div className="pl-2 flex gap-2 items-center">Trigger Execution (Incremental)</div>
                                    </Button>
                                )}

                                {sync.status !== 'RUNNING' && (
                                    <Dialog open={openConfirm} onOpenChange={setOpenConfirm}>
                                        <DialogTrigger asChild>
                                            <Button variant="popoverItem" disabled={syncCommandButtonsDisabled} isLoading={modalSpinner}>
                                                <IconRefresh className="flex h-4 w-4" />
                                                <div className="pl-2 flex gap-2 items-center">Trigger Execution (Full Refresh)</div>
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogTitle>Are you absolutely sure?</DialogTitle>
                                            <DialogDescription>
                                                Triggering a full refresh in Nango will clear all existing records and reset the last sync date used for
                                                incremental syncs. This means every record will be fetched again from the start of your sync window and treated
                                                as new.
                                            </DialogDescription>

                                            <DialogFooter>
                                                <DialogClose asChild>
                                                    <Button className="!text-text-light-gray" variant="zombieGray">
                                                        Cancel
                                                    </Button>
                                                </DialogClose>
                                                <Button type="submit" disabled={modalSpinner} onClick={confirmFullRefresh} isLoading={modalSpinner}>
                                                    Confirm
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                )}

                                <Link to={logUrl} className="w-full">
                                    <Button variant="popoverItem">
                                        <QueueListIcon className="flex h-4 w-4 cursor-pointer" />
                                        <div className="pl-2 flex gap-2 items-center">View Logs</div>
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </Table.Cell>
        </Table.Row>
    );
};
