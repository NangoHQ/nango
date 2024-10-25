import type React from 'react';
import { useState, useRef, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as Table from '../../components/ui/Table';

import { Input } from '../../components/ui/input/Input';
import { useConnections, useConnectionsCount } from '../../hooks/useConnections';
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../layout/DashboardLayout';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import { MultiSelect } from '../../components/MultiSelect';

import { useStore } from '../../store';
import Button from '../../components/ui/button/Button';
import { useEnvironment } from '../../hooks/useEnvironment';
import { baseUrl, formatDateToInternationalFormat } from '../../utils/utils';
import type { ConnectUI } from '@nangohq/frontend';
import Nango from '@nangohq/frontend';
import { useDebounce, useUnmount } from 'react-use';
import { globalEnv } from '../../utils/env';
import { apiConnectSessions } from '../../hooks/useConnect';
import { useListIntegration } from '../../hooks/useIntegration';
import { Info } from '../../components/Info';
import { Skeleton } from '../../components/ui/Skeleton';
import type { ColumnDef } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { ApiConnection } from '@nangohq/types';
import IntegrationLogo from '../../components/ui/IntegrationLogo';
import { ErrorCircle } from '../../components/ui/label/error-circle';
import Spinner from '../../components/ui/Spinner';
import { AvatarCustom } from '../../components/AvatarCustom';

const defaultFilter = ['all'];
const filterErrors = [
    { name: 'OK', value: 'ok' },
    { name: 'Error', value: 'error' }
];

export const ConnectionList: React.FC = () => {
    const navigate = useNavigate();
    const env = useStore((state) => state.env);
    const connectUI = useRef<ConnectUI>();

    const { environmentAndAccount } = useEnvironment(env);
    const { list: listIntegration } = useListIntegration(env);
    const { data: connectionsCount } = useConnectionsCount(env);

    const [selectedIntegration, setSelectedIntegration] = useState<string[]>(defaultFilter);
    const [search, setSearch] = useState<string>('');
    const [debouncedSearch, setDebouncedSearch] = useState<string>('');
    const [filterWithError, setFilterWithError] = useState<string[]>(defaultFilter);
    const [readyToDisplay, setReadyToDisplay] = useState<boolean>(false);

    const { data, loading, error, hasNext, offset, setOffset, mutate } = useConnections({
        env,
        search: debouncedSearch,
        integrationIds: selectedIntegration,
        withError: filterWithError[0] === 'all' ? undefined : filterWithError[0] === 'error'
    });

    useUnmount(() => {
        if (connectUI.current) {
            connectUI.current.close();
        }
    });

    useDebounce(() => setDebouncedSearch(search), 250, [search]);

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
        setSearch(event.currentTarget.value);
    };

    const handleIntegrationChange = (values: string[]) => {
        if (values.includes('all')) {
            setSelectedIntegration(defaultFilter);
            return;
        }
        setSelectedIntegration(values);
    };

    const onClickConnectUI = () => {
        if (!environmentAndAccount) {
            return;
        }

        const nango = new Nango({
            host: environmentAndAccount.host || baseUrl(),
            websocketsPath: environmentAndAccount.environment.websockets_path || '',
            publicKey: environmentAndAccount.environment.public_key
        });

        connectUI.current = nango.openConnectUI({
            baseURL: globalEnv.connectUrl,
            onEvent: (event) => {
                if (event.type === 'close') {
                    // we refresh on close so user can see the diff
                    void mutate();
                } else if (event.type === 'connect') {
                    navigate(`/${env}/connections/${event.payload.providerConfigKey}/${event.payload.connectionId}`);
                    void mutate();
                }
            }
        });

        // We defer the token creation so the iframe can open and display a loading screen
        //   instead of blocking the main loop and no visual clue for the end user
        setTimeout(async () => {
            const res = await apiConnectSessions(env);
            if ('error' in res.json) {
                return;
            }
            connectUI.current!.setSessionToken(res.json.data.token);
        }, 10);
    };

    const integrations = useMemo(() => {
        if (!listIntegration) {
            return [];
        }
        return listIntegration.integrations.map((integration) => {
            return { name: integration.uniqueKey, value: integration.uniqueKey };
        });
    }, [listIntegration?.integrations]);

    // --- Table Display
    useEffect(() => {
        if (!data) {
            return;
        }
        if (!readyToDisplay) {
            setReadyToDisplay(true);
        }
    }, [data, readyToDisplay]);
    const connections = useMemo(() => {
        return data?.flatMap((d) => d.data) || [];
    }, [data]);

    const columns = useMemo<ColumnDef<ApiConnection>[]>(() => {
        return [
            {
                accessorKey: 'id',
                header: 'Customer',
                size: 300,
                cell: ({ row }) => {
                    const data = row.original;
                    return (
                        <Link to={`/${env}/connections/${data.provider_config_key}/${data.connection_id}`} className="cursor-pointer">
                            {data.endUser ? (
                                <div className="flex gap-3 items-center">
                                    <AvatarCustom displayName={data.endUser.displayName || data.endUser.email} />
                                    <div className="flex flex-col">
                                        <div className="text-white">{data.endUser.displayName ? data.endUser.displayName : data.endUser.email}</div>
                                        {data.endUser.displayName && <div className="text-dark-500 text-xs font-code">{data.endUser.email}</div>}
                                    </div>
                                    {row.original.errors.length > 0 && <ErrorCircle />}
                                </div>
                            ) : (
                                <div className="flex gap-2 items-center">
                                    <span className="break-words break-all truncate">{data.connection_id}</span>
                                    {row.original.errors.length > 0 && <ErrorCircle />}
                                </div>
                            )}
                        </Link>
                    );
                }
            },
            {
                accessorKey: 'provider_config_key',
                header: 'Integration',
                size: 180,
                cell: ({ row }) => {
                    return (
                        <Link to={`/${env}/integrations/${row.original.provider_config_key}`} className="cursor-pointer">
                            <div className="flex gap-2 items-center">
                                <IntegrationLogo provider={row.original.provider} height={7} width={7} />
                                <p className="break-words break-all">{row.original.provider_config_key}</p>
                            </div>
                        </Link>
                    );
                }
            },
            {
                accessorKey: 'connection_id',
                header: 'Connection ID',
                size: 150,
                cell: ({ row }) => {
                    return <div className="truncate">{row.original.connection_id}</div>;
                }
            },
            {
                accessorKey: 'created_at',
                header: 'Created',
                size: 100,
                cell: ({ row }) => {
                    return (
                        <time dateTime={row.original.created_at} title={row.original.created_at} className="text-right">
                            {formatDateToInternationalFormat(row.original.created_at)}
                        </time>
                    );
                }
            }
        ];
    }, [env]);
    const table = useReactTable({
        data: connections || [],
        columns,
        getCoreRowModel: getCoreRowModel()
    });
    const hasFiltered = debouncedSearch || selectedIntegration[0] !== 'all' || filterWithError[0] !== 'all';

    if (error) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
                <Info variant={'destructive'}>
                    An error occurred, refresh your page or reach out to the support.{' '}
                    {error.error.code === 'generic_error_support' && (
                        <>
                            (id: <span className="select-all">{error.error.payload}</span>)
                        </>
                    )}
                </Info>
            </DashboardLayout>
        );
    }

    if (!connections || !readyToDisplay) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
                <h2 className="text-3xl font-semibold text-white mb-4">Connections</h2>

                <div className="flex gap-2 flex-col">
                    <Skeleton style={{ width: '50%' }} />
                    <Skeleton style={{ width: '50%' }} />
                    <Skeleton style={{ width: '50%' }} />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
            <div className="flex justify-between mb-8 items-center">
                <h2 className="flex text-left text-3xl font-semibold tracking-tight text-white">Connections</h2>
                <div className="flex gap-2">
                    {globalEnv.features.connectUI && <Button onClick={onClickConnectUI}>Open Connect UI (beta)</Button>}
                    {(connections || readyToDisplay) && (
                        <Link
                            to={`/${env}/connections/create`}
                            className="flex items-center mt-auto px-4 h-8 rounded-md text-sm text-black bg-white hover:bg-gray-300"
                        >
                            <PlusIcon className="flex h-5 w-5 mr-2 text-black" />
                            Add Connection
                        </Link>
                    )}
                </div>
            </div>
            {connections && (connections.length > 0 || hasFiltered) && (
                <>
                    {connectionsCount?.data && (
                        <div className="flex justify-end w-full text-[12px] text-white">
                            {connectionsCount.data.total} connection{connectionsCount.data.total !== 1 ? 's' : ''}
                            {connectionsCount.data.withError > 0 && (
                                <span className="flex items-center ml-1">
                                    ({connectionsCount?.data.withError} errored)<span className="ml-1 bg-red-base h-1.5 w-1.5 rounded-full"></span>
                                </span>
                            )}
                        </div>
                    )}
                    <div className="flex gap-2 relative my-3">
                        <div className="flex-grow">
                            <Input
                                inputSize={'sm'}
                                before={<MagnifyingGlassIcon className="w-4" />}
                                placeholder="Search by connection"
                                className="border-active-gray"
                                value={search}
                                onChange={handleInputChange}
                                onKeyUp={handleInputChange}
                            />
                        </div>
                        <div className="flex">
                            <MultiSelect
                                label="Integrations"
                                options={integrations}
                                selected={selectedIntegration}
                                defaultSelect={defaultFilter}
                                onChange={handleIntegrationChange}
                                all
                            />
                            <MultiSelect
                                label="Filter Errors"
                                options={filterErrors}
                                selected={filterWithError}
                                defaultSelect={defaultFilter}
                                onChange={setFilterWithError}
                                all
                            />
                        </div>
                    </div>
                    <div>
                        <Table.Table className="table-fixed">
                            <Table.Header>
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <Table.Row key={headerGroup.id}>
                                        {headerGroup.headers.map((header) => {
                                            return (
                                                <Table.Head
                                                    key={header.id}
                                                    style={{
                                                        width: header.getSize() !== 0 ? header.getSize() : undefined
                                                    }}
                                                >
                                                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                                </Table.Head>
                                            );
                                        })}
                                    </Table.Row>
                                ))}
                            </Table.Header>
                            <Table.Body>
                                {loading && (
                                    <Table.Row>
                                        {table.getAllColumns().map((col, i) => {
                                            return (
                                                <Table.Cell key={i}>
                                                    <Skeleton style={{ width: col.getSize() - 20 }} />
                                                </Table.Cell>
                                            );
                                        })}
                                    </Table.Row>
                                )}

                                {table.getRowModel().rows?.length > 0 &&
                                    table.getRowModel().rows.map((row) => (
                                        <Table.Row key={row.original.id} data-state={row.getIsSelected() && 'selected'}>
                                            {row.getVisibleCells().map((cell) => (
                                                <Table.Cell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Table.Cell>
                                            ))}
                                        </Table.Row>
                                    ))}

                                {connections.length <= 0 && hasFiltered && (
                                    <Table.Row>
                                        <Table.Cell colSpan={columns.length} className="h-24 text-center p-0 pt-4">
                                            <div className="flex gap-2 flex-col border border-border-gray rounded-md items-center text-white text-center p-10 py-20">
                                                <div className="text-center">No connections found</div>
                                            </div>
                                        </Table.Cell>
                                    </Table.Row>
                                )}
                            </Table.Body>
                        </Table.Table>
                    </div>

                    {hasNext && readyToDisplay && (
                        <div>
                            <Button disabled={loading} variant="active" className="w-full justify-center" onClick={() => setOffset(offset + 1)}>
                                {loading ? (
                                    <>
                                        <Spinner size={1} /> Loading...
                                    </>
                                ) : (
                                    'Load More'
                                )}
                            </Button>
                        </div>
                    )}
                </>
            )}
            {connections && connections.length === 0 && !hasFiltered && (
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
};
