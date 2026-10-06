import { Anchor, BookOpen, Code, GitBranch, LayoutTemplate, LibraryBig, Plus, Search } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, InputGroup, InputGroupAddon, InputGroupInput, Tooltip, TooltipContent, TooltipTrigger } from '@nangohq/design-system';

import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip';
import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { EmptyCard } from '@/components/ui/EmptyCard';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { usePreBuiltDeployFlow } from '@/hooks/useFlow';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useGetIntegrationFunctions, useGetIntegrationTemplates } from '@/hooks/useIntegrationFunctions';
import { useMeta } from '@/hooks/useMeta';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { APIError } from '@/utils/api';
import { isSyncOrAction } from '@/utils/scripts';
import { cn } from '@/utils/utils';
import { FunctionSwitch } from '../../components/FunctionSwitch.js';

import type { ApiError, ApiIntegration, FunctionListSource, ListedNangoFunction, NangoFunctionTemplate } from '@nangohq/types';

const TYPE_FILTER_VALUES = ['action', 'sync', 'on-event'] as const;
type TypeFilterValue = (typeof TYPE_FILTER_VALUES)[number];

const TYPE_PILLS: { value: TypeFilterValue; label: string; emptyLabel: string }[] = [
    { value: 'action', label: 'Actions', emptyLabel: 'No actions' },
    { value: 'sync', label: 'Syncs', emptyLabel: 'No syncs' },
    { value: 'on-event', label: 'Triggers', emptyLabel: 'No triggers' }
];

const SOURCE_LABEL: Record<FunctionListSource | 'template', { label: string; icon: typeof BookOpen; tooltip: string }> = {
    catalog: { label: 'Standalone', icon: Anchor, tooltip: 'Deployed function, the source-code lives in Nango.' },
    standalone: { label: 'Standalone', icon: Anchor, tooltip: 'Deployed function, the source-code lives in Nango.' },
    repo: { label: 'Your repo', icon: GitBranch, tooltip: 'Deployed from the Nango CLI. You own the source-code.' },
    'tools-catalog': {
        label: 'Nango catalog',
        icon: BookOpen,
        tooltip: 'Written and maintained by Nango. Always on the latest version (auto-updates).'
    },
    template: { label: 'Template', icon: LayoutTemplate, tooltip: 'A template you can deploy or customize.' }
};

function functionRowKey(fn: ListedNangoFunction): string {
    const event = fn.type === 'on-event' ? fn.event : '';
    return `${fn.type}:${fn.name}:${event}`;
}

function isTypeFilterValue(value: string): value is TypeFilterValue {
    return (TYPE_FILTER_VALUES as readonly string[]).includes(value);
}

const COLUMN_HEAD = 'h-8 px-3';

function ColumnHead({ className, children }: { className?: string; children: string }) {
    return (
        <TableHead className={cn(COLUMN_HEAD, className)}>
            <span className="type-label-xxs uppercase text-text-secondary">{children}</span>
        </TableHead>
    );
}

function FunctionSourceLabel({ source }: { source: FunctionListSource | 'template' }) {
    const { label, icon: Icon, tooltip } = SOURCE_LABEL[source];
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 type-label-sm text-text-default">
                    <Icon className="size-3 shrink-0" />
                    {label}
                </span>
            </TooltipTrigger>
            <TooltipContent side="left">{tooltip}</TooltipContent>
        </Tooltip>
    );
}

function FunctionNameCell({ name, description }: { name: string; description?: string }) {
    return (
        <TableCell className="max-w-0 px-3 whitespace-normal">
            <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate type-code-medium-xs text-text-default">{name}</span>
                {description && <span className="truncate type-label-xxs text-text-disabled">{description}</span>}
            </div>
        </TableCell>
    );
}

function FunctionStatus({ fn, integration }: { fn: ListedNangoFunction; integration: ApiIntegration }) {
    if (fn.source === 'tools-catalog') {
        return (
            <div className="flex items-center gap-1">
                <span className="type-label-sm !leading-none text-text-link-success">Enabled</span>
                <span
                    className="inline-flex -translate-y-px"
                    onClick={(event) => {
                        event.stopPropagation();
                    }}
                >
                    <InfoTooltip size="sm">Nango catalog tools are always enabled</InfoTooltip>
                </span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1.5">
            <span className={cn('type-label-sm', fn.enabled ? 'text-text-link-success' : 'text-text-secondary')}>{fn.enabled ? 'Enabled' : 'Disabled'}</span>
            {isSyncOrAction(fn) && <FunctionSwitch flow={fn} integration={integration} variant="success" />}
        </div>
    );
}

function FunctionTemplateRow({
    template,
    isDeploying,
    onDeploy
}: {
    template: NangoFunctionTemplate;
    isDeploying: boolean;
    onDeploy: (template: NangoFunctionTemplate) => void;
}) {
    return (
        <TableRow className="h-12 hover:bg-transparent">
            <FunctionNameCell name={template.name} description={template.description} />
            <TableCell className="w-35 px-3">
                <FunctionSourceLabel source="template" />
            </TableCell>
            <TableCell className="w-35 px-3">
                <button
                    type="button"
                    disabled={isDeploying}
                    onClick={() => onDeploy(template)}
                    className="inline-flex h-6 w-21 items-center justify-center rounded-ds-sm border-ds-hairline border-border-strong px-3 type-label-sm text-text-secondary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Deploy
                </button>
            </TableCell>
        </TableRow>
    );
}

function matchesSearch(template: NangoFunctionTemplate, needle: string): boolean {
    if (!needle) return true;
    return `${template.name} ${template.description ?? ''}`.toLowerCase().includes(needle);
}

interface FunctionsTabProps {
    integration: ApiIntegration;
}

export const FunctionsTab: React.FC<FunctionsTabProps> = ({ integration }) => {
    const navigate = useNavigate();
    const env = useStore((state) => state.env);
    const { data: metaData } = useMeta();
    const showActionStatus = metaData?.data.toolsCatalog !== true;
    const { toast } = useToast();
    const { confirm, DialogComponent } = useConfirmDialog();
    const [deployingName, setDeployingName] = useState<string | null>(null);

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
    const { data: templatesResponse, isFetched: templatesFetched } = useGetIntegrationTemplates({
        env,
        providerConfigKey: integration.unique_key
    });
    const templatesCount = templatesResponse?.data.length;
    const { mutateAsync: deployFlow } = usePreBuiltDeployFlow(env, integration.unique_key);

    const onBrowseTemplates = useCallback(() => {
        navigate(`/${env}/integrations/${integration.unique_key}/templates`);
    }, [env, integration.unique_key, navigate]);

    const onFunctionClick = useCallback(
        (fn: ListedNangoFunction) => {
            navigate(`/${env}/integrations/${integration.unique_key}/functions/${encodeURIComponent(fn.name)}?type=${fn.type}`);
        },
        [env, integration.unique_key, navigate]
    );

    const deployTemplate = useCallback(
        async (template: NangoFunctionTemplate) => {
            setDeployingName(template.name);
            try {
                await deployFlow({
                    providerConfigKey: integration.unique_key,
                    scriptName: template.name,
                    type: template.type
                });
                toast({ title: `${template.name} deployed successfully`, variant: 'success' });
            } catch (err) {
                const message = err instanceof APIError ? (err.json as ApiError<string>).error.message : undefined;
                toast({ title: 'Failed to deploy template', description: message, variant: 'error' });
            } finally {
                setDeployingName(null);
            }
        },
        [deployFlow, integration.unique_key, toast]
    );

    const onDeployTemplate = useCallback(
        (template: NangoFunctionTemplate) => {
            if (template.type === 'action') {
                void deployTemplate(template);
                return;
            }

            void confirm({
                title: 'Deploy sync?',
                description: 'It will start syncing potentially for multiple connections. This will impact your billing.',
                confirmButtonText: 'Deploy',
                confirmVariant: 'primary',
                onConfirm: () => deployTemplate(template)
            });
        },
        [confirm, deployTemplate]
    );

    const functions: ListedNangoFunction[] = data?.pages.flatMap((page) => page.data) ?? [];
    const total = data?.pages[0]?.pagination.total ?? 0;

    const searchNeedle = debouncedSearch.trim().toLowerCase();
    const undeployedActionTemplates = useMemo(
        () => (templatesResponse?.data ?? []).filter((template) => template.type === 'action' && !template.deployed),
        [templatesResponse]
    );
    const undeployedSyncTemplates = useMemo(
        () => (templatesResponse?.data ?? []).filter((template) => template.type === 'sync' && !template.deployed),
        [templatesResponse]
    );
    const matchingActionTemplates = useMemo(
        () => undeployedActionTemplates.filter((template) => matchesSearch(template, searchNeedle)),
        [undeployedActionTemplates, searchNeedle]
    );
    const matchingSyncTemplates = useMemo(
        () => undeployedSyncTemplates.filter((template) => matchesSearch(template, searchNeedle)),
        [undeployedSyncTemplates, searchNeedle]
    );
    // Templates append only after every deployed page is loaded.
    const listedFunctionKeys = new Set(functions.map((fn) => `${fn.type}:${fn.name}`));
    const visibleActionTemplates =
        typeFilter === 'action' && !hasNextPage && !isPlaceholderData
            ? matchingActionTemplates.filter((template) => !listedFunctionKeys.has(`${template.type}:${template.name}`))
            : [];
    const visibleSyncTemplates = typeFilter === 'sync' && !hasNextPage && !isPlaceholderData ? matchingSyncTemplates : [];

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

    const hasSearch = Boolean(debouncedSearch.trim());
    const templateRows = typeFilter === 'action' ? visibleActionTemplates : typeFilter === 'sync' ? visibleSyncTemplates : [];
    const activeListHasRows = functions.length > 0 || templateRows.length > 0;
    const showEmptyNoFilters =
        countsReady &&
        templatesFetched &&
        !hasSearch &&
        totalAcrossTypes === 0 &&
        undeployedActionTemplates.length === 0 &&
        undeployedSyncTemplates.length === 0 &&
        !isLoading;
    const showEmptyWithSearch = !isLoading && hasSearch && !activeListHasRows;
    const showEmptyType = countsSettled && !hasSearch && !showEmptyNoFilters && !isLoading && !activeListHasRows;
    const waitingForEmptyDecision = !hasSearch && functions.length === 0 && (!countsSettled || !templatesFetched);
    const activePill = TYPE_PILLS.find((pill) => pill.value === typeFilter) ?? TYPE_PILLS[0];

    return (
        <div className="flex flex-col gap-4 w-full">
            {DialogComponent}
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
                                <Button type="button" variant="secondary" size="md">
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
                                    <ColumnHead>Function name</ColumnHead>
                                    <ColumnHead className="w-35">Source</ColumnHead>
                                    {showActionStatus && <ColumnHead className="w-35">Status</ColumnHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {functions.map((fn) => (
                                    <TableRow
                                        key={functionRowKey(fn)}
                                        className="h-12 cursor-pointer hover:bg-surface-panel-inset"
                                        onClick={() => onFunctionClick(fn)}
                                    >
                                        <FunctionNameCell name={fn.name} description={fn.description} />
                                        <TableCell className="w-35 px-3">
                                            <FunctionSourceLabel source={fn.source} />
                                        </TableCell>
                                        {showActionStatus && (
                                            <TableCell className="w-35 px-3">
                                                <FunctionStatus fn={fn} integration={integration} />
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                                {visibleActionTemplates.map((template) => (
                                    <FunctionTemplateRow
                                        key={`template:${template.type}:${template.name}`}
                                        template={template}
                                        isDeploying={deployingName === template.name}
                                        onDeploy={onDeployTemplate}
                                    />
                                ))}
                            </TableBody>
                            <TableFooter className="bg-transparent font-ds-regular">
                                <TableRow className="h-8 hover:bg-transparent">
                                    <TableCell colSpan={showActionStatus ? 3 : 2} className="px-3 type-label-xs text-text-disabled">
                                        Showing {functions.length + visibleActionTemplates.length} of {total + visibleActionTemplates.length} actions
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    ) : typeFilter === 'sync' ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <ColumnHead>Function name</ColumnHead>
                                    <ColumnHead className="w-35">Source</ColumnHead>
                                    <ColumnHead className="w-35">Status</ColumnHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {functions.map((fn) => (
                                    <TableRow
                                        key={functionRowKey(fn)}
                                        className="h-12 cursor-pointer hover:bg-surface-panel-inset"
                                        onClick={() => onFunctionClick(fn)}
                                    >
                                        <FunctionNameCell name={fn.name} description={fn.description} />
                                        <TableCell className="w-35 px-3">
                                            <FunctionSourceLabel source={fn.source} />
                                        </TableCell>
                                        <TableCell className="w-35 px-3">
                                            <FunctionStatus fn={fn} integration={integration} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {visibleSyncTemplates.map((template) => (
                                    <FunctionTemplateRow
                                        key={`template:${template.type}:${template.name}`}
                                        template={template}
                                        isDeploying={deployingName === template.name}
                                        onDeploy={onDeployTemplate}
                                    />
                                ))}
                            </TableBody>
                            <TableFooter className="bg-transparent font-ds-regular">
                                <TableRow className="h-8 hover:bg-transparent">
                                    <TableCell colSpan={3} className="px-3 type-label-xs text-text-disabled">
                                        Showing {functions.length + visibleSyncTemplates.length} of {total + matchingSyncTemplates.length} sync functions
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <ColumnHead>Function name</ColumnHead>
                                    <ColumnHead className="w-35">Source</ColumnHead>
                                    <ColumnHead className="w-35">Status</ColumnHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {functions.map((fn) => (
                                    <TableRow
                                        key={functionRowKey(fn)}
                                        className="h-12 cursor-pointer hover:bg-surface-panel-inset"
                                        onClick={() => onFunctionClick(fn)}
                                    >
                                        <FunctionNameCell name={fn.name} description={fn.description} />
                                        <TableCell className="w-35 px-3">
                                            <FunctionSourceLabel source={fn.source} />
                                        </TableCell>
                                        <TableCell className="w-35 px-3">
                                            <FunctionStatus fn={fn} integration={integration} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                            <TableFooter className="bg-transparent font-ds-regular">
                                <TableRow className="h-8 hover:bg-transparent">
                                    <TableCell colSpan={3} className="px-3 type-label-xs text-text-disabled">
                                        Showing {functions.length} of {total} triggers
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    )}

                    <div ref={sentinelRef} aria-hidden />
                    {isFetchingNextPage && <Skeleton className="w-full h-12" />}
                </>
            )}
        </div>
    );
};
