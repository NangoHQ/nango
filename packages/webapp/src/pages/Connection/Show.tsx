import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { useModal } from '@geist-ui/core';
import type React from 'react';
import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useSWRConfig } from 'swr';

import { LeftNavBarItems } from '../../components/LeftNavBar';
import ActionModal from '../../components/ui/ActionModal';
import { TrashIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../layout/DashboardLayout';
import { Info } from '../../components/Info';
import IntegrationLogo from '../../components/ui/IntegrationLogo';
import Button from '../../components/ui/button/Button';
import { useEnvironment } from '../../hooks/useEnvironment';
import { Syncs } from './Syncs';
import { Authorization } from './Authorization';
import { isHosted } from '../../utils/utils';
import { connectSlack } from '../../utils/slack-connection';

import { useStore } from '../../store';
import { getLogsUrl } from '../../utils/logs';
import { apiDeleteConnection, useConnection } from '../../hooks/useConnections';
import { useLocalStorage } from 'react-use';
import { Skeleton } from '../../components/ui/Skeleton';
import { useSyncs } from '../../hooks/useSyncs';
import { ErrorPageComponent } from '../../components/ErrorComponent';
import { AvatarCustom } from '../../components/AvatarCustom';

export enum Tabs {
    Syncs,
    Authorization
}

export const ConnectionShow: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { setVisible, bindings } = useModal();
    const { mutate } = useSWRConfig();
    const { connectionId, providerConfigKey } = useParams();
    const [showSlackBanner, setShowSlackBanner] = useLocalStorage(`nango:connection:slack_banner_show`, true);

    const env = useStore((state) => state.env);

    const { environmentAndAccount, mutate: environmentMutate } = useEnvironment(env);

    const [slackIsConnecting, setSlackIsConnecting] = useState(false);
    const [forceRefresh, setForceRefresh] = useState<'true' | 'false'>('false');
    const [modalShowSpinner, setModalShowSpinner] = useState(false);
    const [activeTab, setActiveTab] = useState<Tabs>(Tabs.Syncs);
    const [slackIsConnected, setSlackIsConnected] = useState(true);
    const {
        data: connection,
        error,
        loading
    } = useConnection({ env, provider_config_key: providerConfigKey!, force_refresh: forceRefresh }, { connectionId: connectionId! });
    const { data: syncs, error: errorSyncs, loading: loadingSyncs } = useSyncs({ env, provider_config_key: providerConfigKey!, connection_id: connectionId! });

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

    const deleteButtonClicked = async () => {
        if (!connectionId || !providerConfigKey) return;

        setModalShowSpinner(true);
        const res = await apiDeleteConnection({ connectionId }, { provider_config_key: providerConfigKey, env });
        setModalShowSpinner(false);

        if (res.res.status === 200) {
            toast.success('Connection deleted!', { position: toast.POSITION.BOTTOM_CENTER });
            void mutate((key) => typeof key === 'string' && key.startsWith('/api/v1/connections'), undefined);
            navigate(`/${env}/connections`, { replace: true });
        } else {
            toast.error('Failed to delete connection', { position: toast.POSITION.BOTTOM_CENTER });
        }
    };

    const createSlackConnection = async () => {
        setSlackIsConnecting(true);
        if (!environmentAndAccount) return;
        const { uuid: accountUUID, host: hostUrl } = environmentAndAccount;
        const onFinish = () => {
            void environmentMutate();
            toast.success('Slack connection created!', { position: toast.POSITION.BOTTOM_CENTER });
            setSlackIsConnecting(false);
        };

        const onFailure = () => {
            toast.error('Failed to create Slack connection!', { position: toast.POSITION.BOTTOM_CENTER });
            setSlackIsConnecting(false);
        };
        await connectSlack({ accountUUID, env, hostUrl, onFinish, onFailure });
    };

    if (loading || loadingSyncs) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
                <div className="flex gap-4 justify-between">
                    <div className="flex gap-6">
                        <div className="shrink-0">
                            <div className="w-[80px] h-[80px] p-5 border border-border-gray rounded-xl">
                                <Skeleton className="w-[40px] h-[40px]" />
                            </div>
                        </div>
                        <div className="my-3 flex flex-col gap-4">
                            <div className="text-left text-lg font-semibold text-gray-400">
                                <Skeleton className="w-[150px]" />
                            </div>
                            <div className="flex gap-4 items-center">
                                <Skeleton className="w-[250px]" />
                            </div>
                        </div>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    if (error) {
        return <ErrorPageComponent error={error || errorSyncs} page={LeftNavBarItems.TeamSettings} />;
    }

    if (!connection || !syncs) {
        return null;
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
                        <div className="relative">
                            <Link to={`/${env}/integrations/${connection.connection.provider_config_key}`}>
                                <div className="shrink-0">
                                    <div className="w-[80px] h-[80px] p-4 border border-border-gray rounded-xl">
                                        {connection.provider && <IntegrationLogo provider={connection.provider} height={16} width={16} />}
                                    </div>
                                </div>
                            </Link>

                            <div className="absolute -bottom-3 -right-3">
                                <AvatarCustom
                                    size={'sm'}
                                    displayName={
                                        connection.endUser ? connection.endUser.displayName || connection.endUser.email : connection.connection.connection_id
                                    }
                                />
                            </div>
                        </div>

                        <div className="mt-3">
                            <span className="font-semibold tracking-tight text-gray-400">Connection</span>
                            {connection.endUser ? (
                                <div className="flex flex-col overflow-hidden">
                                    <h2 className="text-3xl font-semibold tracking-tight text-white break-all -mt-2">{connection.endUser.email}</h2>

                                    <div className="text-dark-500 text-xs font-code flex gap-2">
                                        {connection.endUser.displayName && <span>{connection.endUser.displayName}</span>}
                                        {connection.endUser.organization?.displayName && <span>({connection.endUser.organization?.displayName})</span>}
                                    </div>
                                </div>
                            ) : (
                                <h2 className="text-3xl font-semibold tracking-tight text-white break-all -mt-2">{connectionId}</h2>
                            )}
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
                        {syncs.some((sync) => sync.active_logs?.log_id) && <span className="ml-2 bg-red-base h-1.5 w-1.5 rounded-full inline-block"></span>}
                    </li>
                    <li
                        className={`flex items-center p-2 rounded ${activeTab === Tabs.Authorization ? 'bg-active-gray text-white' : 'hover:bg-hover-gray'}`}
                        onClick={() => setActiveTab(Tabs.Authorization)}
                    >
                        Authorization
                        {connection.errorLog && <span className="ml-2 bg-red-base h-1.5 w-1.5 rounded-full inline-block"></span>}
                    </li>
                </ul>
            </section>

            {activeTab === Tabs.Authorization && connection.errorLog && (
                <div className="flex my-4">
                    <Info variant={'destructive'}>
                        <div>
                            There was an error refreshing the credentials
                            <Link
                                to={getLogsUrl({
                                    env,
                                    operationId: connection.errorLog.log_id,
                                    connections: connection.connection.connection_id,
                                    day: connection.errorLog?.created_at
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
                                    <div key={sync.name}>
                                        {sync.name} (
                                        <Link className="underline" to={getLogsUrl({ env, operationId: sync.active_logs?.log_id, syncs: sync.name })}>
                                            logs
                                        </Link>
                                        ){index < syncs.filter((sync) => sync.active_logs?.log_id).length - 1 && ', '}
                                    </div>
                                ))}
                            .
                        </div>
                    </Info>
                </div>
            )}

            {!slackIsConnected && !isHosted() && showSlackBanner && (
                <Info className="mt-4" onClose={() => setShowSlackBanner(false)} icon={<IntegrationLogo provider="slack" height={6} width={6} />}>
                    Receive instant monitoring alerts on Slack.{' '}
                    <button
                        disabled={slackIsConnecting}
                        onClick={createSlackConnection}
                        className={`ml-1 ${!slackIsConnecting ? 'cursor-pointer underline' : 'text-text-light-gray'}`}
                    >
                        Set up now for the {env} environment.
                    </button>
                </Info>
            )}

            <section className="mt-10">
                {activeTab === Tabs.Syncs && <Syncs syncs={syncs} connection={connection.connection} provider={connection.provider} />}
                {activeTab === Tabs.Authorization && <Authorization connection={connection.connection} forceRefresh={() => setForceRefresh('true')} />}
            </section>
            <Helmet>
                <style>{'.no-border-modal footer { border-top: none !important; }'}</style>
            </Helmet>
        </DashboardLayout>
    );
};
