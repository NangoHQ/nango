import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import useSWR from 'swr';
import { Loading } from '@geist-ui/core';
import debounce from 'lodash/debounce';
import uniq from 'lodash/uniq';

import { PlusIcon, MagnifyingGlassIcon, XCircleIcon } from '@heroicons/react/24/outline';
import IntegrationLogo from '../../components/ui/IntegrationLogo';
import DashboardLayout from '../../layout/DashboardLayout';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import CopyButton from '../../components/ui/button/CopyButton';
import { requestErrorToast } from '../../utils/api';
import type { ConnectionList as Connection } from '@nangohq/server';

import { useStore } from '../../store';

export default function ConnectionList() {
    const navigate = useNavigate();
    const env = useStore((state) => state.env);
    const { data, error } = useSWR<{ connections: Connection[] }>(`/api/v1/connection?env=${env}`);

    const [connections, setConnections] = useState<Connection[] | null>(null);
    const [filteredConnections, setFilteredConnections] = useState<Connection[]>([]);
    const [selectedIntegration, setSelectedIntegration] = useState<string>('_ALL');

    useEffect(() => {
        if (data) {
            setConnections(data.connections);
            setFilteredConnections(data.connections);
        }
    }, [data]);

    const debouncedSearch = useCallback(
        debounce((value: string) => {
            if (!value.trim()) {
                setFilteredConnections(data?.connections || []);
                return;
            }
            const filtered = data?.connections.filter((connection) => connection.connection_id.toLowerCase().includes(value.toLowerCase()));
            setFilteredConnections(filtered || []);
        }, 300),
        [data?.connections]
    );

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
        debouncedSearch(event.currentTarget.value);
    };

    const handleIntegrationChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value;
        if (value === '_ALL') {
            setFilteredConnections(data?.connections || []);
            setSelectedIntegration('_ALL');
            return;
        }
        const filtered = data?.connections.filter((connection) => connection.provider_config_key.toLowerCase() === value.toLowerCase());
        setFilteredConnections(filtered || []);
        setSelectedIntegration(value);
    };

    useEffect(() => {
        return () => {
            debouncedSearch.cancel();
        };
    }, [debouncedSearch]);

    if (error) {
        requestErrorToast();
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
                <Loading spaceRatio={2.5} className="-top-36" />
            </DashboardLayout>
        );
    }

    if (!data) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
                <Loading spaceRatio={2.5} className="-top-36" />
            </DashboardLayout>
        );
    }

    const providers: string[] = uniq(data['connections'].map((connection: Connection) => connection.provider_config_key)).sort();

    function formatDate(creationDate: string): string {
        const inputDate = new Date(creationDate);
        const now = new Date();

        const inputDateOnly = new Date(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate());
        const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (inputDateOnly.getTime() === nowDateOnly.getTime()) {
            const hours = inputDate.getHours();
            const minutes = inputDate.getMinutes();
            const amPm = hours >= 12 ? 'PM' : 'AM';
            const formattedHours = hours % 12 || 12; // Convert to 12-hour format and handle 0 as 12

            return `${formattedHours}:${minutes.toString().padStart(2, '0')} ${amPm}`;
        }

        const diffTime = Math.abs(now.getTime() - inputDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 7) {
            return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
        } else {
            return inputDate.toLocaleDateString();
        }
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
            <div className="flex justify-between mb-8 items-center">
                <h2 className="flex text-left text-3xl font-semibold tracking-tight text-white">Connections</h2>
                {connections && connections.length > 0 && (
                    <Link
                        to={`/${env}/connections/create`}
                        className="flex items-center mt-auto px-4 h-8 rounded-md text-sm text-black bg-white hover:bg-gray-300"
                    >
                        <PlusIcon className="flex h-5 w-5 mr-2 text-black" />
                        Add Connection
                    </Link>
                )}
            </div>
            {connections && connections.length > 0 && (
                <>
                    <div className="flex relative mb-3">
                        <div className="h-fit rounded-md text-white text-sm">
                            <MagnifyingGlassIcon className="absolute top-2 left-4 h-5 w-5 text-gray-400" />
                            <input
                                id="search"
                                name="search"
                                type="text"
                                placeholder="Search by ID"
                                className="border-border-gray bg-active-gray indent-8 text-white block w-full appearance-none rounded-md border px-3 py-2 text-sm placeholder-gray-400 shadow-sm focus:outline-none"
                                onChange={handleInputChange}
                                onKeyUp={handleInputChange}
                            />
                        </div>
                        <select
                            id="integration"
                            name="integration"
                            className="ml-4 bg-active-gray border-border-gray text-text-light-gray block appearance-none py-1 rounded-md text-sm shadow-sm"
                            onChange={handleIntegrationChange}
                            value={selectedIntegration}
                        >
                            <option key="all" value="_ALL">
                                All Integrations
                            </option>
                            {providers.map((integration: string) => (
                                <option key={integration} value={integration}>
                                    {integration}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="h-fit rounded-md text-white text-sm">
                        <div className="w-full">
                            <div className="flex gap-4 items-center text-[12px] px-2 py-1 bg-active-gray border border-neutral-800 rounded-md">
                                <div className="w-2/3">ID</div>
                                <div className="w-1/3">Integration</div>
                                <div className="w-20">Created</div>
                            </div>
                            {filteredConnections.map(
                                ({
                                    id,
                                    connection_id: connectionId,
                                    provider,
                                    provider_config_key: providerConfigKey,
                                    created: creationDate,
                                    error_log_id
                                }) => (
                                    <div
                                        key={`tr-${id}`}
                                        className={`flex gap-4 ${
                                            id !== connections.at(-1)?.id ? 'border-b border-border-gray' : ''
                                        } min-h-[4em] px-2 justify-between items-center hover:bg-hover-gray cursor-pointer`}
                                        onClick={() => {
                                            navigate(`/${env}/connections/${encodeURIComponent(providerConfigKey)}/${encodeURIComponent(connectionId)}`);
                                        }}
                                    >
                                        <div className="flex items-center w-2/3 gap-2 py-2 truncate">
                                            <span className="break-words break-all truncate">{connectionId}</span>
                                            {error_log_id && (
                                                <Link to={`/${env}/logs/${error_log_id}`} className="flex items-center ml-2 text-red-500">
                                                    <XCircleIcon className="h-5 w-5 mr-2" />
                                                </Link>
                                            )}
                                            <CopyButton dark text={connectionId} />
                                        </div>
                                        <div className="flex items-center w-1/3 gap-3">
                                            <div className="w-7">
                                                <IntegrationLogo provider={provider} height={7} width={7} />
                                            </div>
                                            <p className="break-words break-all">{providerConfigKey}</p>
                                        </div>
                                        <div className="flex w-20">
                                            <p className="">{formatDate(creationDate)}</p>
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </>
            )}
            {connections && connections.length === 0 && (
                <div className="flex flex-col border border-border-gray rounded-md items-center text-white text-center p-10 py-20">
                    <h2 className="text-2xl text-center w-full">Connect to an external API</h2>
                    <div className="my-2 text-gray-400">
                        Connections can be created by using the{' '}
                        <Link to="https://docs.nango.dev/reference/sdks/frontend" className="text-blue-400">
                            nango frontend sdk
                        </Link>
                        , or manually here.
                    </div>
                    <Link
                        to={`/${env}/connections/create`}
                        className="flex justify-center w-auto items-center mt-5 px-4 h-10 rounded-md text-sm text-black bg-white hover:bg-gray-300"
                    >
                        <span className="flex">
                            <PlusIcon className="flex h-5 w-5 mr-2 text-black" />
                            Add Connection
                        </span>
                    </Link>
                </div>
            )}
        </DashboardLayout>
    );
}
