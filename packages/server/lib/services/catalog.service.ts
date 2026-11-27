import { getProviders, sharedCredentialsService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import providerService, { isCatalogToolTemplate } from './provider.service.js';

import type { ProviderTemplateConfig } from './provider.service.js';
import type { CatalogFunctionDefinition } from '@nangohq/shared';
import type { ApiCatalogFunctionTypeFilter, ApiProviderFunctionCounts, NangoSyncConfig, Provider } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export type CatalogServiceErrorCode =
    | 'not_found'
    | 'providers_unavailable'
    | 'managed_apps_unavailable'
    | 'function_counts_unavailable'
    | 'functions_unavailable';

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
    managedAppScopes: string[] | null;
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

interface CatalogFunctionBase {
    name: string;
    description: string | null;
}

export type CatalogFunction =
    | (CatalogFunctionBase & { type: 'action' | 'sync'; template: NangoSyncConfig })
    | (CatalogFunctionBase & { type: 'tool'; template: CatalogFunctionDefinition });

const FunctionTypePriority = {
    tool: 0,
    action: 1,
    sync: 2
} as const;

function toCatalogFunction(template: ProviderTemplateConfig): CatalogFunction | null {
    if (isCatalogToolTemplate(template)) {
        return { name: template.name, type: 'tool', description: template.description, template };
    }

    const type = template.type ?? 'action';
    if (type !== 'action' && type !== 'sync') {
        return null;
    }
    return { name: template.name, type, description: template.description ?? null, template };
}

function matchesTypeFilter(fn: CatalogFunction, type: ApiCatalogFunctionTypeFilter | undefined): boolean {
    switch (type) {
        case undefined:
            return true;
        case 'tool':
            return fn.type === 'tool' || fn.type === 'action';
        case 'sync':
            return fn.type === 'sync';
    }
}

function matchesSearch(fn: CatalogFunction, normalizedQuery: string): boolean {
    return normalizeSearch(fn.name).includes(normalizedQuery) || normalizeSearch(fn.description ?? '').includes(normalizedQuery);
}

function byNameThenType(a: CatalogFunction, b: CatalogFunction): number {
    return a.name.localeCompare(b.name) || FunctionTypePriority[a.type] - FunctionTypePriority[b.type];
}

interface CatalogDetails {
    managedApps: Record<string, { scopes: string[] }>;
    functionCounts: Map<string, ApiProviderFunctionCounts>;
}

function toCatalogProvider({ name, provider }: { name: string; provider: Provider }, details: CatalogDetails): CatalogProvider {
    return {
        name,
        provider,
        managedAppScopes: details.managedApps[name]?.scopes ?? null,
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
        const provider = this.findProvider(name);
        if (provider.isErr()) {
            return Err(provider.error);
        }

        const details = await this.loadCatalogDetails();
        if (details.isErr()) {
            return Err(details.error);
        }

        return Ok(toCatalogProvider({ name, provider: provider.value }, details.value));
    }

    listFunctions({
        provider,
        type,
        search,
        page,
        limit
    }: {
        provider: string;
        type: ApiCatalogFunctionTypeFilter | undefined;
        search: string | undefined;
        page: number;
        limit: number;
    }): Result<{ functions: CatalogFunction[]; total: number }, CatalogServiceError> {
        const functions = this.loadFunctions(provider);
        if (functions.isErr()) {
            return Err(functions.error);
        }

        const normalizedQuery = search === undefined ? undefined : normalizeSearch(search);
        const matches = functions.value
            .filter((fn) => matchesTypeFilter(fn, type) && (normalizedQuery === undefined || matchesSearch(fn, normalizedQuery)))
            .sort(byNameThenType);

        return Ok({ functions: matches.slice(page * limit, (page + 1) * limit), total: matches.length });
    }

    getFunction({
        provider,
        name,
        type
    }: {
        provider: string;
        name: string;
        type: ApiCatalogFunctionTypeFilter | undefined;
    }): Result<CatalogFunction, CatalogServiceError> {
        const functions = this.loadFunctions(provider);
        if (functions.isErr()) {
            return Err(functions.error);
        }

        const [match] = functions.value.filter((fn) => fn.name === name && matchesTypeFilter(fn, type)).sort(byNameThenType);
        if (!match) {
            return Err(new CatalogServiceError({ code: 'not_found', message: `Unknown function ${name}` }));
        }
        return Ok(match);
    }

    private findProvider(name: string): Result<Provider, CatalogServiceError> {
        const providers = getProviders();
        if (!providers) {
            return Err(new CatalogServiceError({ code: 'providers_unavailable', message: 'Failed to load providers' }));
        }

        const provider = Object.hasOwn(providers, name) ? providers[name] : undefined;
        if (!provider) {
            return Err(new CatalogServiceError({ code: 'not_found', message: `Unknown provider ${name}` }));
        }
        return Ok(provider);
    }

    private loadFunctions(provider: string): Result<CatalogFunction[], CatalogServiceError> {
        const found = this.findProvider(provider);
        if (found.isErr()) {
            return Err(found.error);
        }

        const templates = providerService.listTemplates({ providerName: provider });
        if (templates.isErr()) {
            return Err(new CatalogServiceError({ code: 'functions_unavailable', message: 'Failed to load functions', cause: templates.error }));
        }

        return Ok(templates.value.map(toCatalogFunction).filter((fn) => fn !== null));
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
