import { LeftNavBarItems } from '../../components/LeftNavBar';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { useSearchOperations } from '../../hooks/useLogs';
import * as Table from '../../components/ui/Table';
import { getCoreRowModel, useReactTable, flexRender } from '@tanstack/react-table';

import { MultiSelect } from '../../components/MultiSelect';
import {
    columns,
    connectionsDefaultOptions,
    integrationsDefaultOptions,
    statusDefaultOptions,
    statusOptions,
    syncsDefaultOptions,
    typesDefaultOptions
} from './constants';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
    SearchOperations,
    SearchOperationsData,
    SearchOperationsIntegration,
    SearchOperationsPeriod,
    SearchOperationsState,
    SearchOperationsSync,
    SearchOperationsType
} from '@nangohq/types';
import Spinner from '../../components/ui/Spinner';
// import { Input } from '../../components/ui/input/Input';
// import { MagnifyingGlassIcon } from '@radix-ui/react-icons';
import { formatQuantity, stringArrayEqual } from '../../utils/utils';
import { Link, useSearchParams } from 'react-router-dom';
import { useDebounce, useIntersection, useInterval, usePreviousDistinct } from 'react-use';
import { SearchableMultiSelect } from './components/SearchableMultiSelect';
import { TypesSelect } from './components/TypesSelect';
import { DatePicker } from './components/DatePicker';
import { Button } from '../../components/ui/button/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { OperationDrawer } from './components/OperationDrawer';
import { OperationRow } from './components/OperationRow';
import type { DateRange } from 'react-day-picker';
import { getPresetRange, matchPresetFromRange, slidePeriod } from '../../utils/logs';
import { ErrorPageComponent } from '../../components/ErrorComponent';
import { Helmet } from 'react-helmet';

const limit = 20;

export const LogsSearch: React.FC = () => {
    const env = useStore((state) => state.env);
    const prevEnv = usePreviousDistinct(env);
    const [searchParams, setSearchParams] = useSearchParams();

    // --- Global state
    const [synced, setSynced] = useState(false);
    const [operationId, setOperationId] = useState<string>();

    // --- Data fetch
    const [isLive, setIsLive] = useState(true);
    const [states, setStates] = useState<SearchOperationsState[]>(statusDefaultOptions);
    const [types, setTypes] = useState<SearchOperationsType[]>(typesDefaultOptions);
    const [integrations, setIntegrations] = useState<SearchOperationsIntegration[]>(integrationsDefaultOptions);
    const [connections, setConnections] = useState<SearchOperationsIntegration[]>(integrationsDefaultOptions);
    const [syncs, setSyncs] = useState<SearchOperationsSync[]>(syncsDefaultOptions);
    const [period, setPeriod] = useState<DateRange>(() => getPresetRange('last24h'));
    const [periodString, setPeriodString] = useState<SearchOperationsPeriod>();
    const cursor = useRef<SearchOperations['Body']['cursor']>();
    const [hasLoadedMore, setHasLoadedMore] = useState<boolean>(false);
    const [readyToDisplay, setReadyToDisplay] = useState<boolean>(false);
    const { data, error, loading, trigger, manualFetch } = useSearchOperations(
        env,
        { limit, states, types, integrations, connections, syncs, period: periodString },
        isLive
    );
    const [operations, setOperations] = useState<SearchOperationsData[]>([]);

    useEffect(
        function resetEnv() {
            if (prevEnv && env && prevEnv !== env) {
                setSynced(false);
                setReadyToDisplay(false);
                setOperations([]);
                setStates(statusDefaultOptions);
                setTypes(typesDefaultOptions);
                setIntegrations(integrationsDefaultOptions);
                setConnections(integrationsDefaultOptions);
                setSyncs(syncsDefaultOptions);
                setPeriod(getPresetRange('last24h'));

                setHasLoadedMore(false);
                cursor.current = null;
            }
        },
        [env, prevEnv]
    );

    useEffect(() => {
        // Data aggregation to enable infinite scroll
        // Because states are changing we need to deduplicate and update rows
        setOperations((prev) => {
            if (prev.length <= 0 || !data?.data) {
                return data?.data || [];
            }

            const next = data.data;
            for (const item of prev) {
                if (next.find((n) => n.id === item.id)) {
                    continue;
                }
                next.push(item);
            }

            return next;
        });
        setReadyToDisplay(true);
    }, [data?.data]);

    useEffect(() => {
        if (data?.pagination.cursor && !hasLoadedMore) {
            // We set the cursor only on first page (if we haven't hit a next page)
            // Otherwise the live refresh will erase
            cursor.current = data.pagination.cursor;
        }
    }, [hasLoadedMore, data]);

    useDebounce(
        () => {
            // We clear the cursor because it's a brand new search
            cursor.current = null;
            // Debounce the trigger to avoid spamming the backend and avoid conflict with rapid filter change
            trigger();
        },
        200,
        [limit, states, types, integrations, connections, syncs, period, prevEnv]
    );

    // --- Query Params
    useEffect(
        function syncQueryParamsToState() {
            // Sync the query params to the react state, it allows to share the URL
            // we do it only on load, after that we don't care about the update
            if (synced) {
                return;
            }

            const tmpStates = searchParams.get('states');
            if (tmpStates) {
                setStates(tmpStates.split(',') as any);
            }

            const tmpIntegrations = searchParams.get('integrations');
            if (tmpIntegrations) {
                setIntegrations(tmpIntegrations.split(',') as any);
            }

            const tmpConnections = searchParams.get('connections');
            if (tmpConnections) {
                setConnections(tmpConnections.split(',') as any);
            }

            const tmpSyncs = searchParams.get('syncs');
            if (tmpSyncs) {
                setSyncs(tmpSyncs.split(',') as any);
            }

            const tmpTypes = searchParams.get('types');
            if (tmpTypes) {
                setTypes(tmpTypes.split(',') as any);
            }

            const tmpFrom = searchParams.get('from');
            const tmpTo = searchParams.get('to');
            if (tmpFrom && tmpTo) {
                const tmpLive = searchParams.get('live');
                const isLive = tmpLive === null || tmpLive === 'true';
                setIsLive(isLive);
                setPeriod(isLive ? slidePeriod({ from: new Date(tmpFrom), to: new Date(tmpTo) }) : { from: new Date(tmpFrom), to: new Date(tmpTo) });
            }

            const tmpOperationId = searchParams.get('operationId');
            if (tmpOperationId) {
                setOperationId(tmpOperationId);
            }

            setSynced(true);
        },
        [searchParams, synced]
    );

    useEffect(
        function resetSearchOnFilterChanges() {
            setOperations([]);
            setHasLoadedMore(false);
            setReadyToDisplay(false);
        },
        [states, integrations, period, connections, syncs, types]
    );
    useEffect(
        function syncStateToQueryParams() {
            if (!synced) {
                return;
            }

            // Sync the state back to the URL for sharing
            const tmp = new URLSearchParams();
            if (states.length > 0 && !stringArrayEqual(states, statusDefaultOptions)) {
                tmp.set('states', states as any);
            }
            if (integrations.length > 0 && !stringArrayEqual(integrations, integrationsDefaultOptions)) {
                tmp.set('integrations', integrations as any);
            }
            if (connections.length > 0 && !stringArrayEqual(connections, connectionsDefaultOptions)) {
                tmp.set('connections', connections as any);
            }
            if (syncs.length > 0 && !stringArrayEqual(syncs, syncsDefaultOptions)) {
                tmp.set('syncs', syncs as any);
            }
            if (types.length > 0 && !stringArrayEqual(types, typesDefaultOptions)) {
                tmp.set('types', types as any);
            }
            if (!isLive) {
                tmp.set('live', 'false');
            }
            if (periodString) {
                const matched = matchPresetFromRange({ from: new Date(periodString.from), to: new Date(periodString.to) });
                if (matched?.name !== 'last24h') {
                    tmp.set('from', periodString.from);
                    tmp.set('to', periodString.to);
                }
            }
            if (operationId) {
                tmp.set('operationId', operationId);
            }

            tmp.sort();
            if (tmp.toString() !== searchParams.toString()) {
                setSearchParams(tmp);
            }
        },
        [states, integrations, periodString, connections, syncs, types, operationId, isLive, synced]
    );

    // --- Table Display
    const table = useReactTable({
        data: operations,
        columns,
        getCoreRowModel: getCoreRowModel()
    });
    const totalHumanReadable = useMemo(() => {
        if (!data?.pagination) {
            return 0;
        }
        return formatQuantity(data.pagination.total);
    }, [data?.pagination]);

    // --- Live // auto refresh
    useInterval(
        function onAutoRefresh() {
            trigger();
        },
        synced && isLive && !loading ? 7000 : null
    );

    // --- Infinite scroll
    // We use the cursor manually because we want to keep refreshing the head even we add stuff to the tail
    const bottomScrollRef = useRef(null);
    const bottomScroll = useIntersection(bottomScrollRef, {
        root: null,
        rootMargin: '0px',
        threshold: 1
    });
    const appendItems = async () => {
        if (!cursor.current) {
            return;
        }
        const rows = await manualFetch(cursor.current);
        if (!rows || 'error' in rows) {
            return;
        }

        setHasLoadedMore(true);
        cursor.current = rows.res.pagination.cursor;
        setOperations((prev) => [...prev, ...rows.res.data]);
    };
    useEffect(() => {
        // when the load more button is fully in view
        if (!bottomScroll || !bottomScroll.isIntersecting) {
            return;
        }
        if (cursor.current && !loading) {
            void appendItems();
        }
    }, [bottomScroll, loading, bottomScrollRef]);

    const loadMore = () => {
        if (!loading) {
            void appendItems();
        }
    };

    // Operation select
    const onSelectOperation = (open: boolean, operationId: string) => {
        setOperationId(open ? operationId : undefined);
    };

    // Period
    const onPeriodChange = (range: DateRange, live: boolean) => {
        setPeriod(range);
        setIsLive(live);
    };
    useEffect(() => {
        setPeriodString({ from: period.from!.toISOString(), to: period.to!.toISOString() });
    }, [period]);

    if (error) {
        if (error.error.code === 'feature_disabled') {
            return (
                <DashboardLayout selectedItem={LeftNavBarItems.Logs} fullWidth className="p-6">
                    <Helmet>
                        <title>Logs - Nango</title>
                    </Helmet>
                    <h2 className="text-3xl font-semibold text-white mb-4">Logs</h2>
                    <div className="flex gap-2 flex-col border border-border-gray rounded-md items-center text-white text-center p-10 py-20">
                        <h2 className="text-xl text-center">Logs not configured</h2>
                        <div className="text-sm text-gray-400">
                            Follow{' '}
                            <Link to="https://docs.nango.dev/guides/self-hosting/free-self-hosting/overview#logs" className="text-blue-400">
                                these instructions
                            </Link>{' '}
                            to configure logs.
                        </div>
                    </div>
                </DashboardLayout>
            );
        }

        return <ErrorPageComponent title="Logs" error={error} page={LeftNavBarItems.Logs} />;
    }

    if (!synced) {
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Logs} fullWidth className="p-6">
                <Helmet>
                    <title>Logs - Nango</title>
                </Helmet>
                <h2 className="text-3xl font-semibold text-white mb-4">Logs</h2>

                <div className="flex gap-2 flex-col">
                    <Skeleton style={{ width: '50%' }} />
                    <Skeleton style={{ width: '50%' }} />
                    <Skeleton style={{ width: '50%' }} />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Logs} fullWidth className="p-6">
            <Helmet>
                <title>Logs - Nango</title>
            </Helmet>
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-semibold text-white mb-4 flex gap-4 items-center">Logs {loading && <Spinner size={1} />}</h2>
                <div className="text-white text-xs">
                    {totalHumanReadable} {data?.pagination && data.pagination.total > 1 ? 'logs' : 'log'} found
                </div>
            </div>
            <div className="flex gap-2 justify-between">
                <div className="w-full">{/* <Input before={<MagnifyingGlassIcon className="w-5 h-5" />} placeholder="Search operations..." /> */}</div>
                <div className="flex gap-2">
                    <MultiSelect label="Status" options={statusOptions} selected={states} defaultSelect={statusDefaultOptions} onChange={setStates} all />
                    <TypesSelect selected={types} onChange={setTypes} />
                    <SearchableMultiSelect label="Integration" selected={integrations} category={'integration'} onChange={setIntegrations} max={20} />
                    <SearchableMultiSelect label="Connection" selected={connections} category={'connection'} onChange={setConnections} max={20} />
                    <SearchableMultiSelect label="Script" selected={syncs} category={'syncConfig'} onChange={setSyncs} max={20} />

                    <DatePicker isLive={isLive} period={period} onChange={onPeriodChange} />
                </div>
            </div>
            <Table.Table className="my-4 table-fixed">
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
                    {loading && !readyToDisplay && (
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
                        table.getRowModel().rows.map((row) => <OperationRow key={row.original.id} row={row} onSelectOperation={onSelectOperation} />)}

                    {operations.length <= 0 && readyToDisplay && (
                        <Table.Row>
                            <Table.Cell colSpan={columns.length} className="h-24 text-center p-0 pt-4">
                                <div className="flex gap-2 flex-col border border-border-gray rounded-md items-center text-white text-center p-10 py-20">
                                    <div className="text-center">No logs found</div>
                                    <div className="text-gray-400">Note that logs older than 15 days are automatically cleared.</div>
                                </div>
                            </Table.Cell>
                        </Table.Row>
                    )}
                </Table.Body>
            </Table.Table>
            {data && data.pagination.total > 0 && data.data.length > 0 && cursor.current && readyToDisplay && (
                <div ref={bottomScrollRef}>
                    <Button disabled={loading} variant="active" className="w-full justify-center" onClick={() => loadMore()}>
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

            {operationId && <OperationDrawer key={operationId} operationId={operationId} onClose={onSelectOperation} />}
        </DashboardLayout>
    );
};
