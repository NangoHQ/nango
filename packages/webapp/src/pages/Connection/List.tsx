import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { PauseCircle, Plus, Search, ShieldAlert, TriangleAlert } from 'lucide-react';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from 'react-use';

import { permissions } from '@nangohq/authz';

import { ConnectionCount } from './components/ConnectionCount';
import { ErrorPageComponent } from '@/components/ErrorComponent';
import { Avatar } from '@/components-v2/Avatar';
import { CopyButton } from '@/components-v2/CopyButton';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { PermissionGate } from '@/components-v2/PermissionGate';
import { StatusWithIcon } from '@/components-v2/StatusWithIcon';
import { StyledLink } from '@/components-v2/StyledLink';
import { Button, ButtonLink } from '@/components-v2/ui/button';
import { ComboboxSelect } from '@/components-v2/ui/combobox';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';
import { useConnections } from '@/hooks/useConnections';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useListIntegrations } from '@/hooks/useIntegration';
import { usePermissions } from '@/hooks/usePermissions';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { getConnectionDisplayName, getEndUserEmail } from '@/utils/endUser';
import { formatDateToInternationalFormat } from '@/utils/utils';

import type { ComboboxOption } from '@/components-v2/ui/combobox';
import type { ApiConnectionSimple, GetConnections } from '@nangohq/types';
import type { ColumnDef } from '@tanstack/react-table';

type StatusFilterValue = 'ok' | 'error' | 'auth_error' | 'sync_error' | 'paused';
const validStatusFilterValues = new Set<string>(['ok', 'error', 'auth_error', 'sync_error', 'paused']);

const statusOptions: ComboboxOption<StatusFilterValue>[] = [
    { label: 'OK', value: 'ok' },
    {
        label: 'Error',
        value: 'error',
        children: [
            { label: 'Auth error', value: 'auth_error' },
            { label: 'Sync error', value: 'sync_error' }
        ]
    },
    { label: 'Paused syncs', value: 'paused' }
];

const parseSearch = parseAsString.withDefault('');
const parseIntegrations = parseAsArrayOf(parseAsString, ',').withDefault([]);
const parseStatusFilters = parseAsArrayOf(parseAsString, ',').withDefault([]);

const columns: ColumnDef<ApiConnectionSimple>[] = [
    {
        accessorKey: 'id',
        header: 'Customer',
        size: 115,
        cell: ({ row }) => {
            const data = row.original;

            const displayName = getConnectionDisplayName({ endUser: data.endUser, connectionId: data.connection_id, connectionTags: data.tags });
            const email = getEndUserEmail(data.endUser, data.tags);

            return (
                <div className="flex gap-2.5 items-center min-w-0">
                    <Avatar name={displayName} />
                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-body-small-semi text-text-primary truncate">{displayName}</span>
                        <span className="text-body-small-regular text-text-tertiary truncate">{email ?? ''}</span>
                    </div>
                </div>
            );
        }
    },
    {
        accessorKey: 'provider',
        header: 'Integration',
        size: 100,
        cell: ({ row }) => {
            const { provider } = row.original;

            return (
                <div className="flex gap-1.5 items-center">
                    <IntegrationLogo provider={row.original.provider} className="size-8 bg-transparent" />
                    <span className="text-body-small-semi text-text-primary">{provider}</span>
                </div>
            );
        }
    },
    {
        accessorKey: 'connection_id',
        header: 'Connection ID',
        size: 130,
        cell: ({ row }) => {
            const { connection_id } = row.original;

            return (
                <div className="flex gap-1.5 items-center min-w-0">
                    <span className="text-body-extra-small-medium text-text-secondary truncate flex-1 min-w-0">{connection_id}</span>
                    <CopyButton text={connection_id} />
                </div>
            );
        }
    },
    {
        accessorKey: 'created_at',
        header: 'Created on',
        size: 80,
        cell: ({ row }) => {
            const { created_at } = row.original;

            return (
                <time dateTime={created_at} title={created_at} className="text-code-body-small-regular text-text-tertiary">
                    {formatDateToInternationalFormat(created_at)}
                </time>
            );
        }
    },
    {
        accessorKey: 'status',
        header: '',
        size: 25,
        cell: ({ row }) => {
            const { errors, pausedSyncs } = row.original;
            const hasPausedSyncs = pausedSyncs.length > 0;
            const errorCounts = errors.reduce(
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
                <div className="flex gap-1 items-center">
                    {errorCounts.auth > 0 && (
                        <StatusWithIcon tooltipContent="Expired credentials" variant="warning">
                            <ShieldAlert />
                        </StatusWithIcon>
                    )}
                    {errorCounts.sync > 0 && (
                        <StatusWithIcon tooltipContent="Failed syncs" variant="warning">
                            <TriangleAlert />
                        </StatusWithIcon>
                    )}
                    {hasPausedSyncs && (
                        <StatusWithIcon tooltipContent="Paused syncs" variant="neutral">
                            <PauseCircle />
                        </StatusWithIcon>
                    )}
                </div>
            );
        }
    }
];

export const ConnectionList = () => {
    const env = useStore((state) => state.env);
    const { data: environmentData } = useEnvironment(env);
    const environment = environmentData?.environmentAndAccount?.environment;

    const { can } = usePermissions();
    const canCreateTestConnection = can(permissions.canWriteProdConnections) || !environment?.is_production;

    const navigate = useNavigate();

    const [search, setSearch] = useQueryState('search', parseSearch);
    const [debouncedSearch, setDebouncedSearch] = useState<string>('');
    const [selectedIntegrations, setSelectedIntegrations] = useQueryState('integrations', parseIntegrations);
    const [rawStatusFilters, setSelectedStatusFilters] = useQueryState('status', parseStatusFilters);
    const selectedStatusFilters = (rawStatusFilters ?? []).filter((s): s is StatusFilterValue => validStatusFilterValues.has(s));

    useDebounce(() => setDebouncedSearch(search || ''), 300, [search]);

    const { data: listIntegrationData, isLoading: integrationsLoading } = useListIntegrations(env);

    const withError = useMemo(() => {
        if (selectedStatusFilters.length === 0) return undefined;
        const hasOk = selectedStatusFilters.includes('ok');
        const hasErrorFilter = selectedStatusFilters.some((s) => s === 'error' || s === 'auth_error' || s === 'sync_error');
        const hasPausedFilter = selectedStatusFilters.includes('paused');
        if (hasOk && !hasErrorFilter && !hasPausedFilter) return false;
        if (!hasOk && hasErrorFilter && !hasPausedFilter) return true;
        return undefined;
    }, [selectedStatusFilters]);

    const integrationIds = useMemo(() => {
        if (!selectedIntegrations || selectedIntegrations.length === 0) return undefined;
        return selectedIntegrations;
    }, [selectedIntegrations]);

    const {
        data: connectionsData,
        isLoading: loading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        error: connectionsError
    } = useConnections({
        env,
        search: debouncedSearch,
        integrationIds,
        withError
    });

    const connections = useMemo(() => {
        return connectionsData?.pages.flatMap((page) => page.data) || [];
    }, [connectionsData]);

    const displayedConnections = useMemo(() => {
        if (selectedStatusFilters.length === 0) return connections;
        return connections.filter((conn) =>
            selectedStatusFilters.some((filter) => {
                switch (filter) {
                    case 'ok':
                        return conn.errors.length === 0;
                    case 'error':
                        return conn.errors.length > 0;
                    case 'auth_error':
                        return conn.errors.some((e) => e.type === 'auth');
                    case 'sync_error':
                        return conn.errors.some((e) => e.type === 'sync');
                    case 'paused':
                        return conn.pausedSyncs.length > 0;
                }
            })
        );
    }, [connections, selectedStatusFilters]);

    useEffect(() => {
        if (selectedStatusFilters.length > 0 && displayedConnections.length === 0 && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage();
        }
    }, [displayedConnections.length, selectedStatusFilters.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

    const hasFiltered = debouncedSearch || (selectedIntegrations && selectedIntegrations.length > 0) || selectedStatusFilters.length > 0;

    const connectionCount = displayedConnections.length;
    const hasConnections = connectionCount > 0;
    const showEmptyStateNoFilters = !loading && connectionCount === 0 && !hasFiltered;
    const showEmptyStateWithFilters = !loading && !isFetchingNextPage && connectionCount === 0 && hasFiltered && !hasNextPage;

    const table = useReactTable({
        data: displayedConnections,
        columns,
        getCoreRowModel: getCoreRowModel()
    });

    const integrationsOptions = useMemo(() => {
        const list = listIntegrationData?.data;
        if (!list) {
            return [];
        }
        return list.map((integration) => ({
            label: integration.display_name || integration.unique_key,
            value: integration.unique_key,
            icon: <IntegrationLogo provider={integration.provider} className="size-7 rounded-[3.7px] p-[3.48px] bg-transparent border-transparent" />
        }));
    }, [listIntegrationData?.data]);

    if (connectionsError) {
        return <ErrorPageComponent title="Connections" error={connectionsError.json as GetConnections['Errors']} />;
    }

    return (
        <DashboardLayout fullWidth>
            <Helmet>
                <title>Connections - Nango</title>
            </Helmet>

            <div className="flex flex-col gap-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h2 className="text-title-subsection text-text-primary">Connections</h2>
                    {(hasConnections || hasFiltered) && (
                        <PermissionGate condition={canCreateTestConnection}>
                            {(allowed) => (
                                <ButtonLink to={`/${env}/connections/create`} size="lg" disabled={!allowed}>
                                    Add test connection
                                </ButtonLink>
                            )}
                        </PermissionGate>
                    )}
                </div>

                {/* Content */}
                <div className="flex flex-col gap-3">
                    {(loading || hasConnections || hasFiltered) && (
                        <>
                            {/* Connection count */}
                            <ConnectionCount className="self-end" />
                            {/* Filters */}
                            <div className="flex items-center gap-1.5">
                                <InputGroup className="bg-bg-surface h-10">
                                    <InputGroupInput
                                        className="pr-2.5"
                                        type="text"
                                        placeholder="Search connections"
                                        value={search || ''}
                                        onChange={(e) => setSearch(e.target.value)}
                                    />
                                    <InputGroupAddon className="pl-2.5">
                                        <Search />
                                    </InputGroupAddon>
                                </InputGroup>
                                <ComboboxSelect
                                    allowMultiple
                                    label={selectedIntegrations && selectedIntegrations.length > 0 ? `Integrations` : 'All integrations'}
                                    dropdownTitle="All integrations"
                                    onClearAll={() => setSelectedIntegrations([])}
                                    options={integrationsOptions}
                                    loading={integrationsLoading}
                                    selected={selectedIntegrations || []}
                                    onSelectedChange={(selected) => setSelectedIntegrations(selected)}
                                    emptyText="No integrations found"
                                    footer={
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="flex items-center justify-center gap-2 text-text-tertiary text-body-small-regular">
                                                Need a new integration?
                                            </span>
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                className="h-auto rounded-full bg-btn-secondary-bg px-2 py-1 text-body-small-regular gap-0.5 justify-center items-center text-text-primary"
                                                onClick={() => {
                                                    navigate(`/${env}/integrations/create`);
                                                }}
                                            >
                                                <Plus className="size-4" /> Add
                                            </Button>
                                        </div>
                                    }
                                />
                                <ComboboxSelect
                                    allowMultiple
                                    label="Status"
                                    dropdownTitle="Select statuses"
                                    onClearAll={() => setSelectedStatusFilters([])}
                                    options={statusOptions}
                                    selected={selectedStatusFilters}
                                    onSelectedChange={setSelectedStatusFilters}
                                    reorderOnSelect={false}
                                    showSearch={false}
                                />
                            </div>

                            {/* Table */}
                            <Table>
                                <TableHeader>
                                    {table.getHeaderGroups().map((headerGroup) => (
                                        <TableRow key={headerGroup.id}>
                                            {headerGroup.headers.map((header) => {
                                                return (
                                                    <TableHead
                                                        key={header.id}
                                                        style={{
                                                            maxWidth: header.getSize() !== 0 ? header.getSize() : undefined,
                                                            width: header.getSize() !== 0 ? header.getSize() : undefined
                                                        }}
                                                        className="h-11"
                                                    >
                                                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                                    </TableHead>
                                                );
                                            })}
                                        </TableRow>
                                    ))}
                                </TableHeader>
                                {loading && (
                                    <TableBody>
                                        {Array.from({ length: 3 }).map((_, rowIndex) => (
                                            <TableRow key={rowIndex} className="h-16">
                                                {table.getAllColumns().map((col, colIndex) => (
                                                    <TableCell
                                                        key={colIndex}
                                                        style={{
                                                            maxWidth: col.getSize() !== 0 ? col.getSize() : undefined
                                                        }}
                                                    >
                                                        <Skeleton className="h-4" style={{ width: col.getSize() ? col.getSize() - 20 : 'auto' }} />
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                )}
                                {!loading && hasConnections && (
                                    <TableBody>
                                        {table.getRowModel().rows.map((row) => (
                                            <TableRow
                                                key={row.id}
                                                className="h-16 cursor-pointer"
                                                onClick={() => {
                                                    navigate(`/${env}/connections/${row.original.provider_config_key}/${row.original.connection_id}`);
                                                }}
                                            >
                                                {row.getVisibleCells().map((cell) => (
                                                    <TableCell
                                                        key={cell.id}
                                                        style={{
                                                            maxWidth: cell.column.getSize() !== 0 ? cell.column.getSize() : undefined
                                                        }}
                                                    >
                                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                )}
                            </Table>

                            {showEmptyStateWithFilters && (
                                <div className="flex flex-col gap-5 p-20 items-center justify-center bg-bg-elevated rounded">
                                    <p className="text-text-secondary text-body-medium-regular">No connections found.</p>
                                </div>
                            )}
                        </>
                    )}
                    {showEmptyStateNoFilters && (
                        <div className="flex flex-col gap-5 p-20 items-center justify-center bg-bg-elevated rounded">
                            <h3 className="text-title-body text-text-primary">Connect to an external API</h3>
                            <p className="text-text-secondary text-body-medium-regular">
                                Connections can be created by using{' '}
                                <StyledLink to="https://nango.dev/docs/implementation-guides/platform/auth/implement-api-auth" type="external">
                                    Nango Connect
                                </StyledLink>
                                , or manually here.
                            </p>
                            <ButtonLink to={`/${env}/connections/create`} size="lg">
                                Add test connection
                            </ButtonLink>
                        </div>
                    )}

                    {hasNextPage && (
                        <Button onClick={() => fetchNextPage()} loading={isFetchingNextPage} variant="tertiary" className="self-center">
                            Load More
                        </Button>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
};
