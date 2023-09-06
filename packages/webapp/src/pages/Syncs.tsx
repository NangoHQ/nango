import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Slash, RefreshCw } from '@geist-ui/icons';
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
                        <h2 className="flex mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Syncs</h2>
                        <Tooltip text="Refresh logs" type="dark">
                            <RefreshCw className="flex stroke-white cursor-pointer mt-4 ml-5" size="24" onClick={() => setLoaded(false)} />
                        </Tooltip>
                    </span>
                </div>
                <div className="border border-border-gray rounded-md h-fit pt-6 text-white text-sm">
                    <div className="text-white px-5">
                        <ul className="flex space-x-20 pb-4 items-center text-lg border-b border-border-gray">
                            <li className="w-32">Name</li>
                            <li className="w-40">Integration</li>
                            <li className="w-24">Frequency</li>
                            <li>Models</li>
                            <li>Connections</li>
                            <li>Last Modified</li>
                        </ul>
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
                            {syncs.map((sync: Sync, index: number) => (
                                <div key={index} className="text-white px-5">
                                    <ul className="flex space-x-20 pb-4 text-base py-6 items-center border-b border-border-gray">
                                        <li className="w-32 mr-2">
                                            {sync.sync_name}@v{sync.version}
                                        </li>
                                        <li>
                                            <Link to={`/integration/${sync.unique_key}`}>
                                                {sync?.provider ? (
                                                    <div className="flex">
                                                        <img src={`images/template-logos/${sync.provider}.svg`} alt="" className="h-7 mt-0.5" />
                                                        <p className="mt-1.5 ml-2 w-44">{sync.unique_key}</p>
                                                    </div>
                                                ) : (
                                                    <div className="w-44">{sync.unique_key}</div>
                                                )}
                                            </Link>
                                        </li>
                                        <Tooltip text={sync.type === 'action' ? 'Sync actions are intended to run by a specific trigger instead of on a schedule.' : 'Scheduled:'} type="dark">
                                            <li className="w-28">{sync.runs || '-'}</li>
                                        </Tooltip>
                                        <Tooltip text={sync.models.join(', ')} type="dark">
                                            <li className="w-12 ml-4 mr-2">{sync.models.length}</li>
                                        </Tooltip>
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
                                            <li className="w-12 ml-6">{sync.connections === null ? 0 : sync.connections.length}</li>
                                        </Tooltip>
                                        <li className="text-gray-500">{formatDateToUSFormat(sync.updated_at)}</li>
                                    </ul>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
