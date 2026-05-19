import { Cloud, Code, FolderGit2, Info, LibraryBig, Plus, Search } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from 'react-use';

import { FunctionSwitch } from '../../components/FunctionSwitch.js';
import { CopyButton } from '@/components-v2/CopyButton';
import { CriticalErrorAlert } from '@/components-v2/CriticalErrorAlert.js';
import { EmptyCard } from '@/components-v2/EmptyCard.js';
import { Badge } from '@/components-v2/ui/badge';
import { Button, ButtonLink } from '@/components-v2/ui/button';
import { ComboboxSelect } from '@/components-v2/ui/combobox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components-v2/ui/dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Skeleton } from '@/components-v2/ui/skeleton.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components-v2/ui/tooltip';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useGetIntegrationFunctions } from '@/hooks/useIntegrationFunctions';
import { useStore } from '@/store';

import type { ComboboxOption } from '@/components-v2/ui/combobox';
import type { ApiIntegration, FunctionType, NangoActionFunctionDeployed, NangoFunctionDeployed, NangoSyncFunctionDeployed } from '@nangohq/types';

const TYPE_FILTER_VALUES = ['sync', 'action', 'on-event'] as const;
type TypeFilterValue = (typeof TYPE_FILTER_VALUES)[number];

const TYPE_OPTIONS: ComboboxOption<TypeFilterValue>[] = [
    { value: 'sync', label: 'Sync' },
    { value: 'action', label: 'Action' },
    { value: 'on-event', label: 'On-event' }
];

const TYPE_BADGE_LABEL: Record<FunctionType, string> = {
    sync: 'sync',
    action: 'action',
    'on-event': 'on event'
};

function isTypeFilterValue(value: string): value is TypeFilterValue {
    return (TYPE_FILTER_VALUES as readonly string[]).includes(value);
}

function isSyncOrAction(fn: NangoFunctionDeployed): fn is NangoSyncFunctionDeployed | NangoActionFunctionDeployed {
    return fn.type === 'sync' || fn.type === 'action';
}

interface FunctionsTabProps {
    integration: ApiIntegration;
}

export const FunctionsTab: React.FC<FunctionsTabProps> = ({ integration }) => {
    const navigate = useNavigate();
    const env = useStore((state) => state.env);

    const [search, setSearch] = useQueryState('search', parseAsString.withDefault(''));
    const [debouncedSearch, setDebouncedSearch] = useState<string>('');
    useDebounce(() => setDebouncedSearch(search || ''), 300, [search]);

    const [rawType, setType] = useQueryState('type', parseAsString.withDefault(''));
    const typeFilter: TypeFilterValue | undefined = rawType && isTypeFilterValue(rawType) ? rawType : undefined;

    const {
        data,
        isLoading,
        error,
        fetchNextPage,
        hasNextPage = false,
        isFetchingNextPage
    } = useGetIntegrationFunctions({
        env,
        providerConfigKey: integration.unique_key,
        search: debouncedSearch || undefined,
        type: typeFilter
    });

    const sentinelRef = useInfiniteScroll({ hasNextPage, isFetchingNextPage, fetchNextPage });

    const onBrowseTemplates = useCallback(() => {
        navigate(`/${env}/integrations/${integration.unique_key}/templates`);
    }, [env, integration.unique_key, navigate]);

    const onFunctionClick = useCallback(
        (fn: NangoFunctionDeployed) => {
            navigate(`/${env}/integrations/${integration.unique_key}/functions/${encodeURIComponent(fn.name)}?type=${fn.type}`);
        },
        [env, integration.unique_key, navigate]
    );

    // Mirrors the empty-pages-then-more-pages behavior used in Connection/List.tsx — though here the
    // server applies the filter so we shouldn't get empty pages in practice. Kept as a safety net.
    const functions: NangoFunctionDeployed[] = data?.pages.flatMap((page) => page.data) ?? [];
    const total = data?.pages[0]?.pagination.total ?? 0;
    useEffect(() => {
        if (functions.length === 0 && hasNextPage && !isFetchingNextPage && !isLoading) {
            void fetchNextPage();
        }
    }, [functions.length, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage]);

    if (error) {
        return <CriticalErrorAlert message="Something went wrong while loading the functions" />;
    }

    const hasFilters = Boolean(debouncedSearch) || Boolean(typeFilter);
    const showEmptyNoFilters = !isLoading && total === 0 && !hasFilters;
    const showEmptyWithFilters = !isLoading && functions.length === 0 && hasFilters;

    return (
        <div className="flex flex-col gap-3 w-full">
            {isLoading ? (
                <Skeleton className="w-full h-50" />
            ) : showEmptyNoFilters ? (
                <EmptyCard>
                    <h3 className="text-title-body text-text-primary">No functions deployed in this integrationyet</h3>
                    <p className="text-text-secondary text-body-medium-regular text-center">Browse the template catalog or build your own custom functions.</p>
                    <div className="flex items-center gap-2">
                        <Button type="button" onClick={onBrowseTemplates}>
                            <LibraryBig /> Browse templates
                        </Button>
                        <ButtonLink to="https://nango.dev/docs/guides/functions/functions-guide" target="_blank" variant="secondary">
                            <Code /> Build custom
                        </ButtonLink>
                    </div>
                </EmptyCard>
            ) : (
                <>
                    <div className="flex items-center gap-1.5">
                        <InputGroup className="h-10">
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
                        <ComboboxSelect<TypeFilterValue>
                            allowMultiple
                            label={typeFilter ? 'Type' : 'All types'}
                            dropdownTitle="Filter by type"
                            options={TYPE_OPTIONS}
                            selected={typeFilter ? [typeFilter] : []}
                            onSelectedChange={(next) => {
                                // Endpoint only accepts a single `type`; collapse to the most recently picked value.
                                const newlyAdded = next.find((value) => value !== typeFilter);
                                void setType(newlyAdded ?? null);
                            }}
                            onClearAll={() => void setType(null)}
                            reorderOnSelect={false}
                            showSearch={false}
                        />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button type="button" className="h-full">
                                    <Plus /> Add
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-64">
                                <DropdownMenuItem onSelect={onBrowseTemplates}>
                                    <div className="flex items-center gap-4">
                                        <LibraryBig />
                                        <div className="">
                                            <span className="text-text-primary text-body-medium-medium">Browse catalog</span>
                                            <p className="text-text-secondary text-body-small-regular">
                                                Browse a list of pre-built functions that may fit your use case.
                                            </p>
                                        </div>
                                    </div>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <a
                                        href="https://nango.dev/docs/guides/functions/functions-guide#guide"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-4"
                                    >
                                        <Code />
                                        <div className="">
                                            <span className="text-text-primary text-body-medium-medium">Build custom</span>
                                            <p className="text-text-secondary text-body-small-regular">
                                                Bring your own code or leverage AI agents to build for your use case.
                                            </p>
                                        </div>
                                    </a>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    {showEmptyWithFilters ? (
                        <EmptyCard>
                            <p className="text-text-secondary text-body-medium-regular">No functions match your filters.</p>
                        </EmptyCard>
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
                                    <TableRow key={`${fn.type}:${fn.id}`} className="cursor-pointer hover:bg-bg-subtle" onClick={() => onFunctionClick(fn)}>
                                        <TableCell>
                                            <div className="flex items-center gap-1.5">
                                                {fn.name}
                                                {fn.description && (
                                                    <Tooltip>
                                                        <TooltipTrigger>
                                                            <Info className="size-3.5 text-icon-tertiary cursor-pointer" />
                                                        </TooltipTrigger>
                                                        <TooltipContent>{fn.description}</TooltipContent>
                                                    </Tooltip>
                                                )}
                                                <CopyButton text={fn.name} />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="gray" className="uppercase">
                                                {TYPE_BADGE_LABEL[fn.type]}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {fn.source === 'repo' ? (
                                                <Badge variant="gray" className="uppercase">
                                                    <FolderGit2 /> Your repo
                                                </Badge>
                                            ) : (
                                                <Badge variant="gray" className="uppercase">
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
