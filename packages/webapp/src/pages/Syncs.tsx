import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Slash, RefreshCw } from '@geist-ui/icons';
import { BoltIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../layout/DashboardLayout';
import { Tooltip } from '@geist-ui/core';
import { LeftNavBarItems } from '../components/LeftNavBar';
import { useGetAllSyncsAPI } from '../utils/api';
import { Sync } from '../types';
import { formatDateToUSFormat } from '../utils/utils';

import { useStore } from '../store';


export default function Syncs() {
    const [loaded, setLoaded] = useState(false);
    const [syncs, setSyncs] = useState<Sync[]>([]);
    const [currentTab, setCurrentTab] = useState<'action' | 'sync'>('sync');
    const getSyncsAPI = useGetAllSyncsAPI();

    const env = useStore(state => state.cookieValue);

    useEffect(() => {
        setLoaded(false);
    }, [env]);

    useEffect(() => {
        const getSyncs = async () => {
            let res = await getSyncsAPI();

            if (res?.status === 200) {
                let data = await res.json();
                setSyncs(data);
            }
        };

        if (!loaded) {
            setLoaded(true);
            getSyncs();
        }
    }, [getSyncsAPI, loaded, setLoaded]);

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Syncs}>
            <div className="px-16 w-fit mx-auto">
                <div className="flex flex-col text-left">
                    <span className="flex items-center mb-3">
                        <h2 className="flex mt-16 text-left text-3xl font-semibold tracking-tight text-white">{currentTab === 'sync' ? 'Syncs' : 'Actions'}</h2>
                    </span>
                    <span className="flex flex-col text-white mb-4">An overview of all your active sync and action scripts in Nango.</span>
                </div>
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

                <div className="border border-border-gray rounded-md h-fit min-w-max pt-6 text-white text-sm">
                    <div className="text-white px-5">
                        <div className="flex pb-4 items-center text-lg border-b border-border-gray">
                            <span className="w-60">Name</span>
                            <span className="w-48 ml-2">Integration</span>
                            {currentTab === 'sync' && <span className="w-24">Frequency</span>}
                            <span className="w-24 ml-8">Models</span>
                            {currentTab === 'sync' && <span className="w-36">Connections</span>}
                            <span className="w-36">Last Deployed</span>
                        </div>
                    </div>
                    {syncs.length === 0 && (
                        <div className="flex items-center px-5 pt-8 pb-7">
                            <Slash className="stroke-red-500" />
                            <div className="text-white ml-3">
                                No Syncs yet! Interested in syncing data with Nango? Request access on the{' '}
                                <a href="https://nango.dev/slack" className="text-blue-500" target="_blank" rel="noreferrer">
                                    community
                                </a>
                                .
                            </div>
                        </div>
                    )}
                    {syncs.length > 0 && (
                        <>
                            {syncs.filter(sync => sync.type === currentTab).map((sync, index) => (
                                <div key={index} className="text-white px-5">
                                    <div className="flex pb-4 text-base py-6 items-center border-b border-border-gray">
                                        <span className="w-60">
                                            {sync.sync_name}@v{sync.version}
                                        </span>
                                        <span className={`${sync.type === 'sync' ? 'w-48' : 'w-60'}`}>
                                            <Link to={`/integration/${sync.unique_key}`}>
                                                {sync?.provider ? (
                                                    <div className="flex ml-2">
                                                        <img src={`images/template-logos/${sync.provider}.svg`} alt="" className="h-7 mt-0.5" />
                                                        <p className="mt-1.5 ml-2 w-44">{sync.unique_key}</p>
                                                    </div>
                                                ) : (
                                                    <div className="">{sync.unique_key}</div>
                                                )}
                                            </Link>
                                        </span>
                                        {currentTab === 'sync' && <span className="w-36">{sync.runs || '-'}</span>}
                                        {sync.models ? (
                                            <Tooltip text={sync.models.join(', ')} type="dark">
                                                <span className="block w-16 ml-4 mr-2">{sync.models.length}</span>
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
                                                <span className="w-12 ml-6 mr-28">{sync.connections === null ? 0 : sync.connections.length}</span>
                                            </Tooltip>
                                        )}
                                        <span className="text-gray-500">{formatDateToUSFormat(sync.updated_at)}</span>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
