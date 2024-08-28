import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Loading, useModal } from '@geist-ui/core';
import { useState, useEffect, Fragment } from 'react';
import { toast } from 'react-toastify';
import useSWR, { useSWRConfig } from 'swr';

import { requestErrorToast, swrFetcher, useGetConnectionDetailsAPI, useDeleteConnectionAPI } from '../../utils/api';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import ActionModal from '../../components/ui/ActionModal';
import { TrashIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../layout/DashboardLayout';
import { Info } from '../../components/Info';
import IntegrationLogo from '../../components/ui/IntegrationLogo';
import Button from '../../components/ui/button/Button';
import { useEnvironment } from '../../hooks/useEnvironment';
import Syncs from './Syncs';
import Authorization from './Authorization';
import type { SyncResponse } from '../../types';
import PageNotFound from '../PageNotFound';
import { isHosted } from '../../utils/utils';
import { connectSlack } from '../../utils/slack-connection';
import type { GetConnection } from '@nangohq/types';

import { useStore } from '../../store';
import { getLogsUrl } from '../../utils/logs';

export enum Tabs {
    Syncs,
    Authorization
}

export default function ShowIntegration() {
    const { mutate } = useSWRConfig();
    const env = useStore((state) => state.env);
    const { environmentAndAccount, mutate: environmentMutate } = useEnvironment(env);

    const [loaded, setLoaded] = useState(false);
    const [connectionResponse, setConnectionResponse] = useState<GetConnection['Success'] | null>(null);
    const [slackIsConnecting, setSlackIsConnecting] = useState(false);
    const [, setFetchingRefreshToken] = useState(false);
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [modalShowSpinner, setModalShowSpinner] = useState(false);
    const [pageNotFound, setPageNotFound] = useState(false);
    const [activeTab, setActiveTab] = useState<Tabs>(Tabs.Syncs);
    const [slackIsConnected, setSlackIsConnected] = useState(true);
    const getConnectionDetailsAPI = useGetConnectionDetailsAPI(env);
    const deleteConnectionAPI = useDeleteConnectionAPI(env);

    const navigate = useNavigate();
    const location = useLocation();
    const { setVisible, bindings } = useModal();
    const { connectionId, providerConfigKey } = useParams();

    const {
        data: syncs,
        isLoading: syncLoading,
        error: syncLoadError,
        mutate: reload
    } = useSWR<SyncResponse[]>(`/api/v1/sync?env=${env}&connection_id=${connectionId}&provider_config_key=${providerConfigKey}`, swrFetcher, {
        refreshInterval: 10000,
        keepPreviousData: false
    });

    useEffect(() => {
        if (syncLoadError) {
            requestErrorToast();
        }
    }, [syncLoadError]);

    useEffect(() => {
        if (environmentAndAccount) {
            setSlackIsConnected(environmentAndAccount.environment.slack_notifications);
        }
    }, [environmentAndAccount]);

    useEffect(() => {
        if (location.hash === '#models' || location.hash === '#syncs') {
            setActiveTab(Tabs.Syncs);
        }
        if (location.hash === '#authorization' || isHosted()) {
            setActiveTab(Tabs.Authorization);
        }
    }, [location]);

    useEffect(() => {
        if (!connectionId || !providerConfigKey) return;

        const getConnections = async () => {
            const res = await getConnectionDetailsAPI(connectionId, providerConfigKey, false);
            if (res?.status === 404) {
                setPageNotFound(true);
            } else if (res?.status === 200) {
                const data: GetConnection['Success'] = await res.json();
                setConnectionResponse(data);
            } else if (res?.status === 400) {
                const data = await res.json();
                if (data.connection) {
                    setConnectionResponse(data);
                }
            } else if (res != null) {
                setServerErrorMessage(`
We could not retrieve and/or refresh your access token due to the following error:
\n\n${(await res.json()).error}
`);
                setConnectionResponse({
                    errorLog: null,
                    provider: null,
                    connection: {
                        provider_config_key: providerConfigKey,
                        connection_id: connectionId
                    }
                } as GetConnection['Success']);
            }
        };

        if (!loaded) {
            setLoaded(true);
            getConnections();
        }
    }, [connectionId, providerConfigKey, getConnectionDetailsAPI, loaded, setLoaded]);

    const deleteButtonClicked = async () => {
        if (!connectionId || !providerConfigKey) return;

        setModalShowSpinner(true);
        const res = await deleteConnectionAPI(connectionId, providerConfigKey);
        setModalShowSpinner(false);

        if (res?.status === 204) {
            toast.success('Connection deleted!', { position: toast.POSITION.BOTTOM_CENTER });
            void mutate((key) => typeof key === 'string' && key.startsWith('/api/v1/connection'), undefined);
            navigate(`/${env}/connections`, { replace: true });
        }
    };

    const forceRefresh = async () => {
        if (!connectionId || !providerConfigKey) return;

        setFetchingRefreshToken(true);

        const res = await getConnectionDetailsAPI(connectionId, providerConfigKey, true);

        if (res?.status === 200) {
            const data: GetConnection['Success'] = await res.json();
            setConnectionResponse(data);

            toast.success('Token refresh success!', { position: toast.POSITION.BOTTOM_CENTER });
        } else if (res != null) {
            toast.error('Failed to refresh token!', { position: toast.POSITION.BOTTOM_CENTER });
        }
        setTimeout(() => {
            setFetchingRefreshToken(false);
        }, 400);
    };

    const createSlackConnection = async () => {
        setSlackIsConnecting(true);
        if (!environmentAndAccount) return;
        const { uuid: accountUUID, host: hostUrl } = environmentAndAccount;
        const onFinish = () => {
            environmentMutate();
            toast.success('Slack connection created!', { position: toast.POSITION.BOTTOM_CENTER });
            setSlackIsConnecting(false);
        };

        const onFailure = () => {
            toast.error('Failed to create Slack connection!', { position: toast.POSITION.BOTTOM_CENTER });
            setSlackIsConnecting(false);
        };
        await connectSlack({ accountUUID, env, hostUrl, onFinish, onFailure });
    };

    if (pageNotFound) {
        return <PageNotFound />;
    }

    if (!loaded || syncLoading || !connectionResponse) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
                <Loading spaceRatio={2.5} className="-top-36" />
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
            <ActionModal
                bindings={bindings}
                modalTitle="Delete connection?"
                modalContent="All credentials & synced data associated with this connection will be deleted."
                modalAction={() => deleteButtonClicked()}
                modalShowSpinner={modalShowSpinner}
                modalTitleColor="text-red-500"
                setVisible={setVisible}
            />
            <div className="mx-auto">
                <div className="flex gap-4 justify-between">
                    <div className="flex gap-6">
                        <Link to={`/${env}/integration/${connectionResponse.connection.provider_config_key}`}>
                            {connectionResponse?.provider && (
                                <IntegrationLogo
                                    provider={connectionResponse.provider}
                                    height={24}
                                    width={24}
                                    classNames="cursor-pointer p-1 border border-border-gray rounded-xl"
                                />
                            )}
                        </Link>
                        <div className="mt-3">
                            <span className="text-left text-xl font-semibold tracking-tight text-gray-400 mb-12">Connection</span>
                            <h2 className="text-left text-3xl font-semibold tracking-tight text-white break-all">{connectionId}</h2>
                        </div>
                    </div>
                    <Button
                        variant="zinc"
                        size="sm"
                        className="flex cursor-pointer text-gray-400 neutral-700 items-center mt-4"
                        onClick={() => {
                            setVisible(true);
                        }}
                    >
                        <TrashIcon className="flex h-5 w-5" />
                        <span className="px-1">Delete</span>
                    </Button>
                </div>
            </div>

            <section className="mt-14">
                <ul className="flex text-gray-400 space-x-2 font-semibold text-sm cursor-pointer">
                    <li
                        className={`flex items-center p-2 rounded ${activeTab === Tabs.Syncs ? 'bg-active-gray text-white' : 'hover:bg-hover-gray'}`}
                        onClick={() => setActiveTab(Tabs.Syncs)}
                    >
                        Syncs
                        {syncs && syncs.some((sync) => sync.active_logs?.log_id) && (
                            <span className="ml-2 bg-red-base h-1.5 w-1.5 rounded-full inline-block"></span>
                        )}
                    </li>
                    <li
                        className={`flex items-center p-2 rounded ${activeTab === Tabs.Authorization ? 'bg-active-gray text-white' : 'hover:bg-hover-gray'}`}
                        onClick={() => setActiveTab(Tabs.Authorization)}
                    >
                        Authorization
                        {connectionResponse.errorLog && <span className="ml-2 bg-red-base h-1.5 w-1.5 rounded-full inline-block"></span>}
                    </li>
                </ul>
            </section>

            {serverErrorMessage && (
                <div className="flex my-4">
                    <Info variant={'destructive'}>{serverErrorMessage}</Info>
                </div>
            )}

            {activeTab === Tabs.Authorization && connectionResponse.errorLog && (
                <div className="flex my-4">
                    <Info variant={'destructive'}>
                        <div>
                            There was an error refreshing the credentials
                            <Link
                                to={getLogsUrl({
                                    env,
                                    operationId: connectionResponse.errorLog.log_id,
                                    connections: connectionResponse.connection.connection_id,
                                    day: connectionResponse.errorLog?.created_at
                                })}
                                className="ml-1 cursor-pointer underline"
                            >
                                (logs).
                            </Link>
                        </div>
                    </Info>
                </div>
            )}

            {activeTab === Tabs.Syncs && syncs && syncs.some((sync) => sync.active_logs?.log_id) && (
                <div className="flex my-4">
                    <Info variant={'destructive'}>
                        <div>
                            Last sync execution failed for the following sync
                            {syncs.filter((sync) => sync.active_logs?.log_id).length > 1 ? 's' : ''}:{' '}
                            {syncs
                                .filter((sync) => sync.active_logs?.log_id)
                                .map((sync, index) => (
                                    <Fragment key={sync.name}>
                                        {sync.name} (
                                        <Link className="underline" to={getLogsUrl({ env, operationId: sync.active_logs?.log_id, syncs: sync.name })}>
                                            logs
                                        </Link>
                                        ){index < syncs.filter((sync) => sync.active_logs?.log_id).length - 1 && ', '}
                                    </Fragment>
                                ))}
                            .
                        </div>
                    </Info>
                </div>
            )}

            {!slackIsConnected && !isHosted() && (
                <Info className="mt-4">
                    <div className="flex text-sm items-center">
                        <IntegrationLogo provider="slack" height={6} width={6} classNames="flex mr-2" />
                        Receive instant monitoring alerts on Slack.{' '}
                        <button
                            disabled={slackIsConnecting}
                            onClick={createSlackConnection}
                            className={`ml-1 ${!slackIsConnecting ? 'cursor-pointer underline' : 'text-text-light-gray'}`}
                        >
                            Set up now for the {env} environment.
                        </button>
                    </div>
                </Info>
            )}

            <section className="mt-10">
                {activeTab === Tabs.Syncs && (
                    <Syncs
                        syncs={syncs}
                        connection={connectionResponse.connection}
                        provider={connectionResponse.provider}
                        reload={reload}
                        loaded={loaded}
                        syncLoaded={!syncLoading}
                    />
                )}
                {activeTab === Tabs.Authorization && (
                    <Authorization connection={connectionResponse.connection} forceRefresh={forceRefresh} loaded={loaded} syncLoaded={!syncLoading} />
                )}
            </section>
            <Helmet>
                <style>{'.no-border-modal footer { border-top: none !important; }'}</style>
            </Helmet>
        </DashboardLayout>
    );
}
