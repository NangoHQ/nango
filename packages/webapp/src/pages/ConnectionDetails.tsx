import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Prism } from '@mantine/prism';
import { toast } from 'react-toastify';
import { Clock, RefreshCw, Lock, Check, X } from '@geist-ui/icons';
import Info from '../components/ui/Info'
import { Tooltip } from '@geist-ui/core';

import { useGetConnectionDetailsAPI, useDeleteConnectionAPI, useGetSyncAPI, useRunSyncAPI } from '../utils/api';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';
import PrismPlus from '../components/ui/prism/PrismPlus';
import Button from '../components/ui/button/Button';
import Typography from '../components/ui/typography/Typography';
import SecretInput from '../components/ui/input/SecretInput';
import { SyncResponse, RunSyncCommand, AuthModes, ApiKeyCredentials, BasicApiCredentials } from '../types';
import { calculateTotalRuntime, getRunTime, parseLatestSyncResult, formatDateToUSFormat, interpretNextRun } from '../utils/utils';

interface Connection {
    id: number;
    connectionId: string;
    provider: string;
    providerConfigKey: number;
    creationDate: string;
    oauthType: string;
    connectionConfig: Record<string, string>;
    connectionMetadata: Record<string, string>;
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: string | null;
    oauthToken: string | null;
    oauthTokenSecret: string | null;
    rawCredentials: object;
    credentials: BasicApiCredentials | ApiKeyCredentials | null;
}

export default function ConnectionDetails() {
    const [loaded, setLoaded] = useState(false);
    const [syncLoaded, setSyncLoaded] = useState(false);
    const [fetchingRefreshToken, setFetchingRefreshToken] = useState(false);
    const [syncs, setSyncs] = useState([]);
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [currentTab, setCurrentTab] = useState<'auth' | 'sync'>('auth');
    const [connection, setConnection] = useState<Connection | null>(null);
    const navigate = useNavigate();
    const getConnectionDetailsAPI = useGetConnectionDetailsAPI();
    const deleteConnectionAPI = useDeleteConnectionAPI();
    const getSyncAPI = useGetSyncAPI();
    const runCommandSyncAPI = useRunSyncAPI();
    const { connectionId, providerConfigKey } = useParams();

    const location = useLocation();

    useEffect(() => {
        if (location.hash === '#sync') {
            setCurrentTab('sync');
        }
    }, [location]);

    useEffect(() => {
        if (!connectionId || !providerConfigKey) return;

        const getConnections = async () => {
            let res = await getConnectionDetailsAPI(connectionId, providerConfigKey, false);

            if (res?.status === 200) {
                let data = await res.json();
                setConnection(data['connection']);
            } else if (res != null) {
                setServerErrorMessage(`
We could not retrieve and/or refresh your access token due to the following error:
\n\n${(await res.json()).error}
`);
            }
        };

        if (!loaded) {
            setLoaded(true);
            getConnections();
        }
    }, [connectionId, providerConfigKey, getConnectionDetailsAPI, loaded, setLoaded]);

    const deleteButtonClicked = async () => {
        if (!connectionId || !providerConfigKey) return;

        const res = await deleteConnectionAPI(connectionId, providerConfigKey);

        if (res?.status === 204) {
            toast.success('Connection deleted!', { position: toast.POSITION.BOTTOM_CENTER });
            navigate('/connections', { replace: true });
        }
    };

    const forceRefresh = async () => {
        if (!connectionId || !providerConfigKey) return;

        setFetchingRefreshToken(true);

        let res = await getConnectionDetailsAPI(connectionId, providerConfigKey, true);

        if (res?.status === 200) {
            let data = await res.json();
            setConnection(data['connection']);

            toast.success('Token refresh success!', { position: toast.POSITION.BOTTOM_CENTER });
        } else if (res != null) {
            setServerErrorMessage(`
             We could not retrieve and/or refresh your access token due to the following error:
             \n\n${(await res.json()).error}
            `);
            toast.error('Failed to refresh token!', { position: toast.POSITION.BOTTOM_CENTER });
        }
        setTimeout(() => {
            setFetchingRefreshToken(false);
        }, 400);
    };

    useEffect(() => {
        if (!connectionId || !providerConfigKey) return;

        const getSyncs = async () => {
            const res = await getSyncAPI(connectionId, providerConfigKey);

            if (res?.status === 200) {
                try {
                    const data = await res.json();
                    setSyncs(data);
                } catch (e) {
                    console.log(e);
                }
                setSyncLoaded(true);
            }
        };

        if (!syncLoaded) {
            setSyncLoaded(true);
            getSyncs();
        }
    }, [getSyncAPI, syncLoaded, setLoaded, connectionId, providerConfigKey]);

    const syncCommand = async (command: RunSyncCommand, nango_connection_id: number, scheduleId: string, syncId: number, syncName: string) => {
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
            <X className="stroke-red-500 mr-2" size="12" />
            <p className="inline-block text-red-500 text-sm">errored</p>
        </>
    );
    const errorBubbleStyles = 'inline-flex justify-center items-center rounded-full py-1 px-4 bg-red-500 bg-opacity-20';

    const SuccessBubble = () => (
        <>
            <Check className="stroke-green-500 mr-2" size="12" />
            <p className="inline-block text-green-500 text-sm">done</p>
        </>
    );
    const successBubbleStyles = 'inline-flex justify-center items-center rounded-full py-1 px-4 bg-green-500 bg-opacity-20';

    const RunningBubble = () => (
        <>
            <Clock className="stroke-orange-500 mr-2" size="12" />
            <p className="inline-block text-orange-500 text-sm">running</p>
        </>
    );
    const runningBubbleStyles = 'inline-flex justify-center items-center rounded-full py-1 px-4 bg-orange-500 bg-opacity-20';

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
            <div className="mx-auto w-largebox">
                <div className="mx-16 pb-40">
                    <div className="flex mt-16 mb-6 justify-between">
                        <Typography
                            className="max-w-3xl"
                            tooltipProps={{
                                text: (
                                    <>
                                        <div className="flex text-black text-sm">
                                            <p>{`Stores the OAuth credentials & details. You can fetch it with the `}</p>
                                            <a
                                                href="https://docs.nango.dev/reference/connections-api"
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-text-blue hover:text-text-light-blue ml-1"
                                            >
                                                API
                                            </a>
                                            <p className="ml-1">{` and `}</p>
                                            <a
                                                href="https://docs.nango.dev/reference/node-sdk"
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-text-blue hover:text-text-light-blue ml-1"
                                            >
                                                Node SDK
                                            </a>
                                            <p>{`.`}</p>
                                        </div>
                                    </>
                                )
                            }}
                        >
                            Connection: {connection?.connectionId} - {connection?.providerConfigKey}
                        </Typography>
                        {currentTab === 'auth' && (
                            <Button
                                isLoading={fetchingRefreshToken}
                                onClick={forceRefresh}
                                iconProps={{ Icon: <RefreshCw className="h-5 w-5" />, position: 'start' }}
                            >
                                Manually Refresh Token
                            </Button>
                        )}
                        {currentTab === 'sync' && (
                            <Tooltip text="Refresh" type="dark">
                                <RefreshCw className="flex flex-end stroke-white cursor-pointer" size="24" onClick={() => setSyncLoaded(false)} />
                            </Tooltip>
                        )}
                    </div>
                    <div className={`flex inline-flex text-white ${currentTab === 'auth' || (currentTab === 'sync' && syncs.length > 0) ? 'mb-12' : ''} border border-border-gray rounded-md`}>
                        <span
                            className={`flex items-center justify-center cursor-pointer py-1 px-3 ${currentTab === 'auth' ? 'bg-gray-800' : ''}`}
                            onClick={() => setCurrentTab('auth')}
                        >
                            <Lock className="flex stroke-white mr-2 mb-0.5" size="14" />
                            Auth
                        </span>
                        <span
                            className={`flex items-center justify-center cursor-pointer py-1 px-3 ${currentTab === 'sync' ? 'bg-gray-800' : ''}`}
                            onClick={() => setCurrentTab('sync')}
                        >
                            <RefreshCw className="flex stroke-white mr-2 mb-0.5" size="14" />
                            Sync
                        </span>
                    </div>
                    <div className={`${currentTab === 'auth' || (currentTab === 'sync' && syncs.length > 0) ? 'border border-border-gray' : ''} rounded-md h-fit ${currentTab === 'auth' ? 'py-14' : 'pt-6'} text-white text-sm`}>
                        {currentTab === 'auth' && (
                            <>
                                <div>
                                    <div className="mx-8">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Connection ID
                                        </label>
                                        <Prism language="bash" colorScheme="dark">
                                            {connectionId || ''}
                                        </Prism>
                                    </div>
                                </div>
                                <div>
                                    <div className="mx-8 mt-8">
                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                            Integration Unique Key
                                        </label>
                                        <Prism language="bash" colorScheme="dark">
                                            {providerConfigKey || ''}
                                        </Prism>
                                    </div>
                                </div>
                                {connection && (
                                    <div>
                                        <div>
                                            <div className="mx-8 mt-8">
                                                <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                    Creation Date
                                                </label>
                                                <p className="mt-3 mb-5">{new Date(connection.creationDate).toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="mx-8 mt-8">
                                                <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                    Integration Template
                                                </label>
                                                <div className="mt-3 mb-5 flex">
                                                    <img src={`images/template-logos/${connection.provider}.svg`} alt="" className="h-7 mt-0.5 mr-0.5" />
                                                    <p className="">{`${connection.provider}`}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="mx-8 mt-8">
                                                <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                    Auth Type
                                                </label>
                                                <p className="mt-3 mb-5">{connection.oauthType}</p>
                                            </div>
                                        </div>
                                        {connection.accessToken && (
                                            <div>
                                                <div className="mx-8 mt-8">
                                                    <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                        Access Token
                                                    </label>

                                                    <SecretInput disabled defaultValue={connection.accessToken} copy={true} />
                                                </div>
                                            </div>
                                        )}
                                        {connection.expiresAt && (
                                            <div>
                                                <div className="mx-8 mt-8">
                                                    <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                        Access Token Expiration
                                                    </label>
                                                    <p className="mt-3 mb-5">{new Date(connection.expiresAt).toLocaleString()}</p>
                                                </div>
                                            </div>
                                        )}
                                        {connection.refreshToken && (
                                            <div>
                                                <div className="mx-8 mt-8">
                                                    <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                        Refresh Token
                                                    </label>
                                                    <SecretInput disabled defaultValue={connection.refreshToken} copy={true} />
                                                </div>
                                            </div>
                                        )}
                                        {connection.oauthToken && (
                                            <div>
                                                <div className="mx-8 mt-8">
                                                    <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                        OAuth Token
                                                    </label>
                                                    <SecretInput disabled defaultValue={connection.oauthToken} copy={true} />
                                                </div>
                                            </div>
                                        )}
                                        {connection.oauthTokenSecret && (
                                            <div>
                                                <div className="mx-8 mt-8">
                                                    <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                        OAuth Token Secret
                                                    </label>
                                                    <SecretInput disabled defaultValue={connection.oauthTokenSecret} copy={true} />
                                                </div>
                                            </div>
                                        )}
                                        {connection.credentials && connection.oauthType === AuthModes.ApiKey && (
                                            <div>
                                                <div className="mx-8 mt-8">
                                                    <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                        API Key
                                                    </label>
                                                    <SecretInput disabled defaultValue={connection.credentials.apiKey} copy={true} />
                                                </div>
                                            </div>
                                        )}
                                        {connection.credentials && connection.oauthType === AuthModes.Basic && (
                                            <>
                                                <div>
                                                    <div className="mx-8 mt-8">
                                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                            Username
                                                        </label>
                                                        <SecretInput disabled defaultValue={connection.credentials.username} copy={true} />
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="mx-8 mt-8">
                                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                            Password
                                                        </label>
                                                        <SecretInput disabled defaultValue={connection.credentials.password} copy={true} />
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                        <div>
                                            <div className="mx-8 mt-8">
                                                <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                    Connection Configuration
                                                </label>
                                                <Prism language="json" colorScheme="dark">
                                                    {JSON.stringify(connection.connectionConfig, null, 4) || '{}'}
                                                </Prism>
                                            </div>
                                        </div>
                                        {(connection.oauthType === AuthModes.OAuth1 || connection.oauthType === AuthModes.OAuth2 || connection.oauthType === AuthModes.App) && (
                                            <>
                                                <div>
                                                    <div className="mx-8 mt-8">
                                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                            Connection Metadata
                                                        </label>
                                                        <Prism language="json" colorScheme="dark">
                                                            {JSON.stringify(connection.connectionMetadata, null, 4) || '{}'}
                                                        </Prism>
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="mx-8 mt-8">
                                                        <label htmlFor="email" className="text-text-light-gray block text-sm font-semibold">
                                                            Raw Token Response
                                                        </label>
                                                        <PrismPlus language="json" colorScheme="dark">
                                                            {JSON.stringify(connection.rawCredentials, null, 4) || '{}'}
                                                        </PrismPlus>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                                {serverErrorMessage && (
                                    <div className="mx-8 mt-8">
                                        <p className="mt-6 text-sm text-red-600">{serverErrorMessage}</p>
                                    </div>
                                )}

                                <div className="mx-8 mt-8">
                                    <Button variant="danger" size="sm" onClick={deleteButtonClicked}>
                                        <p>Delete</p>
                                    </Button>
                                </div>
                            </>
                        )}
                        {currentTab === 'sync' && (
                            <>
                                {syncs.length > 0 && (
                                    <div className="text-white px-5">
                                        <ul className="flex space-x-14 pb-4 items-center text-lg border-b border-border-gray">
                                            <li>Integration Script</li>
                                            <li className="w-[7.5rem]">Models</li>
                                            <li className="w-[3.75rem]">Status</li>
                                            <li>Last Sync</li>
                                            <li>Next Sync</li>
                                            <li>30d Run Time</li>
                                        </ul>
                                    </div>
                                )}
                                {syncs.length === 0 && (
                                    <div className="flex pt-8">
                                        <Info size={24}>
                                            No syncs have been created for this connection. Navigage to the <a href="/syncs" className="text-[#4E80EE]" rel="noreferrer">sync tab</a> to create one.
                                        </Info>
                                    </div>
                                )}
                                {syncs.length > 0 && (
                                    <>
                                        {syncs.map((sync: SyncResponse, index: number) => (
                                            <ul
                                                key={sync.id}
                                                className={`flex py-4 px-5 text-base items-center ${
                                                    index !== syncs.length - 1 ? 'border-b border-border-gray' : ''
                                                }`}
                                            >
                                                <Tooltip
                                                text={
                                                        <>
                                                            <div>Sync ID: {sync.id}</div>
                                                            <div>Job ID: {sync?.latest_sync?.job_id}</div>
                                                            <div>Schedule ID: {sync?.schedule_id}</div>
                                                        </>
                                                    }
                                                    type="dark"
                                                >
                                                            <li className="w-44">{sync.name}{sync.latest_sync && (<>@v{sync?.latest_sync?.version}</>)}</li>
                                                </Tooltip>
                                                <Tooltip text={sync?.latest_sync?.models?.join(', ') || ''} type="dark">
                                                    <li className="w-44 ml-4 text-sm truncate">
                                                            {sync.latest_sync && sync.latest_sync.models ? (
                                                                <>
                                                                    {sync.latest_sync.models.map((model) => model.charAt(0).toUpperCase() + model.slice(1)).join(', ')}
                                                                </>
                                                            ) : '-'}
                                                    </li>
                                                </Tooltip>
                                                <li className="w-28">
                                                    {sync.schedule_status === 'PAUSED' && sync.latest_sync?.status !== 'RUNNING' && (
                                                        <div className="inline-flex justify-center items-center rounded-full py-1 px-4 bg-red-500 bg-opacity-20">
                                                            <X className="stroke-red-500 mr-2" size="12" />
                                                            <p className="inline-block text-red-500 text-sm">stopped</p>
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
                                                </li>
                                                {sync.latest_sync?.result && Object.keys(sync.latest_sync?.result).length > 0 ? (
                                                    <Tooltip text={<pre>{parseLatestSyncResult(sync.latest_sync.result, sync.latest_sync.models)}</pre>} type="dark">
                                                        {sync.latest_sync?.activity_log_id !== null ? (
                                                            <Link
                                                                to={`/activity?activity_log_id=${sync.latest_sync?.activity_log_id}`}
                                                                className="block w-32 ml-1 text-gray-500 text-sm"
                                                            >
                                                                {formatDateToUSFormat(sync.latest_sync?.updated_at)}
                                                            </Link>
                                                        ) : (
                                                            <li className="w-32 ml-1 text-gray-500 text-sm">{formatDateToUSFormat(sync.latest_sync?.updated_at)}</li>
                                                        )}
                                                    </Tooltip>
                                                ): (
                                                    <>
                                                        {sync.latest_sync?.activity_log_id? (
                                                            <Link
                                                                to={`/activity?activity_log_id=${sync.latest_sync?.activity_log_id}`}
                                                                className="block w-32 ml-1 text-gray-500 text-sm"
                                                            >
                                                                {formatDateToUSFormat(sync.latest_sync?.updated_at)}
                                                            </Link>
                                                        ) : (
                                                            <li className="w-32 ml-1 text-gray-500 text-sm">{formatDateToUSFormat(sync.latest_sync?.updated_at)}</li>
                                                        )}
                                                    </>
                                                )}
                                                {sync.schedule_status === 'RUNNING' && (
                                                    <>
                                                        {interpretNextRun(sync.futureActionTimes) === '-' ? (
                                                            <li className="ml-3 w-32 text-sm text-gray-500">-</li>
                                                        ) : (
                                                            <Tooltip text={interpretNextRun(sync.futureActionTimes, sync.latest_sync?.updated_at)[1]} type="dark">
                                                                <li className="ml-3 w-32 text-sm text-gray-500">{interpretNextRun(sync.futureActionTimes, sync.latest_sync?.updated_at)[0]}</li>
                                                            </Tooltip>
                                                        )}
                                                    </>
                                                )}
                                                {sync.schedule_status === 'RUNNING' && !sync.futureActionTimes && (
                                                    <li className="ml-3 w-32 text-sm text-gray-500">-</li>
                                                )}
                                                {sync.schedule_status !== 'RUNNING' && (
                                                    <li className="ml-3 w-32 text-sm text-gray-500">-</li>
                                                )}
                                                {sync.thirty_day_timestamps ? (
                                                    <li className="w-24 ml-[0.25rem] text-sm text-gray-500">
                                                        {calculateTotalRuntime(sync.thirty_day_timestamps)}
                                                    </li>
                                                ) : (
                                                    <li className="w-24 ml-[0.25rem] text-sm text-gray-500">-</li>
                                                )
                                                }
                                                <li className="flex ml-8">
                                                    <button
                                                        className="flex h-8 mr-2 rounded-md pl-2 pr-3 pt-1.5 text-sm text-white bg-gray-800 hover:bg-gray-700"
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
                                                        <p>{sync.schedule_status === 'RUNNING' ? 'Pause' : 'Start'}</p>
                                                    </button>
                                                    <button
                                                        className="flex h-8 mr-2 rounded-md pl-2 pr-3 pt-1.5 text-sm text-white bg-gray-800 hover:bg-gray-700"
                                                        onClick={() => syncCommand('RUN', sync.nango_connection_id, sync.schedule_id, sync.id, sync.name)}
                                                    >
                                                        <p>Trigger</p>
                                                    </button>
                                                    {/*
                                                    <button
                                                        className="inline-flex items-center justify-center h-8 mr-2 rounded-md pl-2 pr-3 text-sm text-white bg-gray-800 hover:bg-gray-700 leading-none"
                                                        onClick={() => syncCommand('RUN_FULL', sync.nango_connection_id, sync.id, sync.name)}
                                                    >
                                                        Full Resync
                                                    </button>
                                                    */}
                                                </li>
                                            </ul>
                                        ))}
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
