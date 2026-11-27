import { getProviders, sharedCredentialsService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import providerService from './provider.service.js';

import type { ApiProviderFunctionCounts, Provider } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export type CatalogServiceErrorCode = 'not_found' | 'providers_unavailable' | 'managed_apps_unavailable' | 'function_counts_unavailable';

export class CatalogServiceError extends Error {
    public readonly code: CatalogServiceErrorCode;

    constructor({ code, message, cause }: { code: CatalogServiceErrorCode; message: string; cause?: unknown }) {
        super(message, { cause });
        this.name = 'CatalogServiceError';
        this.code = code;
    }
}

export interface CatalogProvider {
    name: string;
    provider: Provider;
    hasManagedApp: boolean;
    functionCounts: ApiProviderFunctionCounts | undefined;
}

export interface CatalogProviderCandidate {
    name: string;
    displayName: string;
}

const SearchRank = {
    exactSlug: 0,
    exactDisplayName: 1,
    slugPrefix: 2,
    displayNamePrefix: 3,
    substring: 4
} as const;

export function normalizeSearch(value: string): string {
    return value
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function getSearchRank(normalizedQuery: string, candidate: CatalogProviderCandidate): number | null {
    const slug = normalizeSearch(candidate.name);
    const displayName = normalizeSearch(candidate.displayName);

    if (slug === normalizedQuery) {
        return SearchRank.exactSlug;
    }
    if (displayName === normalizedQuery) {
        return SearchRank.exactDisplayName;
    }
    if (slug.startsWith(normalizedQuery)) {
        return SearchRank.slugPrefix;
    }
    if (displayName.startsWith(normalizedQuery)) {
        return SearchRank.displayNamePrefix;
    }
    if (slug.includes(normalizedQuery) || displayName.includes(normalizedQuery)) {
        return SearchRank.substring;
    }
    return null;
}

export function rankProviders<T extends CatalogProviderCandidate>(candidates: T[], search: string | undefined): T[] {
    const bySlug = (a: T, b: T) => a.name.localeCompare(b.name);
    if (search === undefined) {
        return [...candidates].sort(bySlug);
    }

    const normalizedQuery = normalizeSearch(search);
    return candidates
        .map((candidate) => ({ candidate, rank: getSearchRank(normalizedQuery, candidate) }))
        .filter((match): match is { candidate: T; rank: number } => match.rank !== null)
        .sort((a, b) => a.rank - b.rank || bySlug(a.candidate, b.candidate))
        .map(({ candidate }) => candidate);
}

interface CatalogDetails {
    managedApps: Record<string, { preConfigured: boolean }>;
    functionCounts: Map<string, ApiProviderFunctionCounts>;
}

function toCatalogProvider({ name, provider }: { name: string; provider: Provider }, details: CatalogDetails): CatalogProvider {
    return {
        name,
        provider,
        hasManagedApp: details.managedApps[name]?.preConfigured ?? false,
        functionCounts: details.functionCounts.get(name)
    };
}

export class CatalogService {
    async searchProviders({
        search,
        page,
        limit
    }: {
        search: string | undefined;
        page: number;
        limit: number;
    }): Promise<Result<{ providers: CatalogProvider[]; total: number }, CatalogServiceError>> {
        const providers = getProviders();
        if (!providers) {
            return Err(new CatalogServiceError({ code: 'providers_unavailable', message: 'Failed to load providers' }));
        }

        const candidates = Object.entries(providers).map(([name, provider]) => ({ name, displayName: provider.display_name, provider }));
        const ranked = rankProviders(candidates, search);
        const pageItems = ranked.slice(page * limit, (page + 1) * limit);
        if (pageItems.length === 0) {
            return Ok({ providers: [], total: ranked.length });
        }

        const details = await this.loadCatalogDetails();
        if (details.isErr()) {
            return Err(details.error);
        }

        return Ok({
            providers: pageItems.map((entry) => toCatalogProvider(entry, details.value)),
            total: ranked.length
        });
    }

    async getProvider(name: string): Promise<Result<CatalogProvider, CatalogServiceError>> {
        const providers = getProviders();
        if (!providers) {
            return Err(new CatalogServiceError({ code: 'providers_unavailable', message: 'Failed to load providers' }));
        }

        const provider = Object.hasOwn(providers, name) ? providers[name] : undefined;
        if (!provider) {
            return Err(new CatalogServiceError({ code: 'not_found', message: `Unknown provider ${name}` }));
        }

        const details = await this.loadCatalogDetails();
        if (details.isErr()) {
            return Err(details.error);
        }

        return Ok(toCatalogProvider({ name, provider }, details.value));
    }

    private async loadCatalogDetails(): Promise<Result<CatalogDetails, CatalogServiceError>> {
        const managedApps = await sharedCredentialsService.getPreConfiguredProviderScopes();
        if (managedApps.isErr()) {
            return Err(new CatalogServiceError({ code: 'managed_apps_unavailable', message: 'Failed to load Nango-managed apps', cause: managedApps.error }));
        }

        const functionCounts = providerService.countTemplatesByProvider();
        if (functionCounts.isErr()) {
            return Err(new CatalogServiceError({ code: 'function_counts_unavailable', message: 'Failed to count functions', cause: functionCounts.error }));
        }

        return Ok({ managedApps: managedApps.value, functionCounts: functionCounts.value });
    }
}

export default new CatalogService();
