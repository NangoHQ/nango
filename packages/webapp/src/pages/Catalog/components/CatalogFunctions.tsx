import { ArrowUpRight, Braces, Check } from 'lucide-react';
import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useState } from 'react';

import { LinkButton } from '@nangohq/design-system';

import { SearchField } from '@/components/patterns/SearchField';
import { FunctionList, FunctionListNoMatches, FunctionListRow } from '@/features/Functions/FunctionList';
import { FunctionTypeTabs } from '@/features/Functions/FunctionTypeTabs';
import { SlidingPanelLayout } from '@/features/Functions/SlidingPanelLayout';
import { CatalogFunctionPanel } from './CatalogFunctionPanel';

import type { ProviderTemplatesSuccess } from '@nangohq/types';

const FUNCTIONS_GUIDE_URL = 'https://nango.dev/docs/guides/platform/functions/functions-guide';
const PROXY_GUIDE_URL = 'https://nango.dev/docs/guides/auth/proxy-requests';
const MCP_TOOLS_GUIDE_URL = 'https://nango.dev/docs/guides/agent-sessions/toolsets#mcp-server-tools';

const FUNCTION_TYPES = ['action', 'sync'] as const;
type FunctionTypeTab = (typeof FUNCTION_TYPES)[number];
const TAB_LABELS: Record<FunctionTypeTab, { singular: string; plural: string }> = {
    action: { singular: 'tool', plural: 'Tools' },
    sync: { singular: 'sync', plural: 'Syncs' }
};

interface CatalogFunctionsProps {
    templates: ProviderTemplatesSuccess['data'];
    provider: string;
    displayName: string;
    isMcp: boolean;
    renderSetupButton: () => React.ReactNode;
}

export const CatalogFunctions: React.FC<CatalogFunctionsProps> = ({ templates, provider, displayName, isMcp, renderSetupButton }) => {
    const [rawType, setType] = useQueryState('type', parseAsStringLiteral(FUNCTION_TYPES));
    const [selectedName, setSelectedName] = useQueryState('function', parseAsString);
    const [search, setSearch] = useState('');

    const tabs = FUNCTION_TYPES.map((type) => ({
        type,
        items: templates.filter((fn) => (type === 'action' ? fn.type === 'action' || fn.type === 'tool' : fn.type === type))
    }));
    const activeTab = tabs.find((tab) => tab.type === rawType && tab.items.length > 0) ?? tabs.find((tab) => tab.items.length > 0);

    if (!activeTab) {
        return isMcp ? <McpToolsState /> : <NoFunctionsState displayName={displayName} />;
    }

    const needle = search.trim().toLowerCase();
    const shown = needle ? activeTab.items.filter((fn) => `${fn.name} ${fn.description ?? ''}`.toLowerCase().includes(needle)) : activeTab.items;
    const selected = activeTab.items.find((fn) => fn.name === selectedName) ?? null;
    const labels = TAB_LABELS[activeTab.type];

    return (
        <div className="flex flex-col gap-3">
            <FunctionTypeTabs
                tabs={tabs.map((tab) => ({ value: tab.type, label: TAB_LABELS[tab.type].plural, count: tab.items.length }))}
                value={activeTab.type}
                onChange={(type) => {
                    void setType(type);
                    void setSelectedName(null);
                }}
            />

            <SearchField value={search} placeholder={`Search ${labels.plural.toLowerCase()}`} onChange={setSearch} />

            <SlidingPanelLayout
                selected={selected}
                getKey={(fn) => `${fn.type}:${fn.name}`}
                renderPanel={(fn) => (
                    <CatalogFunctionPanel fn={fn} provider={provider} setupButton={renderSetupButton()} onClose={() => void setSelectedName(null)} />
                )}
                onClose={() => void setSelectedName(null)}
            >
                <FunctionList
                    title={labels.plural}
                    footer={`Showing ${shown.length} of ${activeTab.items.length} ${activeTab.items.length === 1 ? labels.singular : labels.plural.toLowerCase()}`}
                    empty={
                        shown.length === 0 && <FunctionListNoMatches query={search.trim()} noun={labels.plural.toLowerCase()} onClear={() => setSearch('')} />
                    }
                >
                    {shown.map((fn) => (
                        <FunctionListRow
                            key={fn.name}
                            name={fn.name}
                            description={fn.description}
                            selected={fn.name === selected?.name}
                            onSelect={() => void setSelectedName(fn.name === selectedName ? null : fn.name)}
                        />
                    ))}
                </FunctionList>
            </SlidingPanelLayout>
        </div>
    );
};

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
            <LinkButton asChild size="lg">
                <a href={FUNCTIONS_GUIDE_URL} target="_blank" rel="noreferrer">
                    Build your own <ArrowUpRight />
                </a>
            </LinkButton>
            <LinkButton asChild size="lg">
                <a href={PROXY_GUIDE_URL} target="_blank" rel="noreferrer">
                    Proxy docs <ArrowUpRight />
                </a>
            </LinkButton>
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
            <LinkButton asChild size="lg">
                <a href={MCP_TOOLS_GUIDE_URL} target="_blank" rel="noreferrer">
                    Docs <ArrowUpRight />
                </a>
            </LinkButton>
        </div>
    </EmptyStateCard>
);
