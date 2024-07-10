import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loading } from '@geist-ui/core';
import debounce from 'lodash/debounce';
import uniq from 'lodash/uniq';

import { Input } from '../../components/ui/input/Input';
import { useConnections } from '../../hooks/useConnections';
import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
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

function truncateWithEllipsis(text: string) {
    if (text.length <= 6) {
        return text;
    }
    return text.slice(0, 3) + '...' + text.slice(-3);
}

export default function ConnectionList() {
    const navigate = useNavigate();
    const env = useStore((state) => state.env);
    const { data, error, errorNotifications } = useConnections(env);

    const connections: Connection[] = data?.connections || [];

    const [selectedIntegrations, setSelectedIntegrations] = useState<string[]>(defaultFilter);
    const [connectionSearch, setConnectionSearch] = useState<string>('');
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>(defaultFilter);
    const [selectedCustomerDomains, setSelectedCustomerDomains] = useState<string[]>(defaultFilter);

    const filteredConnections = useMemo<Connection[]>(() => {
        if (!data) {
            return [];
        }

        const allConnections: Connection[] = data.connections || [];
        return allConnections.filter((connection) => {
            const matchesSearch: boolean = !connectionSearch || connection.connection_id.toLowerCase().includes(connectionSearch.toLowerCase());
            const matchesIntegration: boolean = selectedIntegrations.includes('all') || selectedIntegrations.includes(connection.provider_config_key);
            const matchesStatus: boolean =
                selectedStatuses.includes('all') ||
                (selectedStatuses.includes('ok') && !connection.active_logs) ||
                (selectedStatuses.includes('error') && !!connection.active_logs);

            return matchesSearch && matchesIntegration && matchesStatus;
        });
    }, [connectionSearch, selectedIntegrations, selectedStatuses, data]);

    const numberOfErroredConnections = useMemo<number>(() => {
        if (!data) {
            return 0;
        }

        return (data.connections || []).filter((connection) => connection.active_logs).length;
    }, [data]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const debouncedSearch = useCallback(
        debounce((value: string) => {
            setConnectionSearch(value.trim());
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

    const handleCustomerDomainChange = (values: string[]) => {
        if (values.includes('all')) {
            setSelectedCustomerDomains(defaultFilter);
            return;
        }
        setSelectedCustomerDomains(values);
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
                            <div className="mr-2">
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
                            </div>
                            <div className="mr-2">
                                <MultiSelect
                                    label="Customer Domains"
                                    options={connections.reduce((acc: { name: string; value: string }[], connection: Connection) => {
                                        const sitename = connection?.connection_config ? connection.connection_config['customer_domain'] : undefined;
                                        if (typeof sitename === 'string') {
                                            acc.push({
                                                name: sitename,
                                                value: sitename
                                            });
                                        }
                                        return acc;
                                    }, [])}
                                    selected={selectedCustomerDomains}
                                    defaultSelect={defaultFilter}
                                    onChange={handleCustomerDomainChange}
                                    all
                                    emptyLabel="No customer domains"
                                />
                            </div>
                            <div className="mr-2">
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
                    </div>
                    <div className="h-fit rounded-md text-white text-sm">
                        <div className="w-full">
                            <div className="flex gap-4 items-center text-[12px] px-2 py-1 bg-active-gray border border-neutral-800 rounded-md mb-1">
                                <div className="w-1/4">Display Name</div>
                                <div className="w-1/4">Customer Domain</div>
                                <div className="w-1/4">Integration</div>
                                <div className="w-1/4">Connection ID</div>
                                <div className="w-20 text-right float-right">Created</div>
                            </div>
                            <div className="rounded-md overflow-hidden">
                                {filteredConnections.map(
                                    ({
                                        id,
                                        connection_id: connectionId,
                                        provider,
                                        provider_config_key: providerConfigKey,
                                        created: creationDate,
                                        active_logs,
                                        connection_config
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
                                            <div className="flex items-center w-1/4 gap-2 py-2 truncate">
                                                <span className="break-words break-all truncate">
                                                    {connection_config?.display_name ? (connection_config.display_name as string | undefined) : '-'}
                                                </span>
                                                {active_logs && <ErrorCircle />}
                                            </div>
                                            <div className="flex w-1/4">
                                                <span className="break-words break-all truncate">
                                                    {connection_config?.customer_domain ? (connection_config.customer_domain as string | undefined) : '-'}
                                                </span>
                                            </div>
                                            <div className="flex items-center w-1/4 gap-3">
                                                <div className="w-7">
                                                    <IntegrationLogo provider={provider} height={7} width={7} />
                                                </div>
                                                <p className="break-words break-all">{providerConfigKey}</p>
                                            </div>
                                            <div className="flex w-1/4 items-center">
                                                <span className="break-words break-all truncate text-gray-400 mr-2">{truncateWithEllipsis(connectionId)}</span>
                                                <CopyButton dark text={connectionId} />
                                            </div>
                                            <div className="flex w-20 justify-end">
                                                <time dateTime={creationDate} title={creationDate}>
                                                    {formatDate(creationDate)}
                                                </time>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
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
