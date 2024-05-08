import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Loading, useModal, Modal } from '@geist-ui/core';
import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import useSWR, { useSWRConfig } from 'swr';

import { requestErrorToast, swrFetcher, useGetConnectionDetailsAPI, useDeleteConnectionAPI } from '../../utils/api';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import ActionModal from '../../components/ui/ActionModal';
import { TrashIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../layout/DashboardLayout';
import Info from '../../components/ui/Info';
import IntegrationLogo from '../../components/ui/IntegrationLogo';
import Button from '../../components/ui/button/Button';
import Syncs from './Syncs';
import Authorization from './Authorization';
import type { SyncResponse, Connection } from '../../types';
import PageNotFound from '../PageNotFound';

import { useStore } from '../../store';

export enum Tabs {
    Syncs,
    Authorization
}

export default function ShowIntegration() {
    const { mutate } = useSWRConfig();
    const env = useStore((state) => state.env);

    const [loaded, setLoaded] = useState(false);
    const [connection, setConnection] = useState<Connection | null>(null);
    const [, setFetchingRefreshToken] = useState(false);
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [modalShowSpinner, setModalShowSpinner] = useState(false);
    const [pageNotFound, setPageNotFound] = useState(false);
    const [activeTab, setActiveTab] = useState<Tabs>(Tabs.Syncs);
    const getConnectionDetailsAPI = useGetConnectionDetailsAPI(env);
    const deleteConnectionAPI = useDeleteConnectionAPI(env);

    const navigate = useNavigate();
    const location = useLocation();
    const { setVisible, bindings } = useModal();
    const { setVisible: setErrorVisible, bindings: errorBindings } = useModal();
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
        if (location.hash === '#models' || location.hash === '#syncs') {
            setActiveTab(Tabs.Syncs);
        }
        if (location.hash === '#authorization') {
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
                const data = await res.json();
                const connection = data['connection'];
                setConnection({ ...connection, connection_id: connectionId });
            } else if (res != null) {
                setServerErrorMessage(`
We could not retrieve and/or refresh your access token due to the following error:
\n\n${(await res.json()).error}
`);
                setConnection({
                    providerConfigKey,
                    connection_id: connectionId
                } as Connection);
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
            const data = await res.json();
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

    if (pageNotFound) {
        return <PageNotFound />;
    }

    if (!loaded || syncLoading) {
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
            <Modal {...errorBindings} wrapClassName="!h-[600px] !w-[550px] !max-w-[550px] !bg-[#0E1014] no-border-modal">
                <div className="flex justify-between text-sm">
                    <div>
                        <Modal.Content className="overflow-scroll max-w-[550px] !text-sm text-white font-mono">{serverErrorMessage}</Modal.Content>
                    </div>
                </div>
                <Modal.Action
                    placeholder={null}
                    passive
                    className="!flex !justify-end !text-sm !bg-[#0E1014] !border-0 !h-[100px]"
                    onClick={() => setErrorVisible(false)}
                >
                    <Button className="!text-text-light-gray" variant="zombieGray">
                        Close
                    </Button>
                </Modal.Action>
            </Modal>
            <div className="mx-auto">
                <div className="flex gap-4 justify-between">
                    <div className="flex gap-6">
                        <Link to={`/${env}/integration/${connection?.providerConfigKey}`}>
                            {connection?.provider && (
                                <IntegrationLogo
                                    provider={connection.provider}
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
                        className={`p-2 rounded ${activeTab === Tabs.Syncs ? 'bg-active-gray text-white' : 'hover:bg-hover-gray'}`}
                        onClick={() => setActiveTab(Tabs.Syncs)}
                    >
                        Syncs
                    </li>
                    <li
                        className={`p-2 rounded ${activeTab === Tabs.Authorization ? 'bg-active-gray text-white' : 'hover:bg-hover-gray'}`}
                        onClick={() => setActiveTab(Tabs.Authorization)}
                    >
                        Authorization
                    </li>
                </ul>
            </section>

            {serverErrorMessage && (
                <div className="flex my-12">
                    <Info size={14} padding="px-4 py-1.5" color="red">
                        There was an error refreshing the credentials{' '}
                        <span onClick={() => setErrorVisible(true)} className="cursor-pointer text-white underline">
                            (show details)
                        </span>
                        .
                    </Info>
                </div>
            )}

            <section className="mt-10">
                {activeTab === Tabs.Syncs && (
                    <Syncs syncs={syncs} connection={connection} reload={reload} loaded={loaded} syncLoaded={!syncLoading} env={env} />
                )}
                {activeTab === Tabs.Authorization && (
                    <Authorization connection={connection} forceRefresh={forceRefresh} loaded={loaded} syncLoaded={!syncLoading} />
                )}
            </section>
            <Helmet>
                <style>{'.no-border-modal footer { border-top: none !important; }'}</style>
            </Helmet>
        </DashboardLayout>
    );
}
