import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';

import { useGetConnectionListAPI } from '../utils/api';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';
import { XCircleIcon } from '@heroicons/react/24/outline';
import { ChevronsLeft } from '@geist-ui/icons';
import { useStore } from '../store';
import queryString from 'query-string';

interface Connection {
    id: number;
    connection_id: string;
    provider: string;
    provider_config_key: number;
    created: string;
}

export default function ConnectionList() {
    const navigate = useNavigate();
    const [loaded, setLoaded] = useState(false);
    const [limit] = useState(20);
    const [offset, setOffset] = useState(0);
    const [selectedIntegration, setSelectedIntegration] = useState<string>('');
    const location = useLocation();
    const queryParams = queryString.parse(location.search);
    const [filtersFetched, setFiltersFetched] = useState(false);
    const [integrations, setIntegrations] = useState<string[]>([]);
    const [connections, setConnections] = useState<Connection[]>([]);
    const initialOffset: string | (string | null)[] | null = queryParams.offset;
    const initialIntegration: string | (string | null)[] | null = queryParams.integration;
    const getConnectionListAPI = useGetConnectionListAPI();

    const env = useStore((state) => state.cookieValue);

    useEffect(() => {
        setLoaded(false);
    }, [env]);

    useEffect(() => {
        const getConnections = async () => {
            let queryOffset = offset;
            if (initialOffset && typeof initialOffset === 'string') {
                setOffset(parseInt(initialOffset));
                queryOffset = parseInt(initialOffset);
            }
            let queryIntegration = selectedIntegration;
            if (initialIntegration && typeof initialIntegration === 'string') {
                setSelectedIntegration(initialIntegration);
                queryIntegration = initialIntegration;
            }
            let res = await getConnectionListAPI(limit, queryOffset, queryIntegration);

            if (res?.status === 200) {
                let data = await res.json();
                setConnections(data['connections']);
            }
        };

        if (!loaded) {
            setLoaded(true);
            getConnections();
        }
    }, [getConnectionListAPI, loaded, setLoaded, limit, offset, selectedIntegration, initialIntegration, initialOffset]);

    useEffect(() => {
        const getFilters = async () => {
            if (connections.length > 0) {
                const res = await fetch(`/api/v1/connection-filters/`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json'
                    }
                });

                if (res?.status === 200) {
                    try {
                        const filters = await res.json();

                        if (filters) {
                            if (filters?.integrations.length > 0) {
                                filters.integrations.sort((a: string, b: string) => a.localeCompare(b));
                                setIntegrations(filters.integrations);
                            }
                        }
                        setFiltersFetched(true);
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        };

        if (!filtersFetched) {
            getFilters();
        }
    }, [connections, filtersFetched, setFiltersFetched]);

    const decrementPage = () => {
        if (offset - limit >= 0) {
            const newOffset = offset - limit;
            setOffset(newOffset);
            setLoaded(false);

            navigate(location.pathname + '?' + queryString.stringify({ ...queryParams, offset: newOffset }));
        }
    };

    const incrementPage = () => {
        if (connections.length < limit) {
            return;
        }

        const newOffset = offset + limit;
        setOffset(newOffset);
        setLoaded(false);

        navigate(location.pathname + '?' + queryString.stringify({ ...queryParams, offset: newOffset }));
    };

    const resetOffset = () => {
        setOffset(0);
        setLoaded(false);

        navigate(location.pathname + '?' + queryString.stringify({ ...queryParams, offset: 0 }));
    };

    const onRemoveFilter = (action: (val: string) => void, prop: string) => {
        action('');
        setLoaded(false);
        const url = window.location.pathname;
        const searchParams = new URLSearchParams(window.location.search);
        searchParams.delete(prop);

        const updatedUrl = url + '?' + searchParams.toString();
        navigate(updatedUrl);
    };

    const handleIntegrationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        setSelectedIntegration(value);
        setLoaded(false);
        setOffset(0);
        navigate(location.pathname + '?' + queryString.stringify({ integration: value }));
    };

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
                    {loaded && connections.length === 0 && !selectedIntegration ? null : (
                        <div className="flex justify-between p-3 mb-6 items-center border border-border-gray rounded-md min-w-[1150px]">
                            <div className="flex space-x-10 justify-between px-2 w-full">
                                {integrations.length > 0 && (
                                    <div className="flex w-full items-center">
                                        <select
                                            id="integration"
                                            name="integration"
                                            className="bg-bg-black border-none text-text-light-gray block w-full appearance-none py-2 text-base shadow-sm"
                                            onChange={handleIntegrationChange}
                                            value={selectedIntegration}
                                        >
                                            <option value="" disabled>
                                                Integration
                                            </option>
                                            {integrations.map((integration: string) => (
                                                <option key={integration} value={integration}>
                                                    {integration}
                                                </option>
                                            ))}
                                        </select>
                                        {selectedIntegration && (
                                            <XCircleIcon
                                                onClick={() => onRemoveFilter(setSelectedIntegration, 'integration')}
                                                className="flex h-7 h-7 cursor-pointer text-blue-400"
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="flex">
                                {offset >= limit * 3 && <ChevronsLeft onClick={resetOffset} className="flex stroke-white cursor-pointer mr-3" size="16" />}
                                <span
                                    onClick={decrementPage}
                                    className={`flex ${
                                        offset - limit >= 0 ? 'cursor-pointer hover:bg-gray-700' : ''
                                    } h-8 mr-2 rounded-md px-3 pt-1.5 text-sm text-white bg-gray-800`}
                                >
                                    <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                                        <path
                                            fillRule="evenodd"
                                            d="M7.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l2.293 2.293a1 1 0 010 1.414z"
                                            clipRule="evenodd"
                                        ></path>
                                    </svg>
                                </span>
                                <span
                                    onClick={incrementPage}
                                    className={`flex ${
                                        connections.length < limit ? '' : 'cursor-pointer hover:bg-gray-700'
                                    } h-8 rounded-md px-3 pt-1.5 text-sm text-white bg-gray-800`}
                                >
                                    <svg aria-hidden="true" className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                                        <path
                                            fillRule="evenodd"
                                            d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z"
                                            clipRule="evenodd"
                                        ></path>
                                    </svg>
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="h-fit border border-border-gray rounded-md text-white text-sm">
                        <table className="table-auto">
                            <tbody className="px-4">
                                {connections.map(
                                    ({ id, connection_id: connectionId, provider, provider_config_key: providerConfigKey, created: creationDate }) => (
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
                                    )
                                )}
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
