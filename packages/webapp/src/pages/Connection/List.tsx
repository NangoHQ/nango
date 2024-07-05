import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Loading } from '@geist-ui/core';
import debounce from 'lodash/debounce';
import uniq from 'lodash/uniq';

import { Input } from '../../components/ui/input/Input';
import { useConnections } from '../../hooks/useConnections';
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import IntegrationLogo from '../../components/ui/IntegrationLogo';
import { ErrorCircle } from '../../components/ui/label/error-circle';
import DashboardLayout from '../../layout/DashboardLayout';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import CopyButton from '../../components/ui/button/CopyButton';
import { requestErrorToast } from '../../utils/api';
import { MultiSelect } from '../../components/MultiSelect';
import type { ConnectionList as Connection } from '@nangohq/server';

import { useStore } from '../../store';

const defaultFilter = ['all'];

export default function ConnectionList() {
    const navigate = useNavigate();
    const env = useStore((state) => state.env);
    const { data, error, errorNotifications } = useConnections(env);

    const [connections, setConnections] = useState<Connection[] | null>(null);
    const [filteredConnections, setFilteredConnections] = useState<Connection[]>([]);
    const [numberOfErroredConnections, setNumberOfErroredConnections] = useState<number>(0);
    const [selectedIntegrations, setSelectedIntegrations] = useState<string[]>(defaultFilter);
    const [connectionSearch, setConnectionSearch] = useState<string>('');
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>(defaultFilter);

    useEffect(() => {
        if (data) {
            setConnections(data.connections);
            setFilteredConnections(data.connections);
            setNumberOfErroredConnections(data.connections.filter((connection) => connection.active_logs).length);
        }
    }, [data]);

    useEffect(() => {
        if (data) {
            let filtered = data.connections;
            if (connectionSearch) {
                filtered = filtered?.filter((connection) => connection.connection_id.toLowerCase().includes(connectionSearch.toLowerCase()));
            }

            if (selectedIntegrations.length > 0 && !selectedIntegrations.includes('all')) {
                filtered = filtered?.filter((connection) => selectedIntegrations.includes(connection.provider_config_key));
            }

            if (
                selectedStatuses.length !== 0 &&
                !selectedStatuses.includes('all') &&
                !(selectedStatuses.includes('ok') && selectedStatuses.includes('error'))
            ) {
                if (selectedStatuses.includes('error')) {
                    filtered = filtered?.filter((connection) => connection.active_logs);
                }
                if (selectedStatuses.includes('ok')) {
                    filtered = filtered?.filter((connection) => !connection.active_logs);
                }
            }

            setFilteredConnections(filtered || []);
            setNumberOfErroredConnections((filtered || []).filter((connection) => connection.active_logs).length);
        }
    }, [connectionSearch, selectedIntegrations, selectedStatuses, data]);

    const debouncedSearch = useCallback(
        debounce((value: string) => {
            if (!value.trim()) {
                setConnectionSearch('');
                setFilteredConnections(data?.connections || []);
                return;
            }
            setConnectionSearch(value);
        }, 300),
        [data?.connections]
    );

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
        debouncedSearch(event.currentTarget.value);
    };

    const handleIntegrationChange = (values: string[]) => {
        if (values.includes('all')) {
            setSelectedIntegrations(defaultFilter);
            return;
        }
        setSelectedIntegrations(values);
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
                    <div className="flex justify-end w-full text-[12px] text-white">
                        {filteredConnections.length} connection{filteredConnections.length !== 1 ? 's' : ''}
                        {errorNotifications > 0 && (
                            <span className="flex items-center ml-1">
                                ({numberOfErroredConnections} errored)<span className="ml-1 bg-red-base h-1.5 w-1.5 rounded-full"></span>
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2 relative my-3">
                        <div className="flex-grow">
                            <Input
                                before={<MagnifyingGlassIcon className="w-4" />}
                                placeholder="Search by ID"
                                className="border-active-gray"
                                onChange={handleInputChange}
                                onKeyUp={handleInputChange}
                            />
                        </div>
                        <div className="flex">
                            <MultiSelect
                                label="Integrations"
                                options={providers.map((integration: string) => {
                                    return { name: integration, value: integration };
                                })}
                                selected={selectedIntegrations}
                                defaultSelect={defaultFilter}
                                onChange={handleIntegrationChange}
                                all
                            />
                            <MultiSelect
                                label="Filter Errors"
                                options={[
                                    { name: 'OK', value: 'ok' },
                                    { name: 'Error', value: 'error' }
                                ]}
                                selected={selectedStatuses}
                                defaultSelect={defaultFilter}
                                onChange={setSelectedStatuses}
                                all
                            />
                        </div>
                    </div>
                    <div className="h-fit rounded-md text-white text-sm">
                        <div className="w-full">
                            <div className="flex gap-4 items-center text-[12px] px-2 py-1 bg-active-gray border border-neutral-800 rounded-md">
                                <div className="w-2/3">Connection IDs</div>
                                <div className="w-1/3">Integration</div>
                                <div className="w-20">Created</div>
                            </div>
                            {filteredConnections.map(
                                ({ id, connection_id: connectionId, provider, provider_config_key: providerConfigKey, created: creationDate, active_logs }) => (
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
                                            {active_logs && <ErrorCircle />}
                                            <CopyButton dark text={connectionId} />
                                        </div>
                                        <div className="flex items-center w-1/3 gap-3">
                                            <div className="w-7">
                                                <IntegrationLogo provider={provider} height={7} width={7} />
                                            </div>
                                            <p className="break-words break-all">{providerConfigKey}</p>
                                        </div>
                                        <div className="flex w-20">
                                            <time dateTime={creationDate} title={creationDate}>
                                                {formatDate(creationDate)}
                                            </time>
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
