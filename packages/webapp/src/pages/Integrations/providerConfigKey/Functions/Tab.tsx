import { Anchor, BookOpen, Cloud, Code, FolderGit2, GitBranch, Info, LibraryBig, Plus, Search } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge, Button, InputGroup, InputGroupAddon, InputGroupInput, Tooltip, TooltipContent, TooltipTrigger } from '@nangohq/design-system';

import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip';
import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { CopyButton } from '@/components/ui/CopyButton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { EmptyCard } from '@/components/ui/EmptyCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useGetIntegrationFunctions, useGetIntegrationTemplates } from '@/hooks/useIntegrationFunctions';
import { useStore } from '@/store';
import { isSyncOrAction } from '@/utils/scripts';
import { cn } from '@/utils/utils';
import { FunctionSwitch } from '../../components/FunctionSwitch.js';

import type { ApiIntegration, FunctionListSource, FunctionType, ListedNangoFunction } from '@nangohq/types';

const TYPE_FILTER_VALUES = ['action', 'sync', 'on-event'] as const;
type TypeFilterValue = (typeof TYPE_FILTER_VALUES)[number];

const TYPE_PILLS: { value: TypeFilterValue; label: string; emptyLabel: string }[] = [
    { value: 'action', label: 'Actions', emptyLabel: 'No actions' },
    { value: 'sync', label: 'Syncs', emptyLabel: 'No syncs' },
    { value: 'on-event', label: 'Triggers', emptyLabel: 'No triggers' }
];

const TYPE_BADGE_LABEL: Record<FunctionType, string> = {
    sync: 'sync',
    action: 'action',
    'on-event': 'on event'
};

const SOURCE_LABEL: Record<FunctionListSource, { label: string; icon: typeof BookOpen }> = {
    catalog: { label: 'Standalone', icon: Anchor },
    standalone: { label: 'Standalone', icon: Anchor },
    repo: { label: 'Your repo', icon: GitBranch },
    'tools-catalog': { label: 'Nango catalog', icon: BookOpen }
};

function functionRowKey(fn: ListedNangoFunction): string {
    const event = fn.type === 'on-event' ? fn.event : '';
    return `${fn.type}:${fn.name}:${event}`;
}

function isTypeFilterValue(value: string): value is TypeFilterValue {
    return (TYPE_FILTER_VALUES as readonly string[]).includes(value);
}

function FunctionSourceLabel({ source }: { source: FunctionListSource }) {
    const { label, icon: Icon } = SOURCE_LABEL[source];
    return (
        <span className="inline-flex items-center gap-1 text-ds-xs text-text-default">
            <Icon className="size-3 shrink-0" />
            {label}
        </span>
    );
}

interface FunctionsTabProps {
    integration: ApiIntegration;
}

export const FunctionsTab: React.FC<FunctionsTabProps> = ({ integration }) => {
    const navigate = useNavigate();
    const env = useStore((state) => state.env);

    const [search, setSearch] = useQueryState('search', parseAsString.withDefault(''));
    const debouncedSearch = useDebouncedValue(search);

    const [rawType, setType] = useQueryState('type', parseAsString.withDefault(''));
    const typeFilter: TypeFilterValue = rawType && isTypeFilterValue(rawType) ? rawType : 'action';

    const {
        data,
        isLoading,
        error,
        fetchNextPage,
        hasNextPage = false,
        isFetchingNextPage,
        isPlaceholderData
    } = useGetIntegrationFunctions({
        env,
        providerConfigKey: integration.unique_key,
        search: debouncedSearch || undefined,
        type: typeFilter
    });

    // Unfiltered totals for the pills. Search only narrows the active table.
    const actionCounts = useGetIntegrationFunctions({ env, providerConfigKey: integration.unique_key, type: 'action', limit: 1 });
    const syncCounts = useGetIntegrationFunctions({ env, providerConfigKey: integration.unique_key, type: 'sync', limit: 1 });
    const triggerCounts = useGetIntegrationFunctions({ env, providerConfigKey: integration.unique_key, type: 'on-event', limit: 1 });

    const sentinelRef = useInfiniteScroll({ hasNextPage, isFetchingNextPage, fetchNextPage });

    // Prefetch templates so the count is ready and the catalog page opens warm (the Templates page shares this query key).
    const { data: templatesResponse } = useGetIntegrationTemplates({ env, providerConfigKey: integration.unique_key });
    const templatesCount = templatesResponse?.data.length;

    const onBrowseTemplates = useCallback(() => {
        navigate(`/${env}/integrations/${integration.unique_key}/templates`);
    }, [env, integration.unique_key, navigate]);

    const onFunctionClick = useCallback(
        (fn: ListedNangoFunction) => {
            navigate(`/${env}/integrations/${integration.unique_key}/functions/${encodeURIComponent(fn.name)}?type=${fn.type}`);
        },
        [env, integration.unique_key, navigate]
    );

    const functions: ListedNangoFunction[] = data?.pages.flatMap((page) => page.data) ?? [];
    const total = data?.pages[0]?.pagination.total ?? 0;

    const counts: Record<TypeFilterValue, number | undefined> = {
        action: actionCounts.data?.pages[0]?.pagination.total,
        sync: syncCounts.data?.pages[0]?.pagination.total,
        'on-event': triggerCounts.data?.pages[0]?.pagination.total
    };
    const countsSettled = [actionCounts, syncCounts, triggerCounts].every((query) => query.isSuccess || query.isError);
    const countsReady = counts.action != null && counts.sync != null && counts['on-event'] != null;
    const totalAcrossTypes = (counts.action ?? 0) + (counts.sync ?? 0) + (counts['on-event'] ?? 0);

    if (error) {
        return <CriticalErrorAlert message="Something went wrong while loading the functions" />;
    }

    const hasSearch = Boolean(debouncedSearch);
    const showEmptyNoFilters = countsReady && !hasSearch && totalAcrossTypes === 0 && !isLoading;
    const showEmptyWithSearch = !isLoading && functions.length === 0 && hasSearch;
    const showEmptyType = countsSettled && !hasSearch && functions.length === 0 && !showEmptyNoFilters && !isLoading;
    const waitingForEmptyDecision = !hasSearch && functions.length === 0 && !countsSettled;
    const activePill = TYPE_PILLS.find((pill) => pill.value === typeFilter) ?? TYPE_PILLS[0];

    return (
        <div className="flex flex-col gap-4 w-full">
            {isLoading || waitingForEmptyDecision ? (
                <Skeleton className="w-full h-50" />
            ) : showEmptyNoFilters ? (
                <EmptyCard>
                    <h3 className="text-title-body text-text-strong">No functions deployed in this integration yet</h3>
                    <p className="text-text-secondary text-body-medium-regular text-center">Browse the template catalog or build your own custom functions.</p>
                    <div className="flex items-center gap-2">
                        <ConditionalTooltip condition={templatesCount === 0} content="There are no templates available for this provider yet.">
                            <Button type="button" onClick={onBrowseTemplates} disabled={templatesCount === 0}>
                                <LibraryBig /> Browse {templatesCount ? `${templatesCount} ` : ''}templates
                            </Button>
                        </ConditionalTooltip>
                        <ButtonLink to="https://nango.dev/docs/guides/functions/functions-guide" target="_blank" variant="secondary">
                            <Code /> Build custom
                        </ButtonLink>
                    </div>
                </EmptyCard>
            ) : (
                <>
                    <div className="flex items-center gap-2">
                        {TYPE_PILLS.map((pill) => {
                            const selected = pill.value === typeFilter;
                            const count = counts[pill.value];
                            return (
                                <button
                                    key={pill.value}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => void setType(pill.value)}
                                    className={cn(
                                        'inline-flex items-center justify-center gap-1 rounded-full border-ds-hairline px-2 py-0.5 cursor-pointer',
                                        selected
                                            ? 'bg-status-info-bg border-status-info-border text-status-info-text'
                                            : 'bg-surface-panel border-border-default text-text-default'
                                    )}
                                >
                                    <span className="text-ds-xs font-ds-medium leading-ds-normal">{pill.label}</span>
                                    {count != null && <span className="text-ds-2xs font-ds-regular tracking-ds-tight">{count}</span>}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-2">
                        <InputGroup>
                            <InputGroupInput
                                type="text"
                                placeholder="Search functions"
                                value={search || ''}
                                onChange={(e) => setSearch(e.target.value || null)}
                            />
                            <InputGroupAddon>
                                <Search />
                            </InputGroupAddon>
                        </InputGroup>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button type="button" size="md">
                                    <Plus /> Add
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64">
                                <ConditionalTooltip
                                    condition={templatesCount === 0}
                                    content="There are no templates available for this provider yet."
                                    side="left"
                                >
                                    <DropdownMenuItem onSelect={onBrowseTemplates} disabled={templatesCount === 0}>
                                        <div className="flex items-center gap-4">
                                            <LibraryBig />
                                            <div>
                                                <span className="text-text-strong text-body-medium-medium">
                                                    Browse {templatesCount ? `${templatesCount} ` : ''}templates
                                                </span>
                                                <p className="text-text-secondary text-body-small-regular">
                                                    Browse a list of pre-built functions that may fit your use case.
                                                </p>
                                            </div>
                                        </div>
                                    </DropdownMenuItem>
                                </ConditionalTooltip>
                                <DropdownMenuItem asChild>
                                    <a
                                        href="https://nango.dev/docs/guides/functions/functions-guide#guide"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-4"
                                    >
                                        <Code />
                                        <div>
                                            <span className="text-text-strong text-body-medium-medium">Build custom</span>
                                            <p className="text-text-secondary text-body-small-regular">
                                                Bring your own code or leverage AI agents to build for your use case.
                                            </p>
                                        </div>
                                    </a>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    {isPlaceholderData ? (
                        <Skeleton className="w-full h-50" />
                    ) : showEmptyWithSearch ? (
                        <EmptyCard>
                            <p className="text-text-secondary text-body-medium-regular">No functions match your filters.</p>
                        </EmptyCard>
                    ) : showEmptyType ? (
                        <EmptyCard>
                            <p className="text-text-secondary text-body-medium-regular">{activePill.emptyLabel}</p>
                        </EmptyCard>
                    ) : typeFilter === 'action' ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="h-8 px-3 text-ds-3xs font-ds-regular tracking-ds-tight text-text-secondary uppercase">
                                        Function name
                                    </TableHead>
                                    <TableHead className="h-8 w-35 px-3 text-ds-3xs font-ds-regular tracking-ds-tight text-text-secondary uppercase">
                                        Source
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {functions.map((fn) => (
                                    <TableRow
                                        key={functionRowKey(fn)}
                                        className="h-12 cursor-pointer hover:bg-surface-panel-inset"
                                        onClick={() => onFunctionClick(fn)}
                                    >
                                        <TableCell className="max-w-0 px-3 whitespace-normal">
                                            <div className="flex min-w-0 flex-col gap-0.5">
                                                <span className="truncate font-mono text-ds-2xs font-ds-medium leading-ds-normal text-text-default">
                                                    {fn.name}
                                                </span>
                                                {fn.description && (
                                                    <span className="truncate text-ds-3xs tracking-ds-tight text-text-disabled">{fn.description}</span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="w-35 px-3">
                                            <FunctionSourceLabel source={fn.source} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter className="bg-transparent font-ds-regular">
                                <TableRow className="h-8 hover:bg-transparent">
                                    <TableCell colSpan={2} className="px-3 text-ds-2xs tracking-ds-tight text-text-disabled">
                                        Showing {functions.length} of {total} actions
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Source code</TableHead>
                                    <TableHead className="text-center">Enabled</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {functions.map((fn) => (
                                    <TableRow
                                        key={functionRowKey(fn)}
                                        className="cursor-pointer hover:bg-surface-panel-inset"
                                        onClick={() => onFunctionClick(fn)}
                                    >
                                        <TableCell>
                                            <div className="flex items-center gap-1.5">
                                                {fn.name}
                                                {fn.description && (
                                                    <Tooltip>
                                                        <TooltipTrigger>
                                                            <Info className="size-3.5 text-icon-muted cursor-pointer" />
                                                        </TooltipTrigger>
                                                        <TooltipContent>{fn.description}</TooltipContent>
                                                    </Tooltip>
                                                )}
                                                <CopyButton text={fn.name} />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge case="capitalize">{TYPE_BADGE_LABEL[fn.type]}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            {fn.source === 'repo' ? (
                                                <Badge variant="outline">
                                                    <FolderGit2 /> Your repo
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline">
                                                    <Cloud /> Nango
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-center items-center">
                                                {isSyncOrAction(fn) && <FunctionSwitch flow={fn} integration={integration} />}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}

                    <div ref={sentinelRef} aria-hidden />
                    {isFetchingNextPage && <Skeleton className="w-full h-12" />}
                </>
            )}
        </div>
    );
};
