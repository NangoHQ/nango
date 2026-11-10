import { Braces, Check, ExternalLink } from 'lucide-react';
import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useState } from 'react';

import { Button } from '@nangohq/design-system';

import { cn } from '@/utils/utils';
import { SlidingPanelLayout } from '../../Integrations/providerConfigKey/Functions/SlidingPanelLayout';
import { CatalogFunctionPanel } from './CatalogFunctionPanel';
import { SearchField } from './SearchField';

import type { NangoFunctionTemplate } from '@nangohq/types';

const FUNCTIONS_GUIDE_URL = 'https://nango.dev/docs/guides/functions/functions-guide';
const PROXY_GUIDE_URL = 'https://nango.dev/docs/guides/platform/proxy-requests';
const MCP_TOOLS_GUIDE_URL = 'https://nango.dev/docs/guides/agent-sessions#mcp-server-tools';

const FUNCTION_TYPES = ['action', 'sync'] as const;
type FunctionTypeTab = (typeof FUNCTION_TYPES)[number];
const TAB_LABELS: Record<FunctionTypeTab, { singular: string; plural: string }> = {
    action: { singular: 'tool', plural: 'Tools' },
    sync: { singular: 'sync', plural: 'Syncs' }
};

interface CatalogFunctionsProps {
    templates: NangoFunctionTemplate[];
    displayName: string;
    isMcp: boolean;
    renderSetupButton: () => React.ReactNode;
}

export const CatalogFunctions: React.FC<CatalogFunctionsProps> = ({ templates, displayName, isMcp, renderSetupButton }) => {
    const [rawType, setType] = useQueryState('type', parseAsStringLiteral(FUNCTION_TYPES));
    const [selectedName, setSelectedName] = useQueryState('function', parseAsString);
    const [search, setSearch] = useState('');

    const tabs = FUNCTION_TYPES.map((type) => ({ type, items: templates.filter((fn) => fn.type === type) })).filter((tab) => tab.items.length > 0);
    const activeTab = tabs.find((tab) => tab.type === rawType) ?? tabs[0];

    if (!activeTab) {
        return isMcp ? <McpToolsState /> : <NoFunctionsState displayName={displayName} />;
    }

    const needle = search.trim().toLowerCase();
    const shown = needle ? activeTab.items.filter((fn) => `${fn.name} ${fn.description ?? ''}`.toLowerCase().includes(needle)) : activeTab.items;
    const selected = activeTab.items.find((fn) => fn.name === selectedName) ?? null;
    const labels = TAB_LABELS[activeTab.type];

    return (
        <div className="flex flex-col gap-3">
            <div role="tablist" className="flex items-center gap-1">
                {tabs.map((tab) => (
                    <button
                        key={tab.type}
                        type="button"
                        role="tab"
                        aria-selected={tab.type === activeTab.type}
                        onClick={() => {
                            void setType(tab.type);
                            void setSelectedName(null);
                        }}
                        className={cn(
                            'flex h-6 cursor-pointer items-center gap-1.5 rounded-ds-sm px-2 type-text-medium-sm transition-colors focus-default',
                            tab.type === activeTab.type ? 'bg-status-info-bg text-status-info-text' : 'text-text-default hover:bg-state-hover'
                        )}
                    >
                        {TAB_LABELS[tab.type].plural}
                        <span className="type-code-regular-xs">{tab.items.length}</span>
                    </button>
                ))}
            </div>

            <SearchField value={search} placeholder={`Search ${labels.plural.toLowerCase()}`} onChange={setSearch} />

            <SlidingPanelLayout
                selected={selected}
                getKey={(fn) => `${fn.type}:${fn.name}`}
                renderPanel={(fn) => <CatalogFunctionPanel fn={fn} setupButton={renderSetupButton()} onClose={() => void setSelectedName(null)} />}
                onClose={() => void setSelectedName(null)}
            >
                <div className="overflow-hidden rounded-ds-md border-ds-hairline border-border-default bg-surface-panel">
                    <div className="border-b-ds-hairline border-border-default bg-surface-canvas px-3 py-2 type-label-xs uppercase text-text-muted">
                        {labels.plural}
                    </div>
                    {shown.length === 0 ? (
                        <NoResultsState
                            query={search.trim()}
                            noun={labels.plural.toLowerCase()}
                            displayName={displayName}
                            onClear={() => {
                                setSearch('');
                            }}
                        />
                    ) : (
                        <ul>
                            {shown.map((fn) => (
                                <li key={fn.name} className="border-b-ds-hairline border-border-default last:border-b-0">
                                    <button
                                        type="button"
                                        onClick={() => void setSelectedName(fn.name === selectedName ? null : fn.name)}
                                        className={cn(
                                            'flex w-full cursor-pointer flex-col gap-0.5 py-2 pr-3 text-left transition-colors focus-inset',
                                            fn.name === selected?.name
                                                ? 'border-l-ds-2 border-l-interactive-selected-fill bg-surface-canvas pl-2.5'
                                                : 'pl-3 hover:bg-state-hover'
                                        )}
                                    >
                                        <span className="truncate type-code-medium-md text-text-strong">{fn.name}</span>
                                        {fn.description && <span className="truncate type-text-regular-xs text-text-secondary">{fn.description}</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="border-t-ds-hairline border-border-default px-3 py-2 type-text-regular-xs text-text-muted">
                        Showing {shown.length} of {activeTab.items.length} {activeTab.items.length === 1 ? labels.singular : labels.plural.toLowerCase()}
                    </div>
                </div>
            </SlidingPanelLayout>
        </div>
    );
};

const NoResultsState: React.FC<{ query: string; noun: string; displayName: string; onClear: () => void }> = ({ query, noun, displayName, onClear }) => (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <span className="type-text-medium-sm text-text-strong">
            No {noun} match “{query}”
        </span>
        <span className="type-text-regular-xs text-text-secondary">
            Try another word. Need something {displayName} doesn&apos;t have here? You can build your own.
        </span>
        <div className="flex items-center gap-3 pt-1">
            <Button asChild variant="link-accent" size="md">
                <a href={FUNCTIONS_GUIDE_URL} target="_blank" rel="noreferrer">
                    Build your own <ExternalLink />
                </a>
            </Button>
            <Button variant="outline" size="sm" onClick={onClear}>
                Clear search
            </Button>
        </div>
    </div>
);

const EmptyStateCard: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
    <div className="flex flex-col items-center gap-2 rounded-ds-md border-ds-hairline border-border-default bg-surface-panel px-6 py-12 text-center">
        <span className="mb-1 flex size-10 items-center justify-center rounded-ds-md border border-border-default bg-surface-canvas">{icon}</span>
        {children}
    </div>
);

const NoFunctionsState: React.FC<{ displayName: string }> = ({ displayName }) => (
    <EmptyStateCard icon={<Braces className="size-5 text-icon-muted" />}>
        <span className="type-text-medium-sm text-text-strong">No pre-built tools for {displayName} yet</span>
        <span className="type-text-regular-xs text-text-secondary">
            You can build your own, or call {displayName}&apos;s API directly through the Nango proxy.
        </span>
        <div className="flex items-center gap-4 pt-1">
            <Button asChild variant="link-accent" size="md">
                <a href={FUNCTIONS_GUIDE_URL} target="_blank" rel="noreferrer">
                    Build your own <ExternalLink />
                </a>
            </Button>
            <Button asChild variant="link-accent" size="md">
                <a href={PROXY_GUIDE_URL} target="_blank" rel="noreferrer">
                    Proxy docs <ExternalLink />
                </a>
            </Button>
        </div>
    </EmptyStateCard>
);

const McpToolsState: React.FC = () => (
    <EmptyStateCard icon={<Check className="size-5 text-icon-muted" />}>
        <span className="type-text-medium-sm text-text-strong">All MCP tools work out of the box</span>
        <span className="max-w-md type-text-regular-xs text-text-secondary">
            Nango automatically makes all tools of this MCP server available. You can use it with Agent sessions, or any other Nango feature.
        </span>
        <div className="flex items-center gap-4 pt-1">
            <Button asChild variant="link-accent" size="md">
                <a href={MCP_TOOLS_GUIDE_URL} target="_blank" rel="noreferrer">
                    Docs <ExternalLink />
                </a>
            </Button>
        </div>
    </EmptyStateCard>
);
