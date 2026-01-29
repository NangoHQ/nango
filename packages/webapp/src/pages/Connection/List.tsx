import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Lock, RefreshCcw, Search } from 'lucide-react';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useDebounce } from 'react-use';

import { ConnectionCount } from './components/ConnectionCount';
import { Avatar } from '@/components-v2/Avatar';
import { CopyButton } from '@/components-v2/CopyButton';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { MultiSelect } from '@/components-v2/MultiSelect';
import { StatusCircleWithIcon } from '@/components-v2/StatusCircleWithIcon';
import { StyledLink } from '@/components-v2/StyledLink';
import { Button, ButtonLink } from '@/components-v2/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';
import { useConnections } from '@/hooks/useConnections';
import { useListIntegration } from '@/hooks/useIntegration';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { getConnectionDisplayName, getEndUserEmail } from '@/utils/endUser';
import { formatDateToInternationalFormat } from '@/utils/utils';

import type { ApiConnectionSimple } from '@nangohq/types';
import type { ColumnDef } from '@tanstack/react-table';

const errorOptions = [
    { name: 'OK', value: 'ok' },
    { name: 'Error', value: 'error' }
];

const parseSearch = parseAsString.withDefault('');
const parseIntegrations = parseAsArrayOf(parseAsString, ',').withDefault([]);
const parseErrors = parseAsArrayOf(parseAsString, ',').withDefault([]);

const columns: ColumnDef<ApiConnectionSimple>[] = [
    {
        accessorKey: 'id',
        header: 'Customer',
        size: 180,
        cell: ({ row }) => {
            const data = row.original;

            const displayName = getConnectionDisplayName({ endUser: data.endUser, connectionId: data.connection_id });
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
        size: 180,
        cell: ({ row }) => {
            const { provider } = row.original;

            return (
                <div className="flex gap-1.5 items-center">
                    <IntegrationLogo provider={row.original.provider} className="size-8" />
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
        accessorKey: 'errors',
        header: 'Errors',
        size: 80,
        cell: ({ row }) => {
            const { errors } = row.original;

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
                        <StatusCircleWithIcon tooltipContent="Expired credentials" variant="error">
                            <Lock />
                        </StatusCircleWithIcon>
                    )}
                    {errorCounts.sync > 0 && (
                        <StatusCircleWithIcon tooltipContent="Failed syncs" variant="error">
                            <RefreshCcw />
                        </StatusCircleWithIcon>
                    )}
                </div>
            );
        }
    }
];

export const ConnectionList = () => {
    const env = useStore((state) => state.env);

    const [search, setSearch] = useQueryState('search', parseSearch);
    const [debouncedSearch, setDebouncedSearch] = useState<string>('');
    const [selectedIntegrations, setSelectedIntegrations] = useQueryState('integrations', parseIntegrations);
    const [selectedErrors, setSelectedErrors] = useQueryState('errors', parseErrors);

    useDebounce(() => setDebouncedSearch(search || ''), 300, [search]);

    const { list: listIntegration, loading: integrationsLoading } = useListIntegration(env);

    const withError = useMemo(() => {
        if (selectedErrors && selectedErrors.length === 1) {
            return selectedErrors[0] === 'error';
        }
        return undefined;
    }, [selectedErrors]);

    const integrationIds = useMemo(() => {
        if (!selectedIntegrations || selectedIntegrations.length === 0) return undefined;
        return selectedIntegrations;
    }, [selectedIntegrations]);

    const {
        data: connectionsData,
        isLoading: loading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = useConnections({
        env,
        search: debouncedSearch,
        integrationIds,
        withError
    });

    const connections = useMemo(() => {
        return connectionsData?.pages.flatMap((page) => page.data) || [];
    }, [connectionsData]);

    const hasFiltered = debouncedSearch || (selectedIntegrations && selectedIntegrations.length > 0) || (selectedErrors && selectedErrors.length > 0);

    const connectionCount = connections.length;
    const hasConnections = connectionCount > 0;
    const showEmptyStateNoFilters = !loading && connectionCount === 0 && !hasFiltered;
    const showEmptyStateWithFilters = !loading && connectionCount === 0 && hasFiltered;

    const table = useReactTable({
        data: connections,
        columns,
        getCoreRowModel: getCoreRowModel()
    });

    const integrationsOptions = useMemo(() => {
        if (!listIntegration) {
            return [];
        }
        return listIntegration.map((integration) => {
            return { name: integration.unique_key, value: integration.unique_key };
        });
    }, [listIntegration]);

    return (
        <DashboardLayout>
            <Helmet>
                <title>Connections - Nango</title>
            </Helmet>

            <div className="flex flex-col gap-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h2 className="text-title-subsection text-text-primary">Connections</h2>
                    {(hasConnections || hasFiltered) && (
                        <ButtonLink to={`/${env}/connections/create`} size="lg">
                            Add Test Connection
                        </ButtonLink>
                    )}
                </div>

                {/* Content */}
                <div className="flex flex-col gap-3.5">
                    {(loading || hasConnections || hasFiltered) && (
                        <>
                            {/* Connection count */}
                            <ConnectionCount className="self-end" />
                            {/* Filters */}
                            <div className="flex items-center gap-3.5">
                                <InputGroup className="bg-bg-subtle h-10">
                                    <InputGroupInput type="text" placeholder="Search" value={search || ''} onChange={(e) => setSearch(e.target.value)} />
                                    <InputGroupAddon>
                                        <Search />
                                    </InputGroupAddon>
                                </InputGroup>
                                <MultiSelect
                                    label={selectedIntegrations && selectedIntegrations.length > 0 ? `Integrations` : 'All integrations'}
                                    options={integrationsOptions}
                                    loading={integrationsLoading}
                                    selected={selectedIntegrations || []}
                                    onChange={(selected) => setSelectedIntegrations(selected as string[])}
                                />
                                <MultiSelect
                                    label="Filter errors"
                                    options={errorOptions}
                                    selected={selectedErrors || []}
                                    onChange={(selected) => setSelectedErrors(selected as string[])}
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
                                            <TableRow key={row.id} className="h-16">
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
