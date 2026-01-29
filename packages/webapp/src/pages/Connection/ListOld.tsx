import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { useDebounce } from 'react-use';

import { EndUserProfile } from './components/EndUserProfile.js';
import { AvatarOrganization } from '../../components/AvatarCustom.js';
import { CopyText } from '../../components/CopyText.js';
import { ErrorCircle } from '../../components/ErrorCircle.js';
import { ErrorPageComponent } from '../../components/ErrorComponent.js';
import { MultiSelect } from '../../components/MultiSelect.js';
import { SimpleTooltip } from '../../components/SimpleTooltip.js';
import IntegrationLogo from '../../components/ui/IntegrationLogo.js';
import { Skeleton } from '../../components/ui/Skeleton.js';
import Spinner from '../../components/ui/Spinner.js';
import * as Table from '../../components/ui/Table.js';
import { Button, ButtonLink } from '../../components/ui/button/Button.js';
import { Input } from '../../components/ui/input/Input.js';
import { useConnections, useConnectionsCount } from '../../hooks/useConnections.js';
import { useListIntegration } from '../../hooks/useIntegration.js';
import DashboardLayout from '../../layout/DashboardLayout.js';
import { useStore } from '../../store.js';
import { getConnectionDisplayName } from '../../utils/endUser.js';
import { formatDateToInternationalFormat } from '../../utils/utils.js';

import type { ApiConnectionSimple, ApiError } from '@nangohq/types';
import type { ColumnDef } from '@tanstack/react-table';
import type React from 'react';

const defaultFilter = ['all'];
const filterErrors = [
    { name: 'OK', value: 'ok' },
    { name: 'Error', value: 'error' }
];

const columns: ColumnDef<ApiConnectionSimple>[] = [
    {
        accessorKey: 'id',
        header: 'Customer',
        size: 300,
        cell: ({ row }) => {
            const data = row.original;

            const errorCounts = data.errors.reduce(
                (acc, error) => {
                    if (error.type === 'auth') {
                        acc.auth += 1;
                    } else if (error.type === 'sync') {
                        acc.sync += 1;
                    }
                    return acc;
                },
                { auth: 0, sync: 0 }
            );

            return (
                <div className="flex gap-3 items-center">
                    <AvatarOrganization
                        email={data.endUser?.email ? data.endUser.email : null}
                        displayName={getConnectionDisplayName({ endUser: data.endUser, connectionId: data.connection_id })}
                    />

                    {data.endUser ? (
                        <EndUserProfile endUser={data.endUser} connectionId={data.connection_id} />
                    ) : (
                        <span className="break-words break-all truncate">{data.connection_id}</span>
                    )}
                    {errorCounts.auth > 0 && (
                        <SimpleTooltip tooltipContent="Expired credentials">
                            <ErrorCircle icon="auth" />
                        </SimpleTooltip>
                    )}

                    {errorCounts.sync > 0 && (
                        <SimpleTooltip tooltipContent="Failed syncs">
                            <ErrorCircle icon="sync" />
                        </SimpleTooltip>
                    )}
                </div>
            );
        }
    },
    {
        accessorKey: 'provider_config_key',
        header: 'Integration',
        size: 180,
        cell: ({ row }) => {
            return (
                <div className="flex gap-2 items-center">
                    <IntegrationLogo provider={row.original.provider} height={7} width={7} />
                    <p className="break-words break-all">{row.original.provider_config_key}</p>
                </div>
            );
        }
    },
    {
        accessorKey: 'connection_id',
        header: 'Connection ID',
        size: 130,
        cell: ({ row }) => {
            return <CopyText className="text-s font-code" text={row.original.connection_id} showOnHover />;
        }
    },
    {
        accessorKey: 'created_at',
        header: 'Created',
        size: 80,
        cell: ({ row }) => {
            return (
                <time dateTime={row.original.created_at} title={row.original.created_at} className="text-right">
                    {formatDateToInternationalFormat(row.original.created_at)}
                </time>
            );
        }
    }
];

export const OldConnectionList: React.FC = () => {
    const env = useStore((state) => state.env);

    const { list: listIntegration } = useListIntegration(env);
    const { data: connectionsCount } = useConnectionsCount(env);

    const [selectedIntegration, setSelectedIntegration] = useState<string[]>(defaultFilter);
    const [search, setSearch] = useState<string>('');
    const [debouncedSearch, setDebouncedSearch] = useState<string>('');
    const [filterWithError, setFilterWithError] = useState<string>('all');
    const [readyToDisplay, setReadyToDisplay] = useState<boolean>(false);
    const [page, setPage] = useState<number>(0);

    const {
        data,
        isLoading: loading,
        error
    } = useConnections({
        env,
        search: debouncedSearch,
        integrationIds: selectedIntegration,
        withError: filterWithError === 'all' ? undefined : filterWithError === 'error',
        page
    });

    // Reset to page 0 when filters change
    const prevDebouncedSearch = useMemo(() => debouncedSearch, [debouncedSearch]);
    const prevSelectedIntegration = useMemo(() => selectedIntegration, [selectedIntegration]);
    const prevFilterWithError = useMemo(() => filterWithError, [filterWithError]);

    useEffect(() => {
        if (prevDebouncedSearch !== debouncedSearch || prevSelectedIntegration !== selectedIntegration || prevFilterWithError !== filterWithError) {
            setPage(0);
        }
    }, [debouncedSearch, selectedIntegration, filterWithError, prevDebouncedSearch, prevSelectedIntegration, prevFilterWithError]);

    const hasNext = useMemo(() => {
        if (!data) return false;
        return data.data.length >= 20;
    }, [data]);

    const setOffset = (newOffset: number) => {
        setPage(newOffset);
    };

    const offset = page;

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

    const handleFilterErrorChange = (values: string[]) => {
        const newItems = values.filter((f) => !filterWithError.includes(f));
        setFilterWithError(newItems.length > 0 ? newItems[0] : defaultFilter[0]);
    };

    const integrations = useMemo(() => {
        if (!listIntegration) {
            return [];
        }
        return listIntegration.map((integration) => {
            return { name: integration.unique_key, value: integration.unique_key };
        });
    }, [listIntegration]);

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
        return data?.data || [];
    }, [data]);

    const table = useReactTable({
        data: connections || [],
        columns,
        getCoreRowModel: getCoreRowModel()
    });
    const hasFiltered = debouncedSearch || selectedIntegration[0] !== 'all' || filterWithError !== 'all';

    if (error) {
        return <ErrorPageComponent title="Connections" error={error.json as ApiError<string>} />;
    }

    if (!connections || !readyToDisplay) {
        return (
            <DashboardLayout>
                <Helmet>
                    <title>OLD Connections - Nango</title>
                </Helmet>
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
        <DashboardLayout>
            <Helmet>
                <title>Connections - Nango</title>
            </Helmet>
            <div className="flex justify-between mb-8 items-center">
                <h2 className="flex text-left text-3xl font-semibold tracking-tight text-white">Connections</h2>
                <div className="flex gap-2">
                    <ButtonLink to={`/${env}/connections/create`}>
                        <PlusIcon className="flex h-5 w-5 mr-2 text-black" />
                        Add Test Connection
                    </ButtonLink>
                </div>
            </div>
            {connections && (connections.length > 0 || hasFiltered) && (
                <>
                    {connectionsCount?.data && (
                        <div className="flex justify-end w-full text-[12px] text-white">
                            {connectionsCount.data.total} connection{connectionsCount.data.total !== 1 ? 's' : ''}
                            {connectionsCount.data.withError > 0 && (
                                <SimpleTooltip
                                    tooltipContent={`${connectionsCount.data.withAuthError} authorization error${connectionsCount.data.withAuthError !== 1 ? 's' : ''}, ${connectionsCount.data.withSyncError} synchronization error${connectionsCount.data.withSyncError !== 1 ? 's' : ''}`}
                                >
                                    <span className="flex items-center ml-1">
                                        ({connectionsCount?.data.withError} errored)<span className="ml-1 bg-red-base h-1.5 w-1.5 rounded-full"></span>
                                    </span>
                                </SimpleTooltip>
                            )}
                        </div>
                    )}
                    <div className="flex gap-2 relative my-3">
                        <div className="grow">
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
                        <div className="flex gap-2">
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
                                selected={[filterWithError]}
                                defaultSelect={defaultFilter}
                                onChange={handleFilterErrorChange}
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
                                        <Link
                                            key={row.original.id}
                                            to={`/${env}/connections/${row.original.provider_config_key}/${row.original.connection_id}`}
                                            className="contents"
                                        >
                                            <Table.Row data-state={row.getIsSelected() && 'selected'} className="hover:cursor-pointer">
                                                {row.getVisibleCells().map((cell) => (
                                                    <Table.Cell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Table.Cell>
                                                ))}
                                            </Table.Row>
                                        </Link>
                                    ))}

                                {connections.length <= 0 && hasFiltered && !loading && (
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
                <div className="flex flex-col gap-2 border border-border-gray rounded-md items-center text-white text-center p-10 py-20">
                    <h2 className="text-2xl text-center w-full">Connect to an external API</h2>
                    <div className="text-gray-400">
                        Connections can be created by using{' '}
                        <Link to="https://nango.dev/docs/implementation-guides/platform/auth/implement-api-auth" className="text-blue-500">
                            Nango Connect
                        </Link>
                        , or manually here.
                    </div>
                    <div className="flex my-2 items-center bg-white rounded-md">
                        <ButtonLink to={`/${env}/connections/create`}>
                            <PlusIcon className="flex h-5 w-5 mr-2 text-black" />
                            Add Test Connection
                        </ButtonLink>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
};
