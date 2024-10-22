import { useMemo, useState } from 'react';

import { toast } from 'react-toastify';
import { Tooltip } from '@geist-ui/core';
import * as Table from '../../../components/ui/Table';
import { Tag } from '../../../components/ui/label/Tag';
import { Link } from 'react-router-dom';
import {
    EllipsisHorizontalIcon,
    PlayCircleIcon,
    PauseCircleIcon,
    QueueListIcon,
    ArrowPathRoundedSquareIcon,
    StopCircleIcon
} from '@heroicons/react/24/outline';
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
import { QuestionMarkCircledIcon } from '@radix-ui/react-icons';

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
        <Table.Row>
            <Table.Cell bordered>
                <div className="w-36 max-w-3xl ml-1 truncate">{sync.name}</div>
            </Table.Cell>
            <Table.Cell bordered>
                <div className="w-36 max-w-3xl truncate">{Array.isArray(sync.models) ? sync.models.join(', ') : sync.models}</div>
            </Table.Cell>
            <Table.Cell bordered>
                <Link to={logUrl} title="See execution logs">
                    {sync.status === 'PAUSED' && (
                        <Tag bgClassName="bg-yellow-500 bg-opacity-30" textClassName="text-yellow-500">
                            Paused
                        </Tag>
                    )}
                    {(sync.status === 'ERROR' || sync.status === 'STOPPED') && (
                        <Tag bgClassName="bg-red-base bg-opacity-30" textClassName="text-red-base">
                            Failed
                        </Tag>
                    )}
                    {sync.status === 'RUNNING' && (
                        <Tag bgClassName="bg-blue-base bg-opacity-30" textClassName="text-blue-base">
                            Syncing
                        </Tag>
                    )}
                    {sync.status === 'SUCCESS' && (
                        <Tag bgClassName="bg-green-base bg-opacity-30" textClassName="text-green-base">
                            Success
                        </Tag>
                    )}
                </Link>
            </Table.Cell>
            <Table.Cell bordered>{formatFrequency(sync.frequency)}</Table.Cell>
            <Table.Cell bordered>{sync.object_count ?? '-'}</Table.Cell>
            <Table.Cell bordered>
                {sync.latest_sync?.result && Object.keys(sync.latest_sync?.result).length > 0 ? (
                    <Tooltip text={<pre>{parseLatestSyncResult(sync.latest_sync?.result, sync.latest_sync?.models)}</pre>} type="dark">
                        <Link to={logUrl} className="block w-32 ml-1">
                            {formatDateToUSFormat(sync.latest_sync?.updated_at)}
                        </Link>
                    </Tooltip>
                ) : (
                    <Link to={logUrl} className="">
                        {formatDateToUSFormat(sync.latest_sync?.updated_at)}
                    </Link>
                )}
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
                {sync.schedule_status === 'STARTED' && !sync.futureActionTimes && <span className="">-</span>}
                {sync.schedule_status !== 'STARTED' && <span className="">-</span>}
            </Table.Cell>
            <Table.Cell bordered>{getRunTime(sync.latest_sync?.created_at, sync.latest_sync?.updated_at)}</Table.Cell>
            <Table.Cell bordered>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant={'zombie'}>
                            <EllipsisHorizontalIcon className="flex h-5 w-5 cursor-pointer" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="z-10">
                        <div className=" bg-black rounded border border-neutral-700">
                            <div className="flex flex-col w-[320px]">
                                <Button
                                    variant="zombie"
                                    className="w-full"
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
                                            <PlayCircleIcon className="flex h-6 w-6" />
                                            <span className="pl-2">Start schedule</span>
                                        </>
                                    ) : (
                                        <>
                                            <PauseCircleIcon className="flex h-6 w-6" />
                                            <span className="pl-2 ">Pause schedule</span>
                                        </>
                                    )}
                                </Button>
                                {sync.status === 'RUNNING' && (
                                    <Button
                                        variant="zombie"
                                        className="w-full"
                                        disabled={syncCommandButtonsDisabled}
                                        onClick={() => {
                                            setShowInterruptLoader(true);
                                            void syncCommand('CANCEL', sync.nango_connection_id, sync.schedule_id, sync.id, sync.name);
                                        }}
                                        isLoading={showInterruptLoader}
                                    >
                                        <StopCircleIcon className="flex h-6 w-6" />
                                        <span className="pl-2">Interrupt execution</span>
                                    </Button>
                                )}
                                {sync.status !== 'RUNNING' && sync.sync_type === 'full' && (
                                    <Button
                                        variant="zombie"
                                        className="w-full"
                                        disabled={syncCommandButtonsDisabled}
                                        isLoading={showTriggerIncrementalLoader}
                                        onClick={() => {
                                            setShowTriggerIncrementalLoader(true);
                                            void syncCommand('RUN', sync.nango_connection_id, sync.schedule_id, sync.id, sync.name);
                                        }}
                                    >
                                        <ArrowPathRoundedSquareIcon className="flex h-6 w-6" />
                                        <div className="pl-2 flex gap-2 items-center">Trigger execution</div>
                                    </Button>
                                )}
                                {sync.status !== 'RUNNING' && sync.sync_type === 'incremental' && (
                                    <Button
                                        variant="zombie"
                                        className="w-full"
                                        disabled={syncCommandButtonsDisabled}
                                        isLoading={showTriggerIncrementalLoader}
                                        onClick={() => {
                                            setShowTriggerIncrementalLoader(true);
                                            void syncCommand('RUN', sync.nango_connection_id, sync.schedule_id, sync.id, sync.name);
                                        }}
                                    >
                                        <ArrowPathRoundedSquareIcon className="flex h-6 w-6" />
                                        <div className="pl-2 flex gap-2 items-center">
                                            Trigger execution (incremental)
                                            <Tooltip
                                                type="dark"
                                                text={
                                                    <div className="flex text-white text-sm">
                                                        Incremental: the existing cache and the last sync date will be preserved, only new/updated data will be
                                                        synced.
                                                    </div>
                                                }
                                            >
                                                {!syncCommandButtonsDisabled && <QuestionMarkCircledIcon />}
                                            </Tooltip>
                                        </div>
                                    </Button>
                                )}

                                {sync.status !== 'RUNNING' && (
                                    <Dialog open={openConfirm} onOpenChange={setOpenConfirm}>
                                        <DialogTrigger asChild>
                                            <Button variant="zombie" className="w-full" disabled={syncCommandButtonsDisabled} isLoading={modalSpinner}>
                                                <ArrowPathRoundedSquareIcon className="flex h-6 w-6" />
                                                <div className="pl-2 flex gap-2 items-center">
                                                    Trigger execution (full refresh)
                                                    <Tooltip
                                                        type="dark"
                                                        text={
                                                            <div className="flex text-white text-sm">
                                                                Full refresh: the existing cache and last sync date will be deleted, all historical data will be
                                                                resynced.
                                                            </div>
                                                        }
                                                    >
                                                        {!syncCommandButtonsDisabled && <QuestionMarkCircledIcon />}
                                                    </Tooltip>
                                                </div>
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
                                    <Button variant="zombie" className="w-full gap-4">
                                        <QueueListIcon className="flex h-6 w-6 text-gray-400 cursor-pointer" />
                                        View Logs
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
