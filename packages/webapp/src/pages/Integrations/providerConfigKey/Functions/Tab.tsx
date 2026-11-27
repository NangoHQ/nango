import { Code, Plus } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { SearchField } from '@/components/patterns/SearchField';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { EmptyCard } from '@/components/ui/EmptyCard';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Skeleton } from '@/components/ui/Skeleton';
import { FunctionList, FunctionListCell, FunctionListNoMatches, FunctionListRow } from '@/features/Functions/FunctionList';
import { FunctionTypeTabs } from '@/features/Functions/FunctionTypeTabs';
import { SlidingPanelLayout } from '@/features/Functions/SlidingPanelLayout';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useGetIntegrationFunction, useGetIntegrationFunctions, useGetIntegrationTemplates } from '@/hooks/useIntegrationFunctions';
import { useMeta } from '@/hooks/useMeta';
import { useSearchQueryState } from '@/hooks/useSearchQueryState';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { isSyncOrAction } from '@/utils/scripts';
import { cn } from '@/utils/utils';
import { FunctionSwitch } from '../../components/FunctionSwitch.js';
import { FunctionDetailsPanel } from './FunctionDetailsPanel';
import { FunctionSourceLabel } from './FunctionSourceLabel';

import type { ApiIntegration, ListedNangoActionFunction, ListedNangoFunction, ListedNangoSyncFunction, NangoFunctionTemplate } from '@nangohq/types';

const TYPE_FILTER_VALUES = ['tool', 'sync', 'on-event'] as const;
type TypeFilterValue = (typeof TYPE_FILTER_VALUES)[number];

const TYPE_TABS: { value: TypeFilterValue; label: string; singular: string; emptyLabel: string }[] = [
    { value: 'tool', label: 'Tools', singular: 'tool', emptyLabel: 'No tools' },
    { value: 'sync', label: 'Syncs', singular: 'sync', emptyLabel: 'No syncs' },
    { value: 'on-event', label: 'Triggers', singular: 'trigger', emptyLabel: 'No triggers' }
];

function functionRowKey(fn: ListedNangoFunction): string {
    const event = fn.type === 'on-event' ? fn.event : '';
    return `${fn.type}:${fn.name}:${event}`;
}

function isTypeFilterValue(value: string): value is TypeFilterValue {
    return (TYPE_FILTER_VALUES as readonly string[]).includes(value);
}

function pickTypeFilter(requested: TypeFilterValue | null, counts: Record<TypeFilterValue, number | undefined>, countsSettled: boolean): TypeFilterValue {
    if (requested && counts[requested] !== 0) {
        return requested;
    }
    if (!countsSettled) {
        return requested ?? 'tool';
    }
    return TYPE_TABS.find((tab) => (counts[tab.value] ?? 0) > 0)?.value ?? 'tool';
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
            {isSyncOrAction(fn) && <FunctionSwitch flow={fn} integration={integration} />}
        </div>
    );
}

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

type FunctionListRowData = { kind: 'function'; fn: ListedNangoFunction } | { kind: 'template'; template: NangoFunctionTemplate };

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
    onFunctionOpenChange?: (open: boolean) => void;
}

export const FunctionsTab: React.FC<FunctionsTabProps> = ({ integration, onFunctionOpenChange }) => {
    const env = useStore((state) => state.env);
    const { data: metaData } = useMeta();
    const [templateTail, setTemplateTail] = useState<{ scope: string; keys: string[] }>({ scope: '', keys: [] });

    const [search, setSearch] = useSearchQueryState();
    const debouncedSearch = useDebouncedValue(search);

    const [rawType, setType] = useQueryState('type', parseAsString.withDefault(''));
    // The open panel is the URL, so a reload or a shared link restores it. Old `/functions/:name` links redirect here.
    const [selectedFunctionName, setSelectedFunctionName] = useQueryState('function', parseAsString);

    // Unfiltered totals for the tabs, including templates that are not deployed yet. Search only narrows the active list.
    const toolsCount = useGetIntegrationFunctions({ env, providerConfigKey: integration.unique_key, type: 'tool', limit: 1 });
    const syncCounts = useGetIntegrationFunctions({ env, providerConfigKey: integration.unique_key, type: 'sync', limit: 1 });
    const triggerCounts = useGetIntegrationFunctions({ env, providerConfigKey: integration.unique_key, type: 'on-event', limit: 1 });

    const { data: templatesResponse, isFetched: templatesFetched } = useGetIntegrationTemplates({
        env,
        providerConfigKey: integration.unique_key
    });

    const undeployedActionTemplates = useMemo(
        () => (templatesResponse?.data ?? []).filter((template) => template.type === 'action' && !template.deployed),
        [templatesResponse]
    );
    const undeployedSyncTemplates = useMemo(
        () => (templatesResponse?.data ?? []).filter((template) => template.type === 'sync' && !template.deployed),
        [templatesResponse]
    );

    const counts: Record<TypeFilterValue, number | undefined> = {
        // Catalog actions are already in the functions total. A failed templates request leaves the response unset, so the count stays hidden instead of showing a deployed-only number.
        tool: pillCount(
            toolsCount.data?.pages[0]?.pagination.total,
            templatesResponse !== undefined,
            metaData?.data.toolsCatalog === false ? undeployedActionTemplates.length : 0
        ),
        sync: pillCount(syncCounts.data?.pages[0]?.pagination.total, templatesResponse !== undefined, undeployedSyncTemplates.length),
        'on-event': triggerCounts.data?.pages[0]?.pagination.total
    };
    const countsSettled = [toolsCount, syncCounts, triggerCounts].every((query) => query.isSuccess || query.isError);
    const countsReady = counts.tool != null && counts.sync != null && counts['on-event'] != null;
    const totalAcrossTypes = (counts.tool ?? 0) + (counts.sync ?? 0) + (counts['on-event'] ?? 0);

    const typeFilter = pickTypeFilter(rawType && isTypeFilterValue(rawType) ? rawType : null, counts, countsSettled && templatesFetched);

    const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage, isPlaceholderData } = useGetIntegrationFunctions({
        env,
        providerConfigKey: integration.unique_key,
        search: debouncedSearch || undefined,
        type: typeFilter
    });

    const sentinelRef = useInfiniteScroll({ hasNextPage, isFetchingNextPage, fetchNextPage });

    const onRowClick = useCallback(
        (name: string, isDeployed: boolean) => {
            const isOpening = selectedFunctionName !== name;
            if (isOpening) {
                track('functions:function_view', { provider: integration.provider, function_type: typeFilter, is_deployed: isDeployed });
            }
            void setSelectedFunctionName(isOpening ? name : null);
        },
        [selectedFunctionName, setSelectedFunctionName, integration.provider, typeFilter]
    );

    const functions: ListedNangoFunction[] = data?.pages.flatMap((page) => page.data) ?? [];
    const total = data?.pages[0]?.pagination.total ?? 0;
    const listedMatch = selectedFunctionName ? functions.find((fn) => fn.name === selectedFunctionName) : undefined;
    const rawTemplateMatch = selectedFunctionName
        ? (templatesResponse?.data ?? []).find(
              (template) => (typeFilter === 'tool' ? template.type === 'action' : template.type === typeFilter) && template.name === selectedFunctionName
          )
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
    const matchingActionTemplates = useMemo(
        () => undeployedActionTemplates.filter((template) => matchesSearch(template, searchNeedle)),
        [undeployedActionTemplates, searchNeedle]
    );
    const matchingSyncTemplates = useMemo(
        () => undeployedSyncTemplates.filter((template) => matchesSearch(template, searchNeedle)),
        [undeployedSyncTemplates, searchNeedle]
    );
    // Templates append only after every deployed page is loaded.
    const listedFunctionNames = new Set(functions.map((fn) => fn.name));
    const visibleActionTemplates =
        typeFilter === 'tool' && !hasNextPage && !isPlaceholderData
            ? matchingActionTemplates.filter((template) => !listedFunctionNames.has(template.name))
            : [];
    const visibleSyncTemplates = typeFilter === 'sync' && !hasNextPage && !isPlaceholderData ? matchingSyncTemplates : [];
    const selectedFunction =
        listedMatch ?? templateMatch ?? (rawTemplateMatch?.deployed ? listedFromTemplate(rawTemplateMatch) : undefined) ?? linkedFunction?.data ?? null;
    const functionOpen = selectedFunction !== null;

    useEffect(() => {
        onFunctionOpenChange?.(functionOpen);
    }, [functionOpen, onFunctionOpenChange]);

    useEffect(() => () => onFunctionOpenChange?.(false), [onFunctionOpenChange]);

    const tailScope = `${integration.unique_key}:${typeFilter}`;
    let templateRows: NangoFunctionTemplate[] = [];
    if (typeFilter === 'tool') {
        templateRows = visibleActionTemplates;
    } else if (typeFilter === 'sync') {
        templateRows = visibleSyncTemplates;
    }
    const incomingTailKeys = templateRows.map(templateSectionKey);
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
        const leading: FunctionListRowData[] = functions.filter((fn) => !pinned.has(templateSectionKey(fn))).map((fn) => ({ kind: 'function', fn }));
        const tail: FunctionListRowData[] = templateSectionKeys.flatMap((key): FunctionListRowData[] => {
            const listed = functionByKey.get(key);
            if (listed) return [{ kind: 'function', fn: listed }];
            const template = templatesByKey.get(key);
            if (!template || (searchNeedle && !matchesSearch(template, searchNeedle))) return [];
            if (template.deployed) return [{ kind: 'function', fn: listedFromTemplate(template) }];
            return [{ kind: 'template', template }];
        });
        return [...leading, ...tail];
    }, [functions, searchNeedle, templateSectionKeys, templatesResponse?.data]);

    if (error) {
        return <CriticalErrorAlert message="Something went wrong while loading the functions" />;
    }

    const hasSearch = Boolean(debouncedSearch.trim());
    // Actions omit this column until the catalog flag is known to be off. Syncs and triggers always show it.
    const showStatus = typeFilter !== 'tool' || metaData?.data.toolsCatalog === false;
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
    const activeTab = TYPE_TABS.find((tab) => tab.value === typeFilter) ?? TYPE_TABS[0];
    const visibleTabs = TYPE_TABS.filter((tab) => tab.value !== 'on-event' || typeFilter === 'on-event' || (counts['on-event'] ?? 0) > 0);
    const shownCount = functions.length + templateRows.length;
    const totalCount = total + templateRows.length;
    const columns = [{ header: 'Source', className: 'w-35' }, ...(showStatus ? [{ header: 'Status', className: 'w-35' }] : [])];

    if (isLoading || waitingForEmptyDecision) {
        return <Skeleton className="w-full h-50" />;
    }

    if (showEmptyNoFilters) {
        return (
            <EmptyCard>
                <h3 className="text-title-body text-text-strong">No functions deployed in this integration yet</h3>
                <p className="text-text-secondary text-body-medium-regular text-center">Build your own custom functions.</p>
                <ButtonLink to="https://nango.dev/docs/guides/platform/functions/functions-guide" target="_blank" variant="secondary">
                    <Code /> Build custom
                </ButtonLink>
            </EmptyCard>
        );
    }

    let listBody: React.ReactNode;
    if (isPlaceholderData) {
        listBody = <Skeleton className="w-full h-50" />;
    } else if (showEmptyType) {
        listBody = (
            <EmptyCard>
                <p className="text-text-secondary text-body-medium-regular">{activeTab.emptyLabel}</p>
            </EmptyCard>
        );
    } else {
        listBody = (
            <SlidingPanelLayout
                selected={selectedFunction}
                getKey={(fn) => ('enabled' in fn ? functionRowKey(fn) : templateRowKey(fn))}
                renderPanel={(fn) => <FunctionDetailsPanel fn={fn} integration={integration} onClose={() => void setSelectedFunctionName(null)} />}
                onClose={() => void setSelectedFunctionName(null)}
            >
                <FunctionList
                    title={activeTab.label}
                    columns={columns}
                    footer={`Showing ${shownCount} of ${totalCount} ${totalCount === 1 ? activeTab.singular : activeTab.label.toLowerCase()}`}
                    empty={
                        showEmptyWithSearch && (
                            <FunctionListNoMatches query={debouncedSearch.trim()} noun={activeTab.label.toLowerCase()} onClear={() => setSearch('')} />
                        )
                    }
                >
                    {functionRows.map((row) => {
                        if (row.kind === 'template') {
                            return (
                                <FunctionListRow
                                    key={`template:${row.template.type}:${row.template.name}`}
                                    name={row.template.name}
                                    description={row.template.description}
                                    selected={row.template.name === selectedFunctionName}
                                    onSelect={() => onRowClick(row.template.name, false)}
                                >
                                    <FunctionListCell>
                                        <FunctionSourceLabel source="template" />
                                    </FunctionListCell>
                                    {showStatus && (
                                        <FunctionListCell>
                                            <FunctionStatus fn={listedFromTemplate(row.template)} integration={integration} />
                                        </FunctionListCell>
                                    )}
                                </FunctionListRow>
                            );
                        }
                        return (
                            <FunctionListRow
                                key={functionRowKey(row.fn)}
                                name={row.fn.name}
                                description={row.fn.description}
                                selected={row.fn.name === selectedFunctionName}
                                onSelect={() => onRowClick(row.fn.name, row.fn.id !== null)}
                            >
                                <FunctionListCell>
                                    <FunctionSourceLabel source={row.fn.source} />
                                </FunctionListCell>
                                {showStatus && (
                                    <FunctionListCell>
                                        <FunctionStatus fn={row.fn} integration={integration} />
                                    </FunctionListCell>
                                )}
                            </FunctionListRow>
                        );
                    })}
                </FunctionList>
            </SlidingPanelLayout>
        );
    }

    return (
        <div className="flex flex-col gap-3 w-full">
            <FunctionTypeTabs
                tabs={visibleTabs.map((tab) => ({ value: tab.value, label: tab.label, count: counts[tab.value] }))}
                value={typeFilter}
                onChange={(type) => {
                    void setSelectedFunctionName(null);
                    void setType(type);
                }}
            />

            <div className="flex items-center gap-2">
                <SearchField
                    value={search || ''}
                    placeholder={`Search ${activeTab.label.toLowerCase()}`}
                    onChange={(value) => {
                        void setSelectedFunctionName(null);
                        setSearch(value);
                    }}
                />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="secondary" size="md">
                            <Plus /> Add
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuItem asChild>
                            <a
                                href="https://nango.dev/docs/guides/platform/functions/functions-guide#guide"
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

            {listBody}

            <div ref={sentinelRef} aria-hidden />
            {isFetchingNextPage && <Skeleton className="h-13 w-full" />}
        </div>
    );
};
