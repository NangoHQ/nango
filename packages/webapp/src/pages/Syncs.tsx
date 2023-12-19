import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from '@geist-ui/icons';
import { Tooltip, useModal, Modal } from '@geist-ui/core';
import { BoltIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';
import { useGetAllSyncsAPI } from '../utils/api';
import { Sync } from '../types';
import { formatDateToUSFormat } from '../utils/utils';
import Info from '../components/ui/Info'
import { isLocal, isCloud } from '../utils/utils';
import Button from '../components/ui/button/Button';

import { useStore } from '../store';


export default function Syncs() {
    const [loaded, setLoaded] = useState(false);
    const [syncs, setSyncs] = useState<Sync[]>([]);
    const [currentTab, setCurrentTab] = useState<'action' | 'sync'>('sync');
    const [hasFlows, setFlows] = useState(false);
    const [selectedFlowToDelete, setSelectedFlowToDelete] = useState<Sync | null>(null);
    const getSyncsAPI = useGetAllSyncsAPI();
    const { setVisible, bindings } = useModal()

    const env = useStore(state => state.cookieValue);

    useEffect(() => {
        setLoaded(false);
    }, [env]);

    useEffect(() => {
        const getSyncs = async () => {
            let res = await getSyncsAPI();

            if (res?.status === 200) {
                let data = await res.json();
                setSyncs(data.syncs);
                setFlows(data.flows && Object.keys(data.flows).length > 0)
            }
        };

        if (!loaded) {
            setLoaded(true);
            getSyncs();
        }
    }, [getSyncsAPI, loaded, setLoaded]);

    const downloadFlow = async (sync: Sync) => {
        const flowInfo = {
            id: sync.id,
            name: sync.sync_name,
            provider: sync.provider,
            is_public: sync.is_public
        };

        const response = await fetch('/api/v1/flow/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(flowInfo)
        });

        if (response.status !== 200) {
            const error = await response.json();
            toast.error(error.error, {
                position: toast.POSITION.BOTTOM_CENTER
            });
            return;
        } else {
            toast.success('Integration files downloaded successfully', {
                position: toast.POSITION.BOTTOM_CENTER
            });
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'nango-integrations.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    const onDeletePreBuilt = async () => {
        const connections = selectedFlowToDelete?.connections?.map((connection) => connection.connection_id).join(',');
        const res = await fetch(`/api/v1/flow/${selectedFlowToDelete?.id}?sync_name=${selectedFlowToDelete?.sync_name}&connectionIds=${connections}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
        });

        if (res.status === 204) {
            toast.success(`${currentTab} deleted successfully`, {
                position: toast.POSITION.BOTTOM_CENTER
            });
        } else {
            toast.error('Something went wrong', {
                position: toast.POSITION.BOTTOM_CENTER
            });
        }
        setLoaded(false);
        setVisible(false);
    };

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Syncs}>
            <Modal {...bindings} wrapClassName="!w-max overflow-visible">
                <div className="flex justify-between">
                    <div className="flex h-full">
                        <span className="flex bg-red-200 w-10 h-10 rounded-full items-center justify-center">
                            <AlertTriangle className="stroke-red-600" />
                        </span>
                    </div>
                    <div>
                        <Modal.Title className="text-lg">Delete the prebuilt {currentTab}?</Modal.Title>
                        <Modal.Content>
                          <p>This will delete the {selectedFlowToDelete?.sync_name}@{selectedFlowToDelete?.version} {currentTab}.</p>
                        </Modal.Content>
                    </div>
                </div>
                <Modal.Action passive className="!text-lg" onClick={() => setVisible(false)}>Cancel</Modal.Action>
                <Modal.Action className="!bg-red-500 !text-white !text-lg" onClick={() => onDeletePreBuilt()}>Delete</Modal.Action>
            </Modal>
            <div className="px-16 w-fit mx-auto min-w-[1000px] text-sm">
                <div className="flex flex-col text-left">
                    <span className="flex items-center mb-3">
                        <h2 className="flex mt-16 text-left text-3xl font-semibold tracking-tight text-white">{currentTab === 'sync' ? 'Syncs' : 'Actions'}</h2>
                    </span>
                    <span className="flex flex-col text-white mb-4">An overview of all your active sync and action scripts in Nango.</span>
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex inline-flex text-white mb-12 border border-border-gray rounded-md">
                        <span
                            className={`flex items-center justify-center cursor-pointer py-1 px-3 ${currentTab === 'sync' ? 'bg-gray-800' : ''}`}
                            onClick={() => setCurrentTab('sync')}
                        >
                            <RefreshCw className="flex stroke-white mr-2 mb-0.5" size="14" />
                            Syncs
                        </span>
                        <span
                            className={`flex items-center justify-center cursor-pointer py-1 px-3 ${currentTab === 'action' ? 'bg-gray-800' : ''}`}
                            onClick={() => setCurrentTab('action')}
                        >
                            <BoltIcon className="flex h-5 w-4 text-white mr-2 mb-0.5" />
                            Actions
                        </span>
                    </div>
                    {hasFlows && (isCloud() || isLocal()) &&  (
                        <div className="flex">
                            <Link to="/flow/create" className="mt-auto mb-4 pt-2.5 px-4 h-10 rounded-md text-sm text-black bg-white hover:bg-gray-300">
                                Add New
                            </Link>
                        </div>
                    )}
                </div>

                {!isCloud() && !isLocal() ? (
                    <div className="flex pt-8">
                        <Info size={24}>
                            {currentTab === 'action' ? 'Action' : 'Sync'}s are only available for <a href="https://docs.nango.dev/cloud" rel="noreferrer" target="_blank" className="text-[#4E80EE]">Cloud & Enterprise self-hosting</a>.
                        </Info>
                    </div>
                ) : (
                    <>
                        {syncs.filter(sync => sync.type === currentTab).length === 0 && (
                            <div className="flex pt-8">
                                <Info size={24}>
                                    No {currentTab}s yet. Add a new one using <a href="https://docs.nango.dev/integration-templates/overview" className="text-[#4E80EE]" rel="noreferrer" target="_blank">templates</a> or <a href={`https://docs.nango.dev/guides/${currentTab === 'sync' ? 'sync' : 'actions'}`} className="text-[#4E80EE]" rel="noreferrer" target="_blank">build your own</a>.
                                </Info>
                            </div>
                        )}

                        {syncs.filter(sync => sync.type === currentTab).length > 0 && (
                            <div className="border border-border-gray rounded-md h-fit min-w-max pt-6 text-white text-sm">
                                <div className="text-white px-5">
                                    <div className="flex pb-4 items-center border-b border-border-gray">
                                        <span className="w-48">Name</span>
                                        <span className="w-40 ml-2">Integration</span>
                                        {currentTab === 'sync' && <span className="w-28 ml-1">Frequency</span>}
                                        {currentTab === 'sync' && <span className="w-16">Auto Start</span>}
                                        <span className={`w-16 ${currentTab === 'sync' ? 'ml-6' : ''}`}>Models</span>
                                        {currentTab === 'sync' && <span className="w-24">Connections</span>}
                                        <span className="w-36">Last Deployed</span>
                                    </div>
                                </div>
                                {syncs.filter(sync => sync.type === currentTab).map((sync, index) => (
                                    <div key={index} className={`text-white px-5 text-sm  ${syncs.filter(sync => sync.type === currentTab).length > 1 ? 'border-b border-border-gray' : ''}`}>
                                        <div className="flex pb-4 py-6 items-center">
                                            <div className="flex flex-col w-48">
                                                <span>
                                                    {sync.sync_name}@v{sync.version}
                                                </span>
                                                <span className="text-xs text-gray-400">
                                                        {!sync.pre_built && (
                                                            <>Custom</>
                                                        )}
                                                        {sync.pre_built && sync.is_public && (
                                                            <>Template</>
                                                        )}
                                                        {sync.pre_built && !sync.is_public && (
                                                            <>Template (private)</>
                                                        )}
                                                </span>
                                            </div>
                                            <span className={`w-44`}>
                                                <Link to={`/integration/${sync.unique_key}`}>
                                                    {sync?.provider ? (
                                                        <div className="flex ml-2 items-center">
                                                            <img src={`images/template-logos/${sync.provider}.svg`} alt="" className="h-7 mt-0.5" />
                                                            <p className="ml-2 w-44">{sync.unique_key}</p>
                                                        </div>
                                                    ) : (
                                                        <div className="">{sync.unique_key}</div>
                                                    )}
                                                </Link>
                                            </span>
                                            {currentTab === 'sync' && <span className="w-32">{sync.runs || '-'}</span>}
                                            {currentTab === 'sync' && <span className="w-16">{sync.auto_start === true ? 'Y' : 'N'}</span>}
                                            {sync.models ? (
                                                <Tooltip text={sync.models.join(', ')} type="dark">
                                                    <span className={`block ${currentTab === 'sync' ? 'w-12 ml-4' : 'w-12'} mr-2`}>{sync.models.length}</span>
                                                </Tooltip>
                                            ) : (
                                                <span className="w-24 ml-4 mr-2">-</span>
                                            )}
                                            {currentTab === 'sync' && (
                                                <Tooltip
                                                    text={
                                                        sync.connections === null
                                                            ? ''
                                                            : sync.connections.slice(0, 20).map((connection, index: number) => (
                                                                  <span key={connection.connection_id}>
                                                                      <Link to={`/connections/${sync.unique_key}/${connection.connection_id}#sync`}>
                                                                          {connection.connection_id}
                                                                      </Link>
                                                                      {sync.connections && index < sync?.connections?.length - 1 ? ', ' : ''}
                                                                  </span>
                                                              ))
                                                    }
                                                    type="dark"
                                                >
                                                    <span className="w-12 ml-6 mr-16">{sync.connections === null ? 0 : sync.connections.length}</span>
                                                </Tooltip>
                                            )}
                                            <span className="text-gray-500 mr-4">{formatDateToUSFormat(sync.updated_at)}</span>
                                            <Button type="button" variant="secondary" onClick={() => downloadFlow(sync)}>Download</Button>
                                            {sync.pre_built ? (
                                                <Button type="button" variant="danger" className="ml-1.5"
                                                    onClick={() => {
                                                        setSelectedFlowToDelete(sync)
                                                        setVisible(true)
                                                    }}
                                                >
                                                    Delete
                                                </Button>
                                            ) : (
                                                <Tooltip type="dark" text={`To delete a custom sync use the nango cli and remove the ${currentTab} entry.`}>
                                                    <Button type="button" variant="danger" className="ml-1.5" disabled>Delete</Button>
                                                </Tooltip>
                                            )}
                                        </div>
                                        {sync.metadata && sync.metadata.description && (
                                            <div className="text-xs text-gray-400 mb-3 max-w-2xl">
                                                <span className="font-bold">Description:</span> {sync.metadata.description}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}
