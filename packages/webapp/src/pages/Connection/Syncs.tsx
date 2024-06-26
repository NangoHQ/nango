import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { HelpCircle } from '@geist-ui/icons';
import { Loading, Tooltip, useModal, Modal } from '@geist-ui/core';
import ActionModal from '../../components/ui/ActionModal';
import { Tag } from '../../components/ui/label/Tag';
import Spinner from '../../components/ui/Spinner';
import { Link } from 'react-router-dom';
import {
    AdjustmentsHorizontalIcon,
    EllipsisHorizontalIcon,
    PlayCircleIcon,
    PauseCircleIcon,
    QueueListIcon,
    ArrowPathRoundedSquareIcon,
    StopCircleIcon
} from '@heroicons/react/24/outline';
import type { SyncResponse, RunSyncCommand } from '../../types';
import type { Connection } from '@nangohq/types';
import { UserFacingSyncCommand } from '../../types';
import { formatFrequency, getRunTime, parseLatestSyncResult, formatDateToUSFormat, interpretNextRun } from '../../utils/utils';
import Button from '../../components/ui/button/Button';
import { useRunSyncAPI } from '../../utils/api';
import { getLogsUrl } from '../../utils/logs';

interface SyncsProps {
    syncs: SyncResponse[] | undefined;
    connection: Connection | null;
    provider: string | null;
    loaded: boolean;
    syncLoaded: boolean;
    reload: () => void;
    env: string;
}

export default function Syncs({ syncs, connection, provider, reload, loaded, syncLoaded, env }: SyncsProps) {
    const [sync, setSync] = useState<SyncResponse | null>(null);
    const [modalShowSpinner, setModalShowSpinner] = useState(false);
    const [showPauseStartLoader, setShowPauseStartLoader] = useState(false);
    const [showInterruptLoader, setShowInterruptLoader] = useState(false);
    const [showTriggerIncrementalLoader, setShowTriggerIncrementalLoader] = useState(false);
    const [showTriggerFullLoader, setShowTriggerFullLoader] = useState(false);
    const [syncCommandButtonsDisabled, setSyncCommandButtonsDisabled] = useState(false);
    const [openDropdownHash, setOpenDropdownHash] = useState<string | null>(null);
    const { setVisible, bindings } = useModal();
    const { setVisible: setErrorVisible, bindings: errorBindings } = useModal();
    const runCommandSyncAPI = useRunSyncAPI(env);

    const toggleDropdown = (hash: string) => {
        if (openDropdownHash === hash) {
            setOpenDropdownHash(null);
        } else {
            setOpenDropdownHash(hash);
        }
    };

    const resetLoaders = () => {
        setShowPauseStartLoader(false);
        setShowInterruptLoader(false);
        setShowTriggerIncrementalLoader(false);
        setShowTriggerFullLoader(false);
    };

    const hashSync = (sync: SyncResponse) => {
        return `${sync.id}${JSON.stringify(sync.models)}`;
    };

    useEffect(() => {
        const closeSyncWindow = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest('.interact-with-sync')) {
                setOpenDropdownHash(null);
            }
        };

        document.addEventListener('click', closeSyncWindow);

        return () => {
            document.removeEventListener('click', closeSyncWindow);
        };
    }, []);

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

    const fullResync = async () => {
        if (!sync || syncCommandButtonsDisabled) {
            return;
        }
        setShowTriggerFullLoader(true);
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
        setVisible(false);
        setSyncCommandButtonsDisabled(false);
        setShowTriggerFullLoader(false);
    };

    const RenderBubble = ({ sync, children }: { sync: SyncResponse; children: ReactNode }) => {
        const linkPath = getLogsUrl({
            env,
            connections: connection?.connection_id,
            syncs: sync.name,
            day: new Date(sync.latest_sync?.updated_at)
        });

        return <Link to={linkPath}>{children}</Link>;
    };

    if (!loaded || !syncLoaded || syncs === null) return <Loading spaceRatio={2.5} className="top-24" />;

    return (
        <div className="h-fit rounded-md text-white">
            <ActionModal
                bindings={bindings}
                modalTitle="Full Refresh?"
                modalContent="Triggering a full refresh in Nango will clear all existing records and reset the last sync date used for incremental syncs. This means every record will be fetched again from the start of your sync window and treated as new."
                modalShowSpinner={modalShowSpinner}
                modalAction={() => fullResync()}
                modalTitleColor="text-red-500"
                setVisible={setVisible}
            />
            <Modal {...errorBindings} wrapClassName="!h-[600px] !w-[550px] !max-w-[550px] !bg-[#0E1014] no-border-modal">
                <Modal.Action
                    placeholder={null}
                    passive
                    className="!flex !justify-end !text-sm !bg-[#0E1014] !border-0 !h-[100px]"
                    onClick={() => setErrorVisible(false)}
                    onPointerEnterCapture={null}
                    onPointerLeaveCapture={null}
                >
                    <Button className="!text-text-light-gray" variant="zombieGray">
                        Close
                    </Button>
                </Modal.Action>
            </Modal>
            {!syncs || syncs.length === 0 ? (
                <div className="flex flex-col border border-border-gray rounded-md items-center text-white text-center p-10 py-20">
                    <h2 className="text-xl text-center w-full">
                        No models are syncing for <span className="capitalize">{provider}</span>
                    </h2>
                    <div className="mt-4 text-gray-400">
                        Start syncing models for <span className="capitalize">{provider}</span> on the Sync Configuration tab.
                    </div>
                    <Link
                        to={`/${env}/integration/${connection?.provider_config_key}#scripts`}
                        className="flex justify-center w-auto items-center mt-5 px-4 h-10 rounded-md text-sm text-black bg-white hover:bg-gray-300"
                    >
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
                                <div className="w-24">Name</div>
                                <div className="w-48">Synced Models</div>
                                <div className="w-16">Status</div>
                                <div className="w-8">Frequency</div>
                                <div className="w-24">Last Sync Start</div>
                                <div className="w-24">Next Sync Start</div>
                                <div className="w-16">Last Run</div>
                                <div className=""></div>
                            </td>
                        </tr>
                        <tr>
                            {syncs.map((sync) => (
                                <td
                                    key={sync.name}
                                    className={`flex items-center px-2 py-3 text-[13px] ${syncCommandButtonsDisabled ? '' : 'cursor-pointer'} justify-between border-b border-border-gray`}
                                >
                                    <div className="flex items-center w-28">
                                        <div className="w-36 max-w-3xl ml-1 truncate">{sync.name}</div>
                                    </div>
                                    <div className="flex items-center w-52">
                                        <div className="w-36 max-w-3xl truncate">{Array.isArray(sync.models) ? sync.models.join(', ') : sync.models}</div>
                                    </div>
                                    <div className="flex w-20 -ml-2">
                                        <span className="">
                                            {sync.status === 'PAUSED' && (
                                                <RenderBubble sync={sync}>
                                                    <Tag bgClassName="bg-yellow-500 bg-opacity-30" textClassName="text-yellow-500">
                                                        Paused
                                                    </Tag>
                                                </RenderBubble>
                                            )}
                                            {(sync?.status === 'ERROR' || sync?.status === 'STOPPED') && (
                                                <RenderBubble sync={sync}>
                                                    <Tag bgClassName="bg-red-base bg-opacity-30" textClassName="text-red-base">
                                                        Failed
                                                    </Tag>
                                                </RenderBubble>
                                            )}
                                            {sync?.status === 'RUNNING' && (
                                                <RenderBubble sync={sync}>
                                                    <Tag bgClassName="bg-blue-base bg-opacity-30" textClassName="text-blue-base">
                                                        Syncing
                                                    </Tag>
                                                </RenderBubble>
                                            )}
                                            {sync?.status === 'SUCCESS' && (
                                                <RenderBubble sync={sync}>
                                                    <Tag bgClassName="bg-green-base bg-opacity-30" textClassName="text-green-base">
                                                        Success
                                                    </Tag>
                                                </RenderBubble>
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex items-center w-10">{formatFrequency(sync.frequency)}</div>
                                    <div className="flex items-center w-28">
                                        {sync.latest_sync?.result && Object.keys(sync.latest_sync?.result).length > 0 ? (
                                            <Tooltip text={<pre>{parseLatestSyncResult(sync.latest_sync.result, sync.latest_sync.models)}</pre>} type="dark">
                                                <Link
                                                    to={getLogsUrl({
                                                        env,
                                                        connections: connection?.connection_id,
                                                        syncs: sync.name,
                                                        day: new Date(sync.latest_sync?.updated_at)
                                                    })}
                                                    className="block w-32 ml-1"
                                                >
                                                    {formatDateToUSFormat(sync.latest_sync?.updated_at)}
                                                </Link>
                                            </Tooltip>
                                        ) : (
                                            <Link
                                                to={getLogsUrl({
                                                    env,
                                                    connections: connection?.connection_id,
                                                    syncs: sync.name,
                                                    day: new Date(sync.latest_sync?.updated_at)
                                                })}
                                                className=""
                                            >
                                                {formatDateToUSFormat(sync.latest_sync?.updated_at)}
                                            </Link>
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
                                        {sync.schedule_status === 'RUNNING' && !sync.futureActionTimes && <span className="">-</span>}
                                        {sync.schedule_status !== 'RUNNING' && <span className="">-</span>}
                                    </div>
                                    <div className="w-12">{getRunTime(sync.latest_sync?.created_at, sync.latest_sync?.updated_at)}</div>
                                    <div className="relative interact-with-sync">
                                        <EllipsisHorizontalIcon className="flex h-5 w-5 cursor-pointer" onClick={() => toggleDropdown(hashSync(sync))} />
                                        {openDropdownHash === hashSync(sync) && (
                                            <div className="text-gray-400 absolute z-10 -top-15 right-1 bg-black rounded border border-neutral-700 items-center">
                                                <div className="flex flex-col w-full">
                                                    <div
                                                        className={`flex items-center w-full whitespace-nowrap ${!syncCommandButtonsDisabled ? 'hover:bg-neutral-800 ' : ''} px-4 py-2`}
                                                        onClick={async () => {
                                                            setShowPauseStartLoader(true);
                                                            await syncCommand(
                                                                sync.schedule_status === 'RUNNING' ? 'PAUSE' : 'UNPAUSE',
                                                                sync.nango_connection_id,
                                                                sync.schedule_id,
                                                                sync.id,
                                                                sync.name
                                                            );
                                                        }}
                                                    >
                                                        {sync.schedule_status !== 'RUNNING' ? (
                                                            <>
                                                                <PlayCircleIcon
                                                                    className={`flex h-6 w-6 ${syncCommandButtonsDisabled ? 'text-gray-800' : 'text-gray-400 cursor-pointer'}`}
                                                                />
                                                                <span className={`pl-2 ${syncCommandButtonsDisabled ? 'text-gray-800' : ''} mr-2`}>
                                                                    Start schedule
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <PauseCircleIcon
                                                                    className={`flex h-6 w-6 ${syncCommandButtonsDisabled ? 'text-gray-800' : 'text-gray-400 cursor-pointer'}`}
                                                                />
                                                                <span className={`pl-2 ${syncCommandButtonsDisabled ? 'text-gray-800' : ''} mr-2`}>
                                                                    Pause schedule
                                                                </span>
                                                            </>
                                                        )}
                                                        {showPauseStartLoader && <Spinner size={1} />}
                                                    </div>
                                                    {sync?.status === 'RUNNING' && (
                                                        <div
                                                            className={`flex items-center w-full whitespace-nowrap ${!syncCommandButtonsDisabled ? 'hover:bg-neutral-800 ' : ''} px-4 py-2`}
                                                            onClick={() => {
                                                                setShowInterruptLoader(true);
                                                                syncCommand('CANCEL', sync.nango_connection_id, sync.schedule_id, sync.id, sync.name);
                                                            }}
                                                        >
                                                            <StopCircleIcon
                                                                className={`flex h-6 w-6 ${syncCommandButtonsDisabled ? 'text-gray-800' : 'text-gray-400 cursor-pointer'}`}
                                                            />
                                                            <span className={`pl-2 mr-2 ${syncCommandButtonsDisabled ? 'text-gray-800' : ''}`}>
                                                                Interrupt execution
                                                            </span>
                                                            {showInterruptLoader && <Spinner size={1} />}
                                                        </div>
                                                    )}
                                                    {sync?.status !== 'RUNNING' && (
                                                        <>
                                                            <div
                                                                className={`flex items-center w-full whitespace-nowrap ${!syncCommandButtonsDisabled ? 'hover:bg-neutral-800 ' : ''} px-4 py-2`}
                                                                onClick={() => {
                                                                    setShowTriggerIncrementalLoader(true);
                                                                    syncCommand('RUN', sync.nango_connection_id, sync.schedule_id, sync.id, sync.name);
                                                                }}
                                                            >
                                                                <ArrowPathRoundedSquareIcon
                                                                    className={`flex h-6 w-6 ${syncCommandButtonsDisabled ? 'text-gray-800' : 'text-gray-400 cursor-pointer'}`}
                                                                />
                                                                <span className={`pl-2 flex items-center ${syncCommandButtonsDisabled ? 'text-gray-800' : ''}`}>
                                                                    Trigger execution (incremental)
                                                                    <Tooltip
                                                                        type="dark"
                                                                        text={
                                                                            <>
                                                                                <div className="flex text-white text-sm">
                                                                                    <p>
                                                                                        Incremental: the existing cache and the last sync date will be
                                                                                        preserved, only new/updated data will be synced.
                                                                                    </p>
                                                                                </div>
                                                                            </>
                                                                        }
                                                                    >
                                                                        {!syncCommandButtonsDisabled && (
                                                                            <HelpCircle color="gray" className="h-4 ml-1"></HelpCircle>
                                                                        )}
                                                                    </Tooltip>
                                                                    {showTriggerIncrementalLoader && <Spinner size={1} />}
                                                                </span>
                                                            </div>
                                                            <div
                                                                className={`flex items-center w-full whitespace-nowrap ${!syncCommandButtonsDisabled ? 'hover:bg-neutral-800 ' : ''} px-4 py-2`}
                                                                onClick={() => {
                                                                    setSync(sync);
                                                                    setVisible(true);
                                                                }}
                                                            >
                                                                <ArrowPathRoundedSquareIcon
                                                                    className={`flex h-6 w-6 ${syncCommandButtonsDisabled ? 'text-gray-800' : 'text-gray-400 cursor-pointer'}`}
                                                                />
                                                                <span className={`pl-2 flex items-center ${syncCommandButtonsDisabled ? 'text-gray-800' : ''}`}>
                                                                    Trigger execution (full refresh)
                                                                    <Tooltip
                                                                        type="dark"
                                                                        text={
                                                                            <>
                                                                                <div className="flex text-white text-sm">
                                                                                    <p>
                                                                                        Full refresh: the existing cache and last sync date will be deleted, all
                                                                                        historical data will be resynced.
                                                                                    </p>
                                                                                </div>
                                                                            </>
                                                                        }
                                                                    >
                                                                        {!syncCommandButtonsDisabled && (
                                                                            <HelpCircle color="gray" className="h-4 ml-1"></HelpCircle>
                                                                        )}
                                                                    </Tooltip>
                                                                    {showTriggerFullLoader && <Spinner size={1} />}
                                                                </span>
                                                            </div>
                                                            <Link
                                                                to={getLogsUrl({
                                                                    env,
                                                                    connections: connection?.connection_id,
                                                                    syncs: sync.name,
                                                                    day: new Date(sync.latest_sync?.updated_at)
                                                                })}
                                                                className={`flex items-center w-full whitespace-nowrap hover:bg-neutral-800 px-4 py-2`}
                                                            >
                                                                <QueueListIcon className={`flex h-6 w-6 text-gray-400 cursor-pointer`} />
                                                                <span className={`pl-2 flex items-center`}>View Logs</span>
                                                            </Link>
                                                        </>
                                                    )}
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
    );
}
