import { Code, Plus, Search } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, InputGroup, InputGroupAddon, InputGroupInput } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { CopyButton } from '@/components/ui/CopyButton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { EmptyCard } from '@/components/ui/EmptyCard';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Skeleton } from '@/components/ui/Skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useGetIntegrationFunction, useGetIntegrationFunctions, useGetIntegrationTemplates } from '@/hooks/useIntegrationFunctions';
import { useMeta } from '@/hooks/useMeta';
import { useStore } from '@/store';
import { isSyncOrAction } from '@/utils/scripts';
import { cn } from '@/utils/utils';
import { FunctionSwitch } from '../../components/FunctionSwitch.js';
import { FunctionDetailsPanel } from './FunctionDetailsPanel';
import { FunctionSourceLabel } from './FunctionSourceLabel';

import type { ApiIntegration, ListedNangoActionFunction, ListedNangoFunction, ListedNangoSyncFunction, NangoFunctionTemplate } from '@nangohq/types';

const TYPE_FILTER_VALUES = ['action', 'sync', 'on-event'] as const;
type TypeFilterValue = (typeof TYPE_FILTER_VALUES)[number];

const TYPE_PILLS: { value: TypeFilterValue; label: string; emptyLabel: string }[] = [
    { value: 'action', label: 'Actions', emptyLabel: 'No actions' },
    { value: 'sync', label: 'Syncs', emptyLabel: 'No syncs' },
    { value: 'on-event', label: 'Triggers', emptyLabel: 'No triggers' }
];

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

function FunctionNameCell({ name, description }: { name: string; description?: string }) {
    return (
        <TableCell className="max-w-0 px-3 py-0 whitespace-normal">
            <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex min-w-0 items-center gap-1">
                    <span className="truncate type-code-medium-sm text-text-default">{name}</span>
                    <CopyButton
                        text={name}
                        className="size-4 shrink-0 p-0 opacity-0 transition-opacity group-focus-within/function-row:opacity-100 group-hover/function-row:opacity-100"
                    />
                </div>
                {description && (
                    <span className="truncate text-ds-xs font-ds-regular leading-ds-normal tracking-ds-tight text-text-disabled">{description}</span>
                )}
            </div>
        </TableCell>
    );
}

function FunctionStatus({ fn, integration }: { fn: ListedNangoFunction; integration: ApiIntegration }) {
    if (fn.source === 'tools-catalog') {
        return (
            <div className="flex items-center gap-1">
                <span className="type-label-sm leading-none! text-text-link-success">Enabled</span>
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

const FUNCTION_ROW_CLASS = 'group/function-row h-13 cursor-pointer hover:bg-surface-panel-inset';
const FUNCTION_ROW_SELECTED_CLASS = 'border-l-2 border-l-interactive-selected-fill bg-state-selected';

function templateRowKey(template: NangoFunctionTemplate): string {
    return `${template.type}:${template.name}:`;
}

function templateSectionKey(template: { type: string; name: string }): string {
    return `${template.type}:${template.name}`;
}

/** A template has no sync-config row until the first enable, which deploys it. */
function listedFromTemplate(template: NangoFunctionTemplate): ListedNangoSyncFunction | ListedNangoActionFunction {
    const availability = template.deployed
        ? {
              id: template.deployed.id,
              enabled: template.deployed.enabled,
              last_deployed: template.deployed.last_deployed,
              source: template.deployed.source
          }
        : { id: null, enabled: false, last_deployed: null, source: 'catalog' as const };

    if (template.type === 'sync') {
        return { ...template, ...availability, type: 'sync' };
    }
    return { ...template, ...availability, type: 'action' };
}

type FunctionListRow = { kind: 'function'; fn: ListedNangoFunction } | { kind: 'template'; template: NangoFunctionTemplate };

function mergeTemplateSection(previous: string[], incoming: string[]): string[] {
    const seen = new Set(previous);
    const next = [...previous];
    for (const key of incoming) {
        if (seen.has(key)) continue;
        next.push(key);
        seen.add(key);
    }
    return next;
}

function FunctionTableRow({
    fn,
    integration,
    selected,
    showStatus,
    onSelect
}: {
    fn: ListedNangoFunction;
    integration: ApiIntegration;
    selected: boolean;
    showStatus: boolean;
    onSelect: () => void;
}) {
    return (
        <TableRow aria-selected={selected} className={cn(FUNCTION_ROW_CLASS, selected && FUNCTION_ROW_SELECTED_CLASS)} onClick={onSelect}>
            <FunctionNameCell name={fn.name} description={fn.description} />
            <TableCell className="w-35 px-3">
                <FunctionSourceLabel source={fn.source} />
            </TableCell>
            {showStatus && (
                <TableCell className="w-35 px-3">
                    <FunctionStatus fn={fn} integration={integration} />
                </TableCell>
            )}
        </TableRow>
    );
}

function FunctionTemplateRow({
    template,
    integration,
    selected,
    onSelect
}: {
    template: NangoFunctionTemplate;
    integration: ApiIntegration;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <TableRow aria-selected={selected} className={cn(FUNCTION_ROW_CLASS, selected && FUNCTION_ROW_SELECTED_CLASS)} onClick={onSelect}>
            <FunctionNameCell name={template.name} description={template.description} />
            <TableCell className="w-35 px-3">
                <FunctionSourceLabel source="template" />
            </TableCell>
            <TableCell className="w-35 px-3">
                <FunctionStatus fn={listedFromTemplate(template)} integration={integration} />
            </TableCell>
        </TableRow>
    );
}

function FunctionListWithDetails({
    selectedFunction,
    integration,
    onDeleted,
    children
}: {
    selectedFunction: ListedNangoFunction | NangoFunctionTemplate | null;
    integration: ApiIntegration;
    onDeleted: () => void;
    children: React.ReactNode;
}) {
    const [displayedFunction, setDisplayedFunction] = useState(selectedFunction);
    const [panelVisible, setPanelVisible] = useState(Boolean(selectedFunction));

    useEffect(() => {
        let animationFrame: number | undefined;
        let closeTimer: ReturnType<typeof setTimeout> | undefined;

        if (selectedFunction) {
            setDisplayedFunction(selectedFunction);
            animationFrame = requestAnimationFrame(() => {
                animationFrame = requestAnimationFrame(() => setPanelVisible(true));
            });
        } else {
            setPanelVisible(false);
            closeTimer = setTimeout(() => setDisplayedFunction(null), 250);
        }

        return () => {
            if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
            if (closeTimer !== undefined) clearTimeout(closeTimer);
        };
    }, [selectedFunction]);

    return (
        <div className="flex w-full items-stretch overflow-clip">
            <div
                className={cn(
                    'min-w-0 shrink-0 transition-[width] duration-250 ease-out motion-reduce:transition-none',
                    panelVisible ? 'w-1/2' : 'w-full',
                    displayedFunction && '**:data-[slot=table-container]:rounded-r-none'
                )}
            >
                {children}
            </div>
            {displayedFunction && (
                <div
                    className={cn(
                        'w-1/2 shrink-0 border-y border-r border-border-muted bg-surface-panel transition-[translate,opacity] duration-250 ease-out motion-reduce:transition-none',
                        panelVisible ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-full opacity-0'
                    )}
                >
                    <FunctionDetailsPanel
                        key={'enabled' in displayedFunction ? functionRowKey(displayedFunction) : templateRowKey(displayedFunction)}
                        fn={displayedFunction}
                        integration={integration}
                        onDeleted={onDeleted}
                    />
                </div>
            )}
        </div>
    );
}

function matchesSearch(template: NangoFunctionTemplate, needle: string): boolean {
    if (!needle) return true;
    return `${template.name} ${template.description ?? ''}`.toLowerCase().includes(needle);
}

function pillCount(deployed: number | undefined, templatesFetched: boolean, undeployedTemplates: number): number | undefined {
    if (deployed == null || !templatesFetched) {
        return undefined;
    }
    return deployed + undeployedTemplates;
}

interface FunctionsTabProps {
    integration: ApiIntegration;
}

export const FunctionsTab: React.FC<FunctionsTabProps> = ({ integration }) => {
    const env = useStore((state) => state.env);
    const { data: metaData, isSuccess: metaLoaded } = useMeta();
    const toolsCatalog = metaData?.data.toolsCatalog === true;
    const showActionStatus = metaData?.data.toolsCatalog === false;
    const [templateTail, setTemplateTail] = useState<{ scope: string; keys: string[] }>({ scope: '', keys: [] });

    const [search, setSearch] = useQueryState('search', parseAsString.withDefault(''));
    const debouncedSearch = useDebouncedValue(search);

    const [rawType, setType] = useQueryState('type', parseAsString.withDefault(''));
    const typeFilter: TypeFilterValue = rawType && isTypeFilterValue(rawType) ? rawType : 'action';
    // The open panel is the URL, so a reload or a shared link restores it. Old `/functions/:name` links redirect here.
    const [selectedFunctionName, setSelectedFunctionName] = useQueryState('function', parseAsString);

    const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage, isPlaceholderData } = useGetIntegrationFunctions({
        env,
        providerConfigKey: integration.unique_key,
        search: debouncedSearch || undefined,
        type: typeFilter
    });

    // Unfiltered totals for the pills, including templates that are not deployed yet. Search only narrows the active table.
    const actionCounts = useGetIntegrationFunctions({ env, providerConfigKey: integration.unique_key, type: 'action', limit: 1 });
    const syncCounts = useGetIntegrationFunctions({ env, providerConfigKey: integration.unique_key, type: 'sync', limit: 1 });
    const triggerCounts = useGetIntegrationFunctions({ env, providerConfigKey: integration.unique_key, type: 'on-event', limit: 1 });

    const sentinelRef = useInfiniteScroll({ hasNextPage, isFetchingNextPage, fetchNextPage });

    const { data: templatesResponse, isFetched: templatesFetched } = useGetIntegrationTemplates({
        env,
        providerConfigKey: integration.unique_key
    });

    const onRowClick = useCallback(
        (name: string) => {
            void setSelectedFunctionName(selectedFunctionName === name ? null : name);
        },
        [selectedFunctionName, setSelectedFunctionName]
    );

    const functions: ListedNangoFunction[] = data?.pages.flatMap((page) => page.data) ?? [];
    const total = data?.pages[0]?.pagination.total ?? 0;
    const listedMatch = selectedFunctionName ? functions.find((fn) => fn.name === selectedFunctionName) : undefined;
    const rawTemplateMatch = selectedFunctionName
        ? (templatesResponse?.data ?? []).find((template) => template.type === typeFilter && template.name === selectedFunctionName)
        : undefined;
    const templateMatch = rawTemplateMatch && !rawTemplateMatch.deployed ? rawTemplateMatch : undefined;
    // A linked function can sit past the first page. Fetch it directly so the panel opens without scrolling the list.
    const { data: linkedFunction } = useGetIntegrationFunction({
        env,
        providerConfigKey: integration.unique_key,
        name: selectedFunctionName ?? '',
        type: typeFilter,
        enabled: Boolean(selectedFunctionName) && templatesFetched && !listedMatch && !rawTemplateMatch
    });

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
    const selectedFunction =
        listedMatch ?? templateMatch ?? (rawTemplateMatch?.deployed ? listedFromTemplate(rawTemplateMatch) : undefined) ?? linkedFunction?.data ?? null;

    const tailScope = `${integration.unique_key}:${typeFilter}`;
    const incomingTailKeys = (typeFilter === 'action' ? visibleActionTemplates : typeFilter === 'sync' ? visibleSyncTemplates : []).map(templateSectionKey);
    const incomingTailKey = incomingTailKeys.join('\n');
    const templateSectionKeys = mergeTemplateSection(templateTail.scope === tailScope ? templateTail.keys : [], incomingTailKeys);

    useEffect(() => {
        if (typeFilter === 'on-event' || !templatesFetched || hasNextPage || isPlaceholderData) return;
        const incoming = incomingTailKey ? incomingTailKey.split('\n') : [];
        setTemplateTail((current) => {
            const previous = current.scope === tailScope ? current.keys : [];
            const next = mergeTemplateSection(previous, incoming);
            if (current.scope === tailScope && next.length === previous.length && next.every((key, index) => key === previous[index])) {
                return current;
            }
            return { scope: tailScope, keys: next };
        });
    }, [typeFilter, templatesFetched, hasNextPage, isPlaceholderData, tailScope, incomingTailKey]);

    const functionRows = useMemo(() => {
        const templatesByKey = new Map((templatesResponse?.data ?? []).map((template) => [templateSectionKey(template), template]));
        const pinned = new Set(templateSectionKeys);
        const functionByKey = new Map(functions.map((fn) => [templateSectionKey(fn), fn]));
        const leading: FunctionListRow[] = functions.filter((fn) => !pinned.has(templateSectionKey(fn))).map((fn) => ({ kind: 'function', fn }));
        const tail: FunctionListRow[] = templateSectionKeys.flatMap((key): FunctionListRow[] => {
            const listed = functionByKey.get(key);
            if (listed) return [{ kind: 'function', fn: listed }];
            const template = templatesByKey.get(key);
            if (!template || (searchNeedle && !matchesSearch(template, searchNeedle))) return [];
            if (template.deployed) return [{ kind: 'function', fn: listedFromTemplate(template) }];
            return [{ kind: 'template', template }];
        });
        return [...leading, ...tail];
    }, [functions, searchNeedle, templateSectionKeys, templatesResponse?.data]);

    const counts: Record<TypeFilterValue, number | undefined> = {
        // Catalog actions are already in the functions total, and they are the same names as the action templates.
        action: pillCount(actionCounts.data?.pages[0]?.pagination.total, templatesFetched && metaLoaded, toolsCatalog ? 0 : undeployedActionTemplates.length),
        sync: pillCount(syncCounts.data?.pages[0]?.pagination.total, templatesFetched, undeployedSyncTemplates.length),
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
    const pinnedKeys = new Set(templateSectionKeys);
    const listedRows = functionRows.map((row) => {
        if (row.kind === 'template') {
            return (
                <FunctionTemplateRow
                    key={`template:${row.template.type}:${row.template.name}`}
                    template={row.template}
                    integration={integration}
                    selected={row.template.name === selectedFunctionName}
                    onSelect={() => onRowClick(row.template.name)}
                />
            );
        }

        const showStatus = typeFilter === 'action' ? showActionStatus || pinnedKeys.has(templateSectionKey(row.fn)) : true;
        return (
            <FunctionTableRow
                key={functionRowKey(row.fn)}
                fn={row.fn}
                integration={integration}
                selected={row.fn.name === selectedFunctionName}
                showStatus={showStatus}
                onSelect={() => onRowClick(row.fn.name)}
            />
        );
    });

    return (
        <div className="flex flex-col gap-4 w-full">
            {isLoading || waitingForEmptyDecision ? (
                <Skeleton className="w-full h-50" />
            ) : showEmptyNoFilters ? (
                <EmptyCard>
                    <h3 className="text-title-body text-text-strong">No functions deployed in this integration yet</h3>
                    <p className="text-text-secondary text-body-medium-regular text-center">Build your own custom functions.</p>
                    <ButtonLink to="https://nango.dev/docs/guides/functions/functions-guide" target="_blank" variant="secondary">
                        <Code /> Build custom
                    </ButtonLink>
                </EmptyCard>
            ) : (
                <>
                    <div className="flex items-center gap-2">
                        {TYPE_PILLS.map((pill) => {
                            const selected = pill.value === typeFilter;
                            const count = counts[pill.value];
                            const hasTemplates =
                                pill.value === 'action'
                                    ? undeployedActionTemplates.length > 0
                                    : pill.value === 'sync'
                                      ? undeployedSyncTemplates.length > 0
                                      : false;
                            const disabled = count === 0 && !hasTemplates;
                            return (
                                <button
                                    key={pill.value}
                                    type="button"
                                    aria-pressed={selected}
                                    disabled={disabled}
                                    onClick={() => {
                                        void setSelectedFunctionName(null);
                                        void setType(pill.value);
                                    }}
                                    className={cn(
                                        'inline-flex cursor-pointer items-center justify-center gap-1 rounded-full border-ds-hairline px-2 py-0.5 disabled:cursor-not-allowed',
                                        disabled
                                            ? 'border-transparent bg-surface-panel-inset text-text-disabled'
                                            : selected
                                              ? 'border-status-info-border bg-status-info-bg text-status-info-text'
                                              : 'border-border-default bg-surface-panel text-text-default'
                                    )}
                                >
                                    <span className="text-ds-xs font-ds-medium leading-ds-normal">{pill.label}</span>
                                    {count != null && count > 0 && <span className="text-ds-2xs font-ds-regular tracking-ds-tight">{count}</span>}
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
                                onChange={(e) => {
                                    void setSelectedFunctionName(null);
                                    void setSearch(e.target.value || null);
                                }}
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
                        <FunctionListWithDetails
                            selectedFunction={selectedFunction}
                            integration={integration}
                            onDeleted={() => void setSelectedFunctionName(null)}
                        >
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <ColumnHead>Function name</ColumnHead>
                                        <ColumnHead className="w-35">Source</ColumnHead>
                                        {showActionStatus && <ColumnHead className="w-35">Status</ColumnHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>{listedRows}</TableBody>
                                <TableFooter className="bg-transparent font-ds-regular">
                                    <TableRow className="h-8 hover:bg-transparent">
                                        <TableCell colSpan={2 + (showActionStatus ? 1 : 0)} className="px-3 type-label-xs text-text-disabled">
                                            Showing {functions.length + visibleActionTemplates.length} of {total + visibleActionTemplates.length} actions
                                        </TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </FunctionListWithDetails>
                    ) : typeFilter === 'sync' ? (
                        <FunctionListWithDetails
                            selectedFunction={selectedFunction}
                            integration={integration}
                            onDeleted={() => void setSelectedFunctionName(null)}
                        >
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <ColumnHead>Function name</ColumnHead>
                                        <ColumnHead className="w-35">Source</ColumnHead>
                                        <ColumnHead className="w-35">Status</ColumnHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>{listedRows}</TableBody>
                                <TableFooter className="bg-transparent font-ds-regular">
                                    <TableRow className="h-8 hover:bg-transparent">
                                        <TableCell colSpan={3} className="px-3 type-label-xs text-text-disabled">
                                            Showing {functions.length + visibleSyncTemplates.length} of {total + matchingSyncTemplates.length} sync functions
                                        </TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </FunctionListWithDetails>
                    ) : (
                        <FunctionListWithDetails
                            selectedFunction={selectedFunction}
                            integration={integration}
                            onDeleted={() => void setSelectedFunctionName(null)}
                        >
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <ColumnHead>Function name</ColumnHead>
                                        <ColumnHead className="w-35">Source</ColumnHead>
                                        <ColumnHead className="w-35">Status</ColumnHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>{listedRows}</TableBody>
                                <TableFooter className="bg-transparent font-ds-regular">
                                    <TableRow className="h-8 hover:bg-transparent">
                                        <TableCell colSpan={3} className="px-3 type-label-xs text-text-disabled">
                                            Showing {functions.length} of {total} triggers
                                        </TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </FunctionListWithDetails>
                    )}

                    <div ref={sentinelRef} aria-hidden />
                    {isFetchingNextPage && <Skeleton className="h-13 w-full" />}
                </>
            )}
        </div>
    );
};
