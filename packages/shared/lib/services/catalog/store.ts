import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getFlags } from '@nangohq/feature-flags';
import { getLogger, report } from '@nangohq/utils';

import { envs } from '../../env.js';

import type { CatalogIndex, CatalogIndexAlias, CatalogIndexProvider, FlowsZeroJson, FlowZeroJson } from '@nangohq/types';

const logger = getLogger('Catalog');

/** `packages/shared`, where integration-templates writes flows.zero.json, catalog.json and catalog/. Same depth from lib/ and dist/. */
const SHARED_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const FLAG_REFRESH_INTERVAL_MS = 30_000;

export interface CatalogCounts {
    actions: number;
    syncs: number;
    functions: number;
}

function isAlias(entry: CatalogIndexProvider | CatalogIndexAlias): entry is CatalogIndexAlias {
    return 'aliasOf' in entry;
}

/**
 * Reads the template catalog that integration-templates writes into `packages/shared`.
 *
 * - With `catalog.json` (and the `catalog-index-file` flag on), only the index is read up front. A
 *   provider's definitions (`catalog/<provider>.json`) are read when a request needs them and kept in an
 *   LRU bounded by provider count and by total file size, so memory doesn't grow with the catalog.
 * - Otherwise, the whole of `flows.zero.json` is read once and kept, as before.
 *
 * Both return the same entries: a provider's flows.zero.json entry, with aliases (symlinked providers)
 * under their own key and `symLinkTargetName` set. The catalog never changes while a process runs, so
 * nothing expires; the LRU only caps memory. Reads are synchronous (a provider file parses in ~1–5 ms).
 */
export class CatalogStore {
    private readonly dir: string;
    private readonly maxProviders: number;
    private readonly maxBytes: number;
    private readonly useIndexFile: () => boolean;

    /** `undefined`: not read yet. `null`: there's no usable catalog.json, so flows.zero.json is used. */
    private index: CatalogIndex | null | undefined;
    private legacy: Map<string, FlowZeroJson> | undefined;
    private readonly cache = new Map<string, { entry: FlowZeroJson; bytes: number }>();
    private cachedBytes = 0;

    constructor({ dir, maxProviders, maxBytes, useIndexFile }: { dir: string; maxProviders: number; maxBytes: number; useIndexFile: () => boolean }) {
        this.dir = dir;
        this.maxProviders = maxProviders;
        this.maxBytes = maxBytes;
        this.useIndexFile = useIndexFile;
    }

    /** A provider's catalog entry (its templates), or null when the catalog has none for it. */
    getEntry(provider: string): FlowZeroJson | null {
        const index = this.currentIndex();
        if (!index) {
            return this.legacyEntries().get(provider) ?? null;
        }

        const cached = this.cache.get(provider);
        if (cached) {
            // Map keeps insertion order: re-inserting marks the provider as most recently used.
            this.cache.delete(provider);
            this.cache.set(provider, cached);
            return cached.entry;
        }

        const summary = index.providers[provider];
        if (!summary) {
            return null;
        }
        const fileProvider = isAlias(summary) ? summary.aliasOf : provider;
        const fileSummary = index.providers[fileProvider];
        if (!fileSummary || isAlias(fileSummary)) {
            throw new Error(`catalog.json: '${provider}' points at '${fileProvider}', which has no file`);
        }

        const text = fs.readFileSync(path.join(this.dir, fileSummary.file), 'utf8');
        const parsed = JSON.parse(text) as FlowZeroJson;
        const entry: FlowZeroJson = isAlias(summary) ? { ...parsed, providerConfigKey: provider, symLinkTargetName: summary.aliasOf } : parsed;
        this.remember(provider, entry, text.length);
        return entry;
    }

    /** Every provider with templates, aliases included. */
    listProviders(): string[] {
        const index = this.currentIndex();
        return index ? Object.keys(index.providers) : [...this.legacyEntries().keys()];
    }

    /** How many templates a provider has, without reading its definitions when catalog.json is used. */
    getCounts(provider: string): CatalogCounts | null {
        const index = this.currentIndex();
        if (!index) {
            const entry = this.legacyEntries().get(provider);
            return entry ? { actions: entry.actions.length, syncs: entry.syncs.length, functions: countFunctions(entry) } : null;
        }

        const summary = index.providers[provider];
        const fileSummary = summary && isAlias(summary) ? index.providers[summary.aliasOf] : summary;
        return fileSummary && !isAlias(fileSummary) ? fileSummary.counts : null;
    }

    /** The provider a symlinked provider points to in integration-templates, or null. */
    getSymLinkTargetName(provider: string): string | null {
        const index = this.currentIndex();
        if (!index) {
            return this.legacyEntries().get(provider)?.symLinkTargetName ?? null;
        }
        const summary = index.providers[provider];
        return summary && isAlias(summary) ? summary.aliasOf : null;
    }

    private currentIndex(): CatalogIndex | null {
        if (!this.useIndexFile()) {
            if (this.cache.size > 0) {
                this.clearCache();
            }
            return null;
        }
        if (this.index === undefined) {
            this.index = this.readIndex();
        }
        if (this.index) {
            // Switched from flows.zero.json: let it be garbage collected.
            this.legacy = undefined;
        }
        return this.index;
    }

    private readIndex(): CatalogIndex | null {
        const indexPath = path.join(this.dir, 'catalog.json');
        if (!fs.existsSync(indexPath)) {
            logger.warning(`${indexPath} not found, reading flows.zero.json instead`);
            return null;
        }
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as CatalogIndex;
        if (index.formatVersion !== 1) {
            logger.warning(`${indexPath} has formatVersion ${String(index.formatVersion)}, expected 1; reading flows.zero.json instead`);
            return null;
        }
        return index;
    }

    private legacyEntries(): Map<string, FlowZeroJson> {
        if (!this.legacy) {
            const flows = JSON.parse(fs.readFileSync(path.join(this.dir, 'flows.zero.json'), 'utf8')) as FlowsZeroJson;
            this.legacy = new Map(flows.map((entry) => [entry.providerConfigKey, entry]));
        }
        return this.legacy;
    }

    private remember(provider: string, entry: FlowZeroJson, bytes: number): void {
        this.cache.set(provider, { entry, bytes });
        this.cachedBytes += bytes;

        // Evict the least recently used providers until both limits hold, never the one just read.
        for (const [key, cached] of this.cache) {
            if (this.cache.size <= this.maxProviders && this.cachedBytes <= this.maxBytes) {
                break;
            }
            if (key === provider) {
                continue;
            }
            this.cache.delete(key);
            this.cachedBytes -= cached.bytes;
        }
    }

    private clearCache(): void {
        this.cache.clear();
        this.cachedBytes = 0;
    }
}

function countFunctions(entry: FlowZeroJson): number {
    const functions = (entry as { functions?: unknown[] }).functions;
    return Array.isArray(functions) ? functions.length : 0;
}

// The `catalog-index-file` flag is global and only changes how the catalog is read, so its value is kept
// here and refreshed in the background: lookups stay synchronous, and turning the flag on or off takes
// effect within the refresh interval, without restarting pods.
let indexFileEnabled = false;
let refreshTimer: NodeJS.Timeout | undefined;

async function refreshIndexFileFlag(): Promise<void> {
    try {
        indexFileEnabled = await getFlags().isCatalogIndexFileEnabled();
    } catch (err) {
        report(err);
    }
}

/**
 * Reads the `catalog-index-file` flag, then again every 30 seconds. Call at startup, after the feature
 * flags are initialized, so the first lookups already use the right file. Until then, and in processes
 * that never call it, the flag's default (flows.zero.json) applies.
 */
export async function startCatalogFlagRefresh(): Promise<void> {
    if (refreshTimer) {
        return;
    }
    await refreshIndexFileFlag();
    refreshTimer = setInterval(() => void refreshIndexFileFlag(), FLAG_REFRESH_INTERVAL_MS);
    refreshTimer.unref();
}

export function stopCatalogFlagRefresh(): void {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
}

export const catalogStore = new CatalogStore({
    dir: SHARED_DIR,
    maxProviders: envs.NANGO_CATALOG_CACHE_MAX_PROVIDERS,
    maxBytes: envs.NANGO_CATALOG_CACHE_MAX_BYTES,
    useIndexFile: () => indexFileEnabled
});
