import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

import { useGetConnectionListAPI } from '../utils/api';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';

import { useStore } from '../store';

interface Connection {
    id: number;
    connection_id: string;
    provider: string;
    provider_config_key: number;
    created: string;
}

export default function ConnectionList() {
    const [loaded, setLoaded] = useState(false);
    const [connections, setConnections] = useState<Connection[] | null>(null);
    const getConnectionListAPI = useGetConnectionListAPI();

    const env = useStore(state => state.cookieValue);

    useEffect(() => {
        setLoaded(false);
    }, [env]);

    useEffect(() => {
        const getConnections = async () => {
            let res = await getConnectionListAPI();

            if (res?.status === 200) {
                let data = await res.json();
                setConnections(data['connections']);
            }
        };

        if (!loaded) {
            setLoaded(true);
            getConnections();
        }
    }, [getConnectionListAPI, loaded, setLoaded]);

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
            {connections && !!connections.length && (
                <div className="px-16 w-fit mx-auto">
                    <div className="flex justify-between">
                        <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Connections</h2>
                        <Link to="/connections/create" className="mt-auto mb-4 pt-2.5 px-4 h-10 rounded-md text-sm text-black bg-white hover:bg-gray-300">
                            Add New
                        </Link>
                    </div>
                    <div className="h-fit border border-border-gray rounded-md text-white text-sm">
                        <table className="table-auto">
                            <tbody className="px-4">
                                {connections.map(({ id, connection_id: connectionId, provider, provider_config_key: providerConfigKey, created: creationDate }) => (
                                    <tr key={`tr-${id}`}>
                                        <td
                                            className={`mx-8 flex place-content-center ${
                                                id !== connections.at(-1)?.id ? 'border-b border-border-gray' : ''
                                            } h-16`}
                                        >
                                            <div className="mt-5 w-largecell text-t font-mono">`{connectionId}`</div>
                                            <div className="mt-4 w-80 flex pl-8">
                                                <img src={`images/template-logos/${provider}.svg`} alt="" className="h-7 mt-0.5 mr-0.5" />
                                                <p className="mt-1.5 mr-4 ml-0.5">{providerConfigKey}</p>
                                            </div>
                                            <div className="pl-8 flex pt-4">
                                                <p className="mt-1.5 mr-4 text-text-dark-gray">{new Date(creationDate).toLocaleDateString()}</p>
                                                <Link
                                                    to={`/connections/${encodeURIComponent(providerConfigKey)}/${encodeURIComponent(connectionId)}`}
                                                    className="flex h-8 rounded-md pl-2 pr-3 pt-1.5 text-sm text-white bg-gray-800 hover:bg-gray-700"
                                                >
                                                    <p>View</p>
                                                </Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {connections && !!!connections.length && (
                <div className="mx-auto">
                    <div className="mx-16">
                        <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Connections</h2>
                        <div className="text-sm w-largebox h-40">
                            <Link to="/connections/create" className="py-3 px-4 rounded-md text-sm text-black bg-white hover:bg-gray-300">
                                Add your 1st Connection
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
