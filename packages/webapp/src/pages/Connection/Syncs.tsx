import { useState, useEffect } from 'react';
import { Loading, Tooltip } from '@geist-ui/core';
import { Link } from 'react-router-dom';
import { AdjustmentsHorizontalIcon, EllipsisHorizontalIcon, PlayCircleIcon, PauseCircleIcon, ArrowPathRoundedSquareIcon } from '@heroicons/react/24/outline';
import { SyncResponse, RunSyncCommand } from '../../types';
import {
    calculateTotalRuntime,
    getRunTime,
    parseLatestSyncResult,
    formatDateToUSFormat,
    interpretNextRun,
    getSimpleDate
} from '../../utils/utils';
import { Connection } from '../../types';
import { useRunSyncAPI } from '../../utils/api';

interface SyncsProps {
    syncs: SyncResponse[] | null;
    connection: Connection | null;
    loaded: boolean;
    syncLoaded: boolean;
    setSyncLoaded: (loaded: boolean) => void;
    env: string
}

export default function Syncs(props: SyncsProps) {
    const { syncs, connection, setSyncLoaded, loaded, syncLoaded, env } = props;
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const runCommandSyncAPI = useRunSyncAPI();

    const toggleDropdown = (id: string) => {
        if (openDropdownId === id) {
            setOpenDropdownId(null);
        } else {
            setOpenDropdownId(id);
        }
    };

    useEffect(() => {
        const closeSyncWindow = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest('.interact-with-sync')) {
                setOpenDropdownId(null);
            }
        };

        document.addEventListener('click', closeSyncWindow);

        return () => {
            document.removeEventListener('click', closeSyncWindow);
        };
    }, []);

    const syncCommand = async (command: RunSyncCommand, nango_connection_id: number, scheduleId: string, syncId: string, syncName: string) => {
        const res = await runCommandSyncAPI(command, scheduleId, nango_connection_id, syncId, syncName, connection?.provider);

        if (res?.status === 200) {
            try {
                setSyncLoaded(false);
            } catch (e) {
                console.log(e);
            }
        }
    };

    const ErrorBubble = () => (
        <>
            <p className="inline-block text-pink-600">Failed</p>
        </>
    );
    const errorBubbleStyles = 'inline-flex justify-center items-center rounded py-1 px-2 bg-pink-600 bg-opacity-20';

    const SuccessBubble = () => (
        <>
            <p className="inline-block text-green-500">Done</p>
        </>
    );
    const successBubbleStyles = 'inline-flex justify-center items-center rounded py-1 px-2 bg-green-600 bg-opacity-20';

    const RunningBubble = () => (
        <>
            <p className="inline-block text-blue-400">Syncing</p>
        </>
    );
    const runningBubbleStyles = 'inline-flex justify-center items-center rounded py-1 px-2 bg-blue-400 bg-opacity-20';

    if (!loaded || !syncLoaded || syncs === null) return (
        <Loading spaceRatio={2.5} className="top-24" />
    );

    return (
        <div className="h-fit rounded-md text-white">
            {!syncs || syncs.length === 0 ? (
                <div className="flex flex-col border border-border-gray rounded-md items-center text-white text-center p-10 py-20">
                    <h2 className="text-xl text-center w-full">No models are syncing for <span className="capitalize">{connection?.provider}</span></h2>
                    <div className="mt-4 text-gray-400">Start syncing models for <span className="capitalize">{connection?.provider}</span> on the Sync Configuration tab.</div>
                    <Link to={`/${env}/integration/${connection?.providerConfigKey}#scripts`} className="flex justify-center w-auto items-center mt-5 px-4 h-10 rounded-md text-sm text-black bg-white hover:bg-gray-300">
                        <span className="flex">
                        <AdjustmentsHorizontalIcon className="flex h-5 w-5 mr-3" />
                        Script Configuration
                        </span>
                    </Link>
                </div>
            ) : (
                <table className="w-[976px]">
                    <tbody className="flex flex-col space-y-2">
                        <tr>
                            <td className="flex items-center px-3 justify-between text-xs px-2 py-2 bg-active-gray border border-neutral-800 rounded-md">
                                <div className="w-48">Models</div>
                                <div className="w-16">Status</div>
                                <div className="w-8">Frequency</div>
                                <div className="w-24">Last Sync Start</div>
                                <div className="w-24">Next Sync Start</div>
                                <div className="w-16">Last Run</div>
                                <div className="w-16">30d Runs</div>
                                <div className=""></div>
                            </td>
                        </tr>
                        <tr>
                            {syncs.map((sync) => (
                                <td
                                    key={sync.name}
                                    className="flex items-center px-2 py-3 text-[13px] cursor-pointer justify-between border-b border-border-gray"
                                >
                                    <div className="flex items-center w-52">
                                        <div className="w-36 max-w-3xl truncate">{Array.isArray(sync.models) ? sync.models.join(', ') : sync.models}</div>
                                    </div>
                                    <div className="flex w-20 -ml-2">
                                        <span className="">
                                            {sync.schedule_status === 'PAUSED' && sync.latest_sync?.status !== 'RUNNING' && (
                                                <div className="inline-flex justify-center items-center rounded py-1 px-2 bg-yellow-500 bg-opacity-20">
                                                    <p className="inline-block text-yellow-500">Paused</p>
                                                </div>
                                            )}
                                            {sync?.schedule_status === 'RUNNING' && sync?.latest_sync === null && (
                                                <div className={errorBubbleStyles}>
                                                    <ErrorBubble />
                                                </div>
                                            )}
                                            {sync?.latest_sync?.status === 'STOPPED' &&
                                                sync.schedule_status !== 'PAUSED' &&
                                                (sync.latest_sync.activity_log_id && sync.latest_sync.activity_log_id !== null ? (
                                                    <Link
                                                        to={`/${env}/activity?activity_log_id=${sync.latest_sync?.activity_log_id}&connection=${connection?.connectionId}&script=${sync.name}&date=${getSimpleDate(sync.latest_sync?.updated_at)}`}
                                                        className={errorBubbleStyles}
                                                    >
                                                        <ErrorBubble />
                                                    </Link>
                                            ) : (
                                                <div className={errorBubbleStyles}>
                                                    <ErrorBubble />
                                                </div>
                                            ))}
                                            {sync.latest_sync?.status === 'RUNNING' &&
                                                (sync.latest_sync.activity_log_id && sync.latest_sync?.activity_log_id !== null ? (
                                                    <Link
                                                        to={`/${env}/activity?activity_log_id=${sync.latest_sync?.activity_log_id}&connection=${connection?.connectionId}&script=${sync.name}&date=${getSimpleDate(sync.latest_sync?.updated_at)}`}
                                                        className={runningBubbleStyles}
                                                    >
                                                        <RunningBubble />
                                                    </Link>
                                            ) : (
                                                <div className={runningBubbleStyles}>
                                                    <RunningBubble />
                                                </div>
                                            ))}
                                            {sync.latest_sync?.status === 'SUCCESS' &&
                                                sync.schedule_status !== 'PAUSED' &&
                                                (sync.latest_sync?.activity_log_id !== null ? (
                                                    <Link
                                                        to={`/${env}/activity?activity_log_id=${sync.latest_sync?.activity_log_id}&connection=${connection?.connectionId}&script=${sync.name}&date=${getSimpleDate(sync.latest_sync?.updated_at)}`}
                                                        className={successBubbleStyles}
                                                    >
                                                        <SuccessBubble />
                                                    </Link>
                                            ) : (
                                                <div className={successBubbleStyles}>
                                                    <SuccessBubble />
                                                </div>
                                            ))}
                                        </span>
                                    </div>
                                    <div className="flex items-center w-10">{sync.frequency}</div>
                                    <div className="flex items-center w-28">
                                        {sync.latest_sync?.result && Object.keys(sync.latest_sync?.result).length > 0 ? (
                                            <Tooltip text={<pre>{parseLatestSyncResult(sync.latest_sync.result, sync.latest_sync.models)}</pre>} type="dark">
                                                {sync.latest_sync?.activity_log_id !== null ? (
                                                    <Link
                                                        to={`/${env}/activity?activity_log_id=${sync.latest_sync?.activity_log_id}&connection=${connection?.connectionId}&script=${sync.name}&date=${getSimpleDate(sync.latest_sync?.updated_at)}`}
                                                        className="block w-32 ml-1"
                                                    >
                                                        {formatDateToUSFormat(sync.latest_sync?.updated_at)}
                                                    </Link>
                                                ) : (
                                                    <span className="">{formatDateToUSFormat(sync.latest_sync?.updated_at)}</span>
                                                )}
                                            </Tooltip>
                                        ): (
                                            <>
                                                {sync.latest_sync?.activity_log_id? (
                                                    <Link
                                                        to={`/${env}/activity?activity_log_id=${sync.latest_sync?.activity_log_id}&connection=${connection?.connectionId}&script=${sync.name}&date=${getSimpleDate(sync.latest_sync?.updated_at)}`}
                                                        className=""
                                                    >
                                                        {formatDateToUSFormat(sync.latest_sync?.updated_at)}
                                                    </Link>
                                                ) : (
                                                    <span className="">{formatDateToUSFormat(sync.latest_sync?.updated_at)}</span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    <div className="flex items-center w-28">
                                        {sync.schedule_status === 'RUNNING' && (
                                            <>
                                                {interpretNextRun(sync.futureActionTimes) === '-' ? (
                                                    <span className="">-</span>
                                                ) : (
                                                    <span className="">{interpretNextRun(sync.futureActionTimes, sync.latest_sync?.updated_at)[0]}</span>
                                                )}
                                            </>
                                        )}
                                        {sync.schedule_status === 'RUNNING' && !sync.futureActionTimes && (
                                            <span className="">-</span>
                                        )}
                                        {sync.schedule_status !== 'RUNNING' && (
                                            <span className="">-</span>
                                        )}
                                    </div>
                                    <div className="w-12">
                                        {getRunTime(sync.latest_sync?.created_at, sync.latest_sync?.updated_at)}
                                    </div>
                                    <div className="w-16 ml-4">
                                        {sync.thirty_day_timestamps ? (
                                                <span className="w-24 ml-[0.25rem]">
                                                    {calculateTotalRuntime(sync.thirty_day_timestamps)}
                                                </span>
                                            ) : (
                                                <span className="ml-[0.25rem]">-</span>
                                            )
                                        }
                                    </div>
                                    <div className="relative interact-with-sync">
                                        <EllipsisHorizontalIcon className="flex h-5 w-5 cursor-pointer" onClick={() => toggleDropdown(sync.id)}/>
                                        {openDropdownId === sync.id && (
                                            <div
                                                className="text-gray-400 absolute z-10 -top-15 left-1 bg-black rounded border border-neutral-700 items-center"
                                            >
                                                <div className="flex flex-col w-full">
                                                    <div
                                                        className="flex items-center w-full whitespace-nowrap hover:bg-neutral-800 px-4 py-4"
                                                        onClick={() =>
                                                                    syncCommand(
                                                                        sync.schedule_status === 'RUNNING' ? 'PAUSE' : 'UNPAUSE',
                                                                        sync.nango_connection_id,
                                                                        sync.schedule_id,
                                                                        sync.id,
                                                                        sync.name
                                                                    )
                                                                }
                                                        >
                                                        {sync.schedule_status !== 'RUNNING' ? (
                                                            <>
                                                                <PlayCircleIcon className="flex h-6 w-6 text-gray-400 cursor-pointer" />
                                                                <span className="pl-2">Start Schedule</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <PauseCircleIcon className="flex h-6 w-6 text-gray-400 cursor-pointer" />
                                                                <span className="pl-2">Pause Schedule</span>
                                                            </>
                                                        )}
                                                    </div>
                                                    <div
                                                        className="flex items-center hover:bg-neutral-800 px-4 py-4"
                                                        onClick={() => syncCommand('RUN', sync.nango_connection_id, sync.schedule_id, sync.id, sync.name)}
                                                    >
                                                        <ArrowPathRoundedSquareIcon className="flex h-6 w-6 text-gray-400 cursor-pointer" />
                                                        <span className="pl-2">Trigger Once</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            )}
        </div>
    )
}

