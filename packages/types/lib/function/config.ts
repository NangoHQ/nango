import type { OnEventType } from '../scripts/on-events/api.js';

export interface FunctionCapabilities {
    usesRecords: boolean;
    usesOutbound: boolean;
    usesCheckpoints: boolean;
    usesMetadata: boolean;
    usesInvoke: boolean;
}

/**
 * Declares where the debounce/coalescing key is extracted from:
 * - `{ body: '$.portalId' }`: dot notation path into the body
 * - `{ header: 'x-goog-resource-id' }`: flat, case-insensitive header lookup
 */
export type DebounceKeySource = { body: string } | { header: string };

/** Coalesces a burst of inbound HTTP requests into a single function run within a sliding window. */
export interface DebounceOptions {
    /** Events sharing the same resolved key coalesce together. */
    keyBy?: DebounceKeySource | DebounceKeySource[] | undefined;
    /** Sliding window in milliseconds. */
    windowMs: number;
    /** When exceeded, the window stops sliding. */
    maxEntities?: number | undefined;
    /** Which payloads from the coalesced window the handler receives. */
    take?: 'latest' | 'first' | 'all' | undefined;
}

/**
 * Declares how a function is initiated from outside; `kind` discriminates the source.
 * - `none`: no external trigger; the function is invoke-only
 * - `schedule`: a periodic schedule
 * - `http`: an incoming HTTP call or webhook request
 * - `event`: an internal Nango lifecycle event
 */
export type FunctionTriggerDefinition =
    | { kind: 'none' }
    | { kind: 'schedule'; frequency: string; autoStart?: boolean | undefined }
    | { kind: 'http'; subscriptions?: string[] | undefined; debounce?: DebounceOptions | undefined }
    | { kind: 'event'; events: OnEventType[] };

export type FunctionConcurrencyLimit = 1 | 'max';

export interface FunctionLimits {
    concurrency?:
        | {
              perConnection: FunctionConcurrencyLimit;
          }
        | undefined;
}

export type FunctionRequires =
    | { connection?: true | undefined; outbound?: boolean | undefined; invoke?: boolean | undefined }
    | { connection: false; outbound?: false | undefined; invoke?: boolean | undefined };
