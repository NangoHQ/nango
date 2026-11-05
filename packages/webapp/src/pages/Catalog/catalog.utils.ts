import type { ApiProviderFunctionCounts, ApiProviderListItem, AuthModeType } from '@nangohq/types';

export const POPULAR_CATEGORY = 'popular';
export const PAGE_SIZE = 48;

export type CatalogSort = 'popular' | 'alphabetical';
export type InstantSetup = 'managed' | 'no-dev-app' | null;

const AUTH_MODES_NEEDING_DEV_APP: AuthModeType[] = ['OAUTH1', 'OAUTH2', 'APP', 'CUSTOM'];

export function getInstantSetup(provider: Pick<ApiProviderListItem, 'preConfigured' | 'authMode' | 'clientRegistration'>): InstantSetup {
    if (provider.preConfigured) {
        return 'managed';
    }
    if (AUTH_MODES_NEEDING_DEV_APP.includes(provider.authMode)) {
        return null;
    }
    if (provider.authMode === 'MCP_OAUTH2' && provider.clientRegistration === 'static') {
        return null;
    }
    return 'no-dev-app';
}

export function countIntegrationsByProvider(integrations: { provider: string }[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const integration of integrations) {
        counts.set(integration.provider, (counts.get(integration.provider) ?? 0) + 1);
    }
    return counts;
}

export function isPopular(provider: Pick<ApiProviderListItem, 'categories'>): boolean {
    return provider.categories?.includes(POPULAR_CATEGORY) ?? false;
}

export function getVisibleCategories(provider: Pick<ApiProviderListItem, 'categories'>): string[] {
    return (provider.categories ?? []).filter((category) => category !== POPULAR_CATEGORY);
}

const CATEGORY_LABELS: Record<string, string> = {
    ats: 'ATS',
    cms: 'CMS',
    crm: 'CRM',
    'dev-tools': 'Dev Tools',
    'e-commerce': 'E-commerce',
    erp: 'ERP',
    hr: 'HR',
    iam: 'IAM',
    'knowledge-base': 'Knowledge Base',
    mcp: 'MCP'
};

export function getCategoryLabel(slug: string): string {
    return (
        CATEGORY_LABELS[slug] ??
        slug
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
    );
}

export interface CategoryOption {
    slug: string;
    label: string;
    count: number;
}

export function listCategories(providers: Pick<ApiProviderListItem, 'categories'>[]): CategoryOption[] {
    const counts = new Map<string, number>();
    for (const provider of providers) {
        for (const category of getVisibleCategories(provider)) {
            counts.set(category, (counts.get(category) ?? 0) + 1);
        }
    }
    return [...counts.entries()].map(([slug, count]) => ({ slug, label: getCategoryLabel(slug), count })).sort((a, b) => a.label.localeCompare(b.label));
}

export function sortProviders<T extends Pick<ApiProviderListItem, 'displayName' | 'categories'>>(providers: T[], sort: CatalogSort): T[] {
    const byName = (a: T, b: T) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
    if (sort === 'alphabetical') {
        return [...providers].sort(byName);
    }
    return [...providers].sort((a, b) => Number(isPopular(b)) - Number(isPopular(a)) || byName(a, b));
}

export function filterProviders<T extends Pick<ApiProviderListItem, 'categories' | 'preConfigured' | 'authMode' | 'clientRegistration'>>(
    providers: T[],
    { category, instantOnly }: { category: string | null; instantOnly: boolean }
): T[] {
    return providers.filter(
        (provider) => (!category || (provider.categories?.includes(category) ?? false)) && (!instantOnly || getInstantSetup(provider) !== null)
    );
}

export function formatFunctionCounts({ actions, syncs }: ApiProviderFunctionCounts): string | null {
    const parts = [actions > 0 && pluralize(actions, 'action'), syncs > 0 && pluralize(syncs, 'sync')].filter((part) => typeof part === 'string');
    return parts.length > 0 ? parts.join(' · ') : null;
}

export function getCardMeta(provider: Pick<ApiProviderListItem, 'functionCounts' | 'categories'>): string {
    const functions = formatFunctionCounts(provider.functionCounts);
    if (functions) {
        return functions;
    }
    const categories = getVisibleCategories(provider);
    if (categories.length > 0) {
        return categories.map(getCategoryLabel).join(' · ');
    }
    return 'No pre-built functions yet';
}

export function getInitials(displayName: string): string {
    const nameWithoutQualifier = displayName.replace(/\(.*?\)/g, '');
    const words = nameWithoutQualifier.match(/[A-Za-z0-9]+/g) ?? [];
    const initials = words.length > 1 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : (words[0]?.slice(0, 2) ?? '');
    return initials.toUpperCase();
}

export function pluralize(count: number, singular: string): string {
    return `${count.toLocaleString('en-US')} ${count === 1 ? singular : `${singular}s`}`;
}
