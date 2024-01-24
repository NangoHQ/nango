import { Tooltip } from '@geist-ui/core';
import { Link } from 'react-router-dom';
import { Clock, Check, X } from '@geist-ui/icons';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline'
import { SyncResponse } from '../../types';
import { 
    calculateTotalRuntime, 
    getRunTime, 
    parseLatestSyncResult, 
    formatDateToUSFormat, 
    interpretNextRun 
} from '../../utils/utils';

interface SyncsProps {
    syncs: SyncResponse[] | null;
}

export default function Syncs(props: SyncsProps) {
    const { syncs } = props;

    const ErrorBubble = () => (
        <>
            <X className="stroke-red-500 mr-2" size="12" />
            <p className="inline-block text-red-500">errored</p>
        </>
    );
    const errorBubbleStyles = 'inline-flex justify-center items-center rounded-full py-1 px-4 bg-red-500 bg-opacity-20';

    const SuccessBubble = () => (
        <>
            <Check className="stroke-green-500 mr-2" size="12" />
            <p className="inline-block text-green-500">done</p>
        </>
    );
    const successBubbleStyles = 'inline-flex justify-center items-center rounded-full py-1 px-4 bg-green-500 bg-opacity-20';

    const RunningBubble = () => (
        <>
            <Clock className="stroke-orange-500 mr-2" size="12" />
            <p className="inline-block text-orange-500">running</p>
        </>
    );
    const runningBubbleStyles = 'inline-flex justify-center items-center rounded-full py-1 px-4 bg-orange-500 bg-opacity-20';

    return (
        <div className="h-fit rounded-md text-white">
            {!syncs || syncs.length === 0 ? (
                <div className="flex flex-col border border-border-gray rounded-md text-white text-center p-10">
                    <h2 className="text-xl text-center w-full">No active syncs</h2>
                </div>
            ) : (
                <table className="w-[976px]">
                    <tbody className="flex flex-col space-y-2">
                        <tr>
                            <td className="flex items-center px-3 justify-between text-xs px-2 py-2 bg-zinc-900 border border-neutral-800 rounded-md">
                                <div className="w-48">Models</div>
                                <div className="w-16">Status</div>
                                <div className="w-8">Frequency</div>
                                <div className="w-24">Last Sync Start</div>
                                <div className="w-24">Next Sync Start</div>
                                <div className="w-16">Last Run</div>
                                <div className="">30d Runs</div>
                            </td>
                        </tr>
                        <tr>
                            {syncs.map((sync) => (
                                <td
                                    key={sync.name}
                                    className="flex items-center px-2 py-3 cursor-pointer justify-between border-b border-border-gray"
                                >
                                    <div className="flex items-center w-48">
                                        <Tooltip text={Array.isArray(sync.models) ? sync.models.join(', ') : sync.models} type="dark">
                                            <div className="w-36 max-w-3xl truncate">{Array.isArray(sync.models) ? sync.models.join(', ') : sync.models}</div>
                                        </Tooltip>
                                    </div>
                                    <div className="flex w-20 text-[13px]">
                                        <span className="w-28">
                                            {sync.schedule_status === 'PAUSED' && sync.latest_sync?.status !== 'RUNNING' && (
                                                <div className="inline-flex justify-center items-center rounded-full py-1 px-4 bg-red-500 bg-opacity-20">
                                                    <X className="stroke-red-500 mr-2" size="12" />
                                                    <p className="inline-block text-red-500">stopped</p>
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
                                                        to={`/activity?activity_log_id=${sync.latest_sync?.activity_log_id}`}
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
                                                        to={`/activity?activity_log_id=${sync.latest_sync?.activity_log_id}`}
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
                                                    <Tooltip text={`Last run time: ${getRunTime(sync.latest_sync?.created_at, sync.latest_sync?.updated_at)}`} type="dark">
                                                        <Link
                                                            to={`/activity?activity_log_id=${sync.latest_sync?.activity_log_id}`}
                                                            className={successBubbleStyles}
                                                        >
                                                            <SuccessBubble />
                                                        </Link>
                                                    </Tooltip>
                                            ) : (
                                                <Tooltip text={`Last run time: ${getRunTime(sync.latest_sync?.created_at, sync.latest_sync?.updated_at)}`} type="dark">
                                                    <div className={successBubbleStyles}>
                                                        <SuccessBubble />
                                                    </div>
                                                </Tooltip>
                                            ))}
                                        </span>
                                    </div>
                                    <div className="flex items-center w-12">{sync.frequency}</div>
                                    <div className="flex items-center w-36">
                                        {sync.latest_sync?.result && Object.keys(sync.latest_sync?.result).length > 0 ? (
                                            <Tooltip text={<pre>{parseLatestSyncResult(sync.latest_sync.result, sync.latest_sync.models)}</pre>} type="dark">
                                                {sync.latest_sync?.activity_log_id !== null ? (
                                                    <Link
                                                        to={`/activity?activity_log_id=${sync.latest_sync?.activity_log_id}`}
                                                        className="block w-32 ml-1 text-gray-500"
                                                    >
                                                        {formatDateToUSFormat(sync.latest_sync?.updated_at)}
                                                    </Link>
                                                ) : (
                                                    <span className="w-32 ml-1 text-gray-500">{formatDateToUSFormat(sync.latest_sync?.updated_at)}</span>
                                                )}
                                            </Tooltip>
                                        ): (
                                            <>
                                                {sync.latest_sync?.activity_log_id? (
                                                    <Link
                                                        to={`/activity?activity_log_id=${sync.latest_sync?.activity_log_id}`}
                                                        className="block w-32 ml-1 text-gray-500"
                                                    >
                                                        {formatDateToUSFormat(sync.latest_sync?.updated_at)}
                                                    </Link>
                                                ) : (
                                                    <span className="w-32 ml-1 text-gray-500">{formatDateToUSFormat(sync.latest_sync?.updated_at)}</span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    <div className="flex items-center w-24">
                                        {sync.schedule_status === 'RUNNING' && (
                                            <>
                                                {interpretNextRun(sync.futureActionTimes) === '-' ? (
                                                    <span className="ml-3 w-32 text-gray-500">-</span>
                                                ) : (
                                                    <Tooltip text={interpretNextRun(sync.futureActionTimes, sync.latest_sync?.updated_at)[1]} type="dark">
                                                        <span className="ml-3 w-32 text-gray-500">{interpretNextRun(sync.futureActionTimes, sync.latest_sync?.updated_at)[0]}</span>
                                                    </Tooltip>
                                                )}
                                            </>
                                        )}
                                        {sync.schedule_status === 'RUNNING' && !sync.futureActionTimes && (
                                            <span className="ml-3 w-32 text-gray-500">-</span>
                                        )}
                                        {sync.schedule_status !== 'RUNNING' && (
                                            <span className="ml-3 w-32 text-gray-500">-</span>
                                        )}
                                    </div>
                                    <div className="w-12">
                                        {getRunTime(sync.latest_sync?.created_at, sync.latest_sync?.updated_at)}
                                    </div>
                                    <div className="w-12">
                                        {sync.thirty_day_timestamps ? (
                                                <span className="w-24 ml-[0.25rem] text-gray-500">
                                                    {calculateTotalRuntime(sync.thirty_day_timestamps)}
                                                </span>
                                            ) : (
                                                <span className="w-24 ml-[0.25rem] text-gray-500">-</span>
                                            )
                                        }
                                    </div>
                                    <div className="group relative">
                                        <EllipsisHorizontalIcon className="flex h-5 w-5 text-gray-400 cursor-pointer" />
                                        <div
                                            className="hidden group-hover:flex p-3 hover:bg-neutral-800 text-gray-400 absolute z-10 -top-10 left-1 bg-black rounded border border-neutral-700 items-center"
                                        >
                                            <span className="pl-2">Start Schedule</span>
                                            <span className="pl-2">Trigger Once</span>
                                        </div>
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

