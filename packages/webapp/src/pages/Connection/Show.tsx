import { useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { useNavigate, useLocation } from 'react-router';
import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useModal } from '@geist-ui/core';

import { useGetConnectionDetailsAPI, useDeleteConnectionAPI, useGetSyncAPI } from '../../utils/api';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import ActionModal from '../../components/ui/ActionModal';
import { TrashIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../layout/DashboardLayout';
import IntegrationLogo from '../../components/ui/IntegrationLogo';
import Button from '../../components/ui/button/Button';
import Syncs from './Syncs';
import Authorization from './Authorization';
import { SyncResponse, Connection } from '../../types';

export enum Tabs {
    Models,
    Authorization
}

export default function ShowIntegration() {
    const [loaded, setLoaded] = useState(false);
    const [connection, setConnection] = useState<Connection | null>(null);
    const [syncs, setSyncs] = useState<SyncResponse[] | null>(null);
    const [syncLoaded, setSyncLoaded] = useState(false);
    const [fetchingRefreshToken, setFetchingRefreshToken] = useState(false);
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [modalShowSpinner, setModalShowSpinner] = useState(false);
    const [activeTab, setActiveTab] = useState<Tabs>(Tabs.Models);
    const getConnectionDetailsAPI = useGetConnectionDetailsAPI();
    const deleteConnectionAPI = useDeleteConnectionAPI();
    const getSyncAPI = useGetSyncAPI();

    const navigate = useNavigate();
    const location = useLocation();
    const { setVisible, bindings } = useModal();
    const { connectionId, providerConfigKey } = useParams();

    useEffect(() => {
        if (location.hash === '#models' || location.hash === '#syncs') {
            setActiveTab(Tabs.Models);
        }
        if (location.hash === '#authorization') {
            setActiveTab(Tabs.Authorization);
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

    const deleteButtonClicked = async () => {
        if (!connectionId || !providerConfigKey) return;

        setModalShowSpinner(true);
        const res = await deleteConnectionAPI(connectionId, providerConfigKey);
        setModalShowSpinner(false);

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

    console.log(serverErrorMessage, fetchingRefreshToken);

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
            {connection?.provider && (
                <div className="mx-auto">
                    <div className="flex justify-between items-center">
                        <div className="flex">
                            <Link to={`/integration/${connection?.providerConfigKey}`}>
                                <IntegrationLogo provider={connection?.provider} height={24} width={24} classNames="mr-2 cursor-pointer" />
                            </Link>
                            <div className="mt-3 ml-6">
                                <span className="text-left text-2xl font-semibold tracking-tight text-gray-400 mb-12">
                                    Connection
                                </span>
                                <h2 className="text-left text-3xl font-semibold tracking-tight text-white">
                                    {connectionId}
                                </h2>
                            </div>
                        </div>
                        <Button
                            variant="zinc"
                            size="sm"
                            className="flex cursor-pointer text-gray-400 neutral-700 items-center"
                            onClick={() => {
                                setVisible(true)
                            }}
                            >
                            <TrashIcon  className="flex h-5 w-5" />
                            <span className="px-1">Delete</span>
                        </Button>
                    </div>
                </div>
            )}
            <section className="mt-20">
                <ul className="flex text-gray-400 space-x-8 text-sm cursor-pointer">
                    <li className={`p-2 rounded ${activeTab === Tabs.Models ? 'bg-zinc-900 text-white' : 'hover:bg-gray-700'}`} onClick={() => setActiveTab(Tabs.Models)}>Models</li>
                    <li className={`p-2 rounded ${activeTab === Tabs.Authorization ? 'bg-zinc-900 text-white' : 'hover:bg-gray-700'}`} onClick={() => setActiveTab(Tabs.Authorization)}>Authorization</li>
                </ul>
            </section>
            <section className="mt-10">
                {activeTab === Tabs.Models && (
                    <Syncs syncs={syncs} connection={connection} setSyncLoaded={setSyncLoaded} loaded={loaded} syncLoaded={syncLoaded} />
                )}
                {activeTab === Tabs.Authorization && (
                    <Authorization connection={connection} forceRefresh={forceRefresh} loaded={loaded} syncLoaded={syncLoaded} />
                )}
            </section>
        </DashboardLayout>
    );
}
