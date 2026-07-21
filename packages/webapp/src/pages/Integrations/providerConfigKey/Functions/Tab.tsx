import { Cloud, Code, FolderGit2, Info, LibraryBig, Plus, Search } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge, Button, InputGroup, InputGroupAddon, InputGroupInput } from '@nangohq/design-system';

import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip';
import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { SingleSelectFilter } from '@/components/ui/Combobox';
import { CopyButton } from '@/components/ui/CopyButton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { EmptyCard } from '@/components/ui/EmptyCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useGetIntegrationFunctions, useGetIntegrationTemplates } from '@/hooks/useIntegrationFunctions';
import { useStore } from '@/store';
import { isSyncOrAction } from '@/utils/scripts';
import { FunctionSwitch } from '../../components/FunctionSwitch.js';

import type { ComboboxOption } from '@/components/ui/Combobox';
import type { ApiIntegration, DeployedNangoFunction, FunctionType } from '@nangohq/types';

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

interface FunctionsTabProps {
    integration: ApiIntegration;
}

export const FunctionsTab: React.FC<FunctionsTabProps> = ({ integration }) => {
    const navigate = useNavigate();
    const env = useStore((state) => state.env);

    const [search, setSearch] = useQueryState('search', parseAsString.withDefault(''));
    const debouncedSearch = useDebouncedValue(search);

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

    // Prefetch templates so the count is ready and the catalog page opens warm (the Templates page shares this query key).
    const { data: templatesResponse } = useGetIntegrationTemplates({ env, providerConfigKey: integration.unique_key });
    const templatesCount = templatesResponse?.data.length;

    const onBrowseTemplates = useCallback(() => {
        navigate(`/${env}/integrations/${integration.unique_key}/templates`);
    }, [env, integration.unique_key, navigate]);

    const onFunctionClick = useCallback(
        (fn: DeployedNangoFunction) => {
            navigate(`/${env}/integrations/${integration.unique_key}/functions/${encodeURIComponent(fn.name)}?type=${fn.type}`);
        },
        [env, integration.unique_key, navigate]
    );

    const functions: DeployedNangoFunction[] = data?.pages.flatMap((page) => page.data) ?? [];
    const total = data?.pages[0]?.pagination.total ?? 0;

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
                    <div className="flex items-center gap-1.5">
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
                        <SingleSelectFilter<TypeFilterValue>
                            value={typeFilter ?? null}
                            onChange={(value) => void setType(value)}
                            options={TYPE_OPTIONS}
                            placeholderLabel="All types"
                            selectedLabel="Type"
                            dropdownTitle="Filter by type"
                        />
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
                                    <TableRow
                                        key={`${fn.type}:${fn.id}`}
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
                                            <Badge case="upper">{TYPE_BADGE_LABEL[fn.type]}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            {fn.source === 'repo' ? (
                                                <Badge case="upper">
                                                    <FolderGit2 /> Your repo
                                                </Badge>
                                            ) : (
                                                <Badge case="upper">
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
