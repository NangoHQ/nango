import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { report } from '@nangohq/utils';

import { envs } from '../../env.js';

import type { CatalogIndex, CatalogIndexAlias, CatalogIndexProvider, FlowZeroJson } from '@nangohq/types';

/** `packages/shared`, where integration-templates writes catalog.json and catalog/. Same depth from lib/ and dist/. */
const SHARED_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export interface CatalogCounts {
    actions: number;
    syncs: number;
    /** Entries in `functions`. */
    functions: number;
    /** Those of `functions` that are tools. */
    tools: number;
}

function isAlias(entry: CatalogIndexProvider | CatalogIndexAlias): entry is CatalogIndexAlias {
    return 'aliasOf' in entry;
}

const catalogIndexSchema = z
    .object({
        formatVersion: z.literal(1),
        providers: z.record(
            z.string(),
            z.union([
                z.object({ aliasOf: z.string() }),
                z.object({
                    file: z.string(),
                    sha256: z.string(),
                    counts: z.object({ actions: z.number(), syncs: z.number(), functions: z.number(), tools: z.number() })
                })
            ])
        )
    })
    .superRefine((index, ctx) => {
        // An alias is read from its target's file, so the target needs one.
        for (const [provider, summary] of Object.entries(index.providers)) {
            if (!isAlias(summary)) {
                continue;
            }
            const target = index.providers[summary.aliasOf];
            if (!target || isAlias(target)) {
                ctx.addIssue({ code: 'custom', path: ['providers', provider, 'aliasOf'], message: `'${summary.aliasOf}' has no file` });
            }
        }
    }) satisfies z.ZodType<CatalogIndex>;

/**
 * Reads the template catalog that integration-templates writes into `packages/shared`.
 *
 * Only `catalog.json` (the index) is read up front. A provider's definitions (`catalog/<provider>.json`) are
 * read when a request needs them and kept in an LRU bounded by provider count and by total file size, so
 * memory doesn't grow with the catalog. An alias (a symlinked provider) is returned under its own key, with
 * its target's templates and `symLinkTargetName` set. The catalog never changes while a process runs, so
 * nothing expires; the LRU only caps memory.
 *
 * Nothing here throws on a bad file: a catalog file that's missing, unreadable or corrupt is reported, and
 * what it describes is left out (an empty catalog, or a provider without templates).
 */
export class CatalogStore {
    private readonly dir: string;
    private readonly maxProviders: number;
    private readonly maxBytes: number;

    /** `undefined`: not read yet. */
    private index: CatalogIndex | undefined;
    /** Provider files found missing, unreadable or corrupt: their providers have no templates. */
    private readonly unusableFiles = new Set<string>();
    private readonly cache = new Map<string, { entry: FlowZeroJson; bytes: number }>();
    private cachedBytes = 0;

    constructor({ dir, maxProviders, maxBytes }: { dir: string; maxProviders: number; maxBytes: number }) {
        this.dir = dir;
        this.maxProviders = maxProviders;
        this.maxBytes = maxBytes;
    }

    /** A provider's catalog entry (its templates), or null when the catalog has none for it. */
    getEntry(provider: string): FlowZeroJson | null {
        const index = this.loadIndex();
        const cached = this.cache.get(provider);
        if (cached) {
            // Map keeps insertion order: re-inserting marks the provider as most recently used.
            this.cache.delete(provider);
            this.cache.set(provider, cached);
            return cached.entry;
        }

        const summary = index.providers[provider];
        const fileSummary = summary && this.fileSummary(index, summary);
        if (!summary || !fileSummary) {
            return null;
        }
        const file = this.readProviderFile(isAlias(summary) ? summary.aliasOf : provider, fileSummary);
        if (!file) {
            return null;
        }
        const entry: FlowZeroJson = isAlias(summary) ? { ...file.entry, providerConfigKey: provider, symLinkTargetName: summary.aliasOf } : file.entry;
        this.remember(provider, entry, file.bytes);
        return entry;
    }

    /** Every provider with templates, aliases included. */
    listProviders(): string[] {
        const index = this.loadIndex();
        return Object.entries(index.providers)
            .filter(([, summary]) => this.fileSummary(index, summary))
            .map(([provider]) => provider);
    }

    /** How many templates a provider has, from the index alone. */
    getCounts(provider: string): CatalogCounts | null {
        const index = this.loadIndex();
        const summary = index.providers[provider];
        return (summary && this.fileSummary(index, summary)?.counts) ?? null;
    }

    /** Providers with functions, aliases included: what to read to find a function by UUID. */
    listProvidersWithFunctions(): string[] {
        return this.listProviders().filter((provider) => (this.getCounts(provider)?.functions ?? 0) > 0);
    }

    /** The provider a symlinked provider points to in integration-templates, or null. */
    getSymLinkTargetName(provider: string): string | null {
        const summary = this.loadIndex().providers[provider];
        return summary && isAlias(summary) ? summary.aliasOf : null;
    }

    private loadIndex(): CatalogIndex {
        this.index ??= this.readIndex();
        return this.index;
    }

    /** catalog.json, or an empty catalog when it can't be used. Providers whose file is missing are left out. */
    private readIndex(): CatalogIndex {
        const indexPath = path.join(this.dir, 'catalog.json');
        const empty = (reason: string, err?: unknown): CatalogIndex => {
            report(new Error(`${indexPath} ${reason}, so the template catalog is empty`, { cause: err }));
            return { formatVersion: 1, providers: {} };
        };

        let json: unknown;
        try {
            json = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        } catch (err) {
            return empty("can't be read", err);
        }

        const formatVersion = (json as { formatVersion?: unknown } | null)?.formatVersion;
        if (typeof formatVersion === 'number' && formatVersion !== 1) {
            return empty(`has formatVersion ${formatVersion}, which this version of Nango can't read`);
        }

        const index = catalogIndexSchema.safeParse(json);
        if (!index.success) {
            return empty(`is malformed:\n${z.prettifyError(index.error)}`);
        }

        for (const summary of Object.values(index.data.providers)) {
            if (!isAlias(summary) && !fs.existsSync(path.join(this.dir, summary.file))) {
                this.unusableFiles.add(summary.file);
            }
        }
        if (this.unusableFiles.size > 0) {
            report(new Error(`${indexPath} lists provider files that don't exist; those providers have no templates: ${[...this.unusableFiles].join(', ')}`));
        }
        return index.data;
    }

    /** The summary of the file a provider is read from (its target's for an alias), or null when it can't be used. */
    private fileSummary(index: CatalogIndex, summary: CatalogIndexProvider | CatalogIndexAlias): CatalogIndexProvider | null {
        const fileSummary = isAlias(summary) ? index.providers[summary.aliasOf] : summary;
        return fileSummary && !isAlias(fileSummary) && !this.unusableFiles.has(fileSummary.file) ? fileSummary : null;
    }

    /** A provider's file, or null (reported once) when it can't be read, isn't JSON, or doesn't match its sha256. */
    private readProviderFile(provider: string, summary: CatalogIndexProvider): { entry: FlowZeroJson; bytes: number } | null {
        try {
            const text = fs.readFileSync(path.join(this.dir, summary.file), 'utf8');
            if (createHash('sha256').update(text).digest('hex') !== summary.sha256) {
                throw new Error("its sha256 doesn't match catalog.json");
            }
            return { entry: JSON.parse(text) as FlowZeroJson, bytes: text.length };
        } catch (err) {
            this.unusableFiles.add(summary.file);
            report(new Error(`${summary.file} can't be used, so '${provider}' has no templates`, { cause: err }));
            return null;
        }
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
}

export const catalogStore = new CatalogStore({
    dir: SHARED_DIR,
    maxProviders: envs.NANGO_CATALOG_CACHE_MAX_PROVIDERS,
    maxBytes: envs.NANGO_CATALOG_CACHE_MAX_BYTES
});

/** Reads the catalog's index. Call at startup, so the first request that needs the catalog doesn't. */
export function loadCatalog(): void {
    catalogStore.listProviders();
}
