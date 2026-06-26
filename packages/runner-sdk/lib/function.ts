import type { ProxyConfiguration } from './action.js';
import type { ZodCheckpoint, ZodMetadata, ZodModel } from './types.js';
import type { UncontrolledFetchOptions } from './uncontrolledFetch.js';
import type { GetPublicConnection, HTTP_METHOD, MaybePromise, MergingStrategy, OnEventType } from '@nangohq/types';
import type * as z from 'zod';

type InferZod<T> = T extends z.ZodTypeAny ? z.infer<T> : never;

// Limits

export type ConcurrencyLimit = 1 | 'max';

// Debounce

/**
 * Declares where the debounce/coalescing key is extracted from:
 * - `{ body: '$.portalId' }`: dot notation path into the body
 * - `{ header: 'x-goog-resource-id' }`: flat, case-insensitive header lookup
 */
export type DebounceKeySource = { body: string } | { header: string };

// Coalesces a burst of inbound http requests into a single function run within a sliding window.
export interface DebounceOptions {
    // Events sharing the same resolved key coalesce together.
    keyBy?: DebounceKeySource | DebounceKeySource[];
    // Sliding window in milliseconds.
    windowMs: number;
    // When exceeded, the window stops sliding
    maxEntities?: number;
    // Which payload(s) from the coalesced window the handler receives: the first, the latest, or all of them.
    take?: 'latest' | 'first' | 'all';
}

// Triggers

/**
 * A function declares exactly one trigger: the `kind` discriminates what initiates execution.
 * - `schedule`: a periodic schedule
 * - `http`: an incoming http call or webhook request
 * - `event`: an internal Nango lifecycle event
 * - `invoke`: called by another function via `nango.invoke()`
 */
export type TriggerDefinition =
    | { kind: 'schedule'; frequency: string; autoStart?: boolean }
    | { kind: 'http'; input?: z.ZodTypeAny; subscriptions?: string[]; debounce?: DebounceOptions }
    | { kind: 'event'; events: OnEventType[] }
    | { kind: 'invoke'; input: z.ZodTypeAny };

// The inbound http request that initiated the run.
export interface HttpRequest {
    method: HTTP_METHOD;
    path: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    body: unknown;
}
// Coalescing summary, present on an http trigger when `debounce` is configured and coalescing happened.
export interface CoalescedInfo {
    count: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
}

type TriggerInput<TTrigger> = TTrigger extends { input: infer I extends z.ZodTypeAny } ? I : z.ZodVoid;

// `debounce.take: 'all'` delivers the whole coalesced batch, so the payload becomes an array; otherwise a single input.
type HttpPayload<TT> = TT extends { debounce: { take: 'all' } } ? z.infer<TriggerInput<TT>>[] : z.infer<TriggerInput<TT>>;

interface TriggerBase {
    /**
     * Pre-populated when the run was started with connection context.
     * Undefined for connection-less runs.
     */
    connection?: { connection_id: string; integrationId: string };
}

// The runtime trigger a function `exec` receives, mapped from the declared `TriggerDefinition`.
export type Trigger<TT extends TriggerDefinition> = TT extends { kind: 'schedule' }
    ? TriggerBase & { kind: 'schedule'; payload: null }
    : TT extends { kind: 'invoke' }
      ? TriggerBase & { kind: 'invoke'; payload: z.infer<TriggerInput<TT>> }
      : TT extends { kind: 'http' }
        ? TriggerBase & { kind: 'http'; payload: HttpPayload<TT>; request: HttpRequest; subscriptions?: string[]; coalesced: CoalescedInfo }
        : TT extends { kind: 'event' }
          ? TriggerBase & { kind: 'event'; payload: { event: OnEventType } }
          : never;

// Capability-narrowed nango

// Always present: base methods every function can use.
export interface NangoBase {
    log(message: string, options?: unknown): Promise<void>;
}
// Present for connection-bound runs: the single connection the run executes against.
export interface ConnectionCapability {
    getConnection(): Promise<GetPublicConnection['Success']>;
}
/**
 * Present for connection-less runs instead of `getConnection`.
 * Resolves the connection(s) an incoming event targets before fanning out work to them.
 */
export interface ConnectionSearchCapability {
    // TODO: add searchConnections to the sdk
    searchConnections(filter: unknown): Promise<GetPublicConnection['Success'][]>;
}

/**
 * Present when `requires.outbound` is not `false`:
 * - outbound http via proxy
 * - or direct fetch via `uncontrolledFetch`.
 */
export interface ProxyCapability {
    proxy<T = unknown>(config: ProxyConfiguration): Promise<T>;
    get<T = unknown>(config: Omit<ProxyConfiguration, 'method'>): Promise<T>;
    post<T = unknown>(config: Omit<ProxyConfiguration, 'method'>): Promise<T>;
    put<T = unknown>(config: Omit<ProxyConfiguration, 'method'>): Promise<T>;
    patch<T = unknown>(config: Omit<ProxyConfiguration, 'method'>): Promise<T>;
    delete<T = unknown>(config: Omit<ProxyConfiguration, 'method'>): Promise<T>;
    paginate<T = unknown>(config: ProxyConfiguration): AsyncGenerator<T[]>;
    uncontrolledFetch(options: UncontrolledFetchOptions): Promise<Response>;
}

// Present when `data.models` is declared.
export interface RecordCapability<TModels extends Record<string, ZodModel>> {
    batchSave<K extends keyof TModels>(records: z.infer<TModels[K]>[], model: K): Promise<void>;
    batchUpdate<K extends keyof TModels>(records: z.infer<TModels[K]>[], model: K): Promise<void>;
    batchDelete<K extends keyof TModels>(records: z.infer<TModels[K]>[], model: K): Promise<void>;
    getRecordsByIds<K extends keyof TModels, TKey extends string | number = string>(ids: TKey[], model: K): Promise<Map<TKey, z.infer<TModels[K]>>>;
    listRecords<K extends keyof TModels>(model: K, options?: { cursor?: string }): AsyncGenerator<z.infer<TModels[K]>>;
    setMergingStrategy(merging: MergingStrategy, model: keyof TModels): Promise<void>;
    trackDeletesStart(model: keyof TModels): Promise<void>;
    trackDeletesEnd(model: keyof TModels): Promise<void>;
}

// Present when `data.checkpoint` is declared.
export interface CheckpointCapability<TValue> {
    getCheckpoint(): Promise<TValue | undefined>;
    saveCheckpoint(checkpoint: TValue): Promise<void>;
    clearCheckpoint(): Promise<void>;
}

// Present when `data.metadata` is declared.
export interface MetadataCapability<TValue> {
    getMetadata(): Promise<TValue>;
    setMetadata(metadata: TValue): Promise<void>;
    updateMetadata(metadata: Partial<TValue>): Promise<void>;
}
type InferInput<T> =
    T extends CreateFunctionResponse<infer _M, infer _O, infer _Me, infer _Cp, infer Tr, infer _Ac>
        ? Tr extends { kind: 'invoke'; input: infer I extends z.ZodTypeAny }
            ? z.infer<I>
            : never
        : never;
type InferOutput<T> = T extends CreateFunctionResponse<infer _M, infer O extends z.ZodTypeAny, infer _Me, infer _Cp, infer _Tr, infer _Ac> ? z.infer<O> : never;
// Present when `requires.invoke` is set: call another function and get its typed output back.
// Pass `connection` to run the invoked function against a specific connection (e.g. one found via `searchConnections`).
export interface InvokeCapability {
    invoke<T extends { type: 'function' }>(fn: T, input: InferInput<T>, connection?: { connection_id: string; integrationId: string }): Promise<InferOutput<T>>;
}

// The capability-narrowed SDK surface a function `exec` receives.
// A connection-less function (`requires.connection: false`) has no connection context,
// so it can only `searchConnections` and `invoke` other functions,
export type Nango<
    TModels extends Record<string, ZodModel>,
    TMetadata extends ZodMetadata,
    TCheckpoint extends ZodCheckpoint,
    TRequires extends Requires
> = TRequires extends { connection: false }
    ? NangoBase & ConnectionSearchCapability & (TRequires extends { invoke: true } ? InvokeCapability : unknown)
    : NangoBase &
          ConnectionCapability &
          (TRequires extends { outbound: false } ? unknown : ProxyCapability) &
          (TRequires extends { invoke: true } ? InvokeCapability : unknown) &
          ([keyof TModels] extends [never] ? unknown : RecordCapability<TModels>) &
          (TCheckpoint extends undefined ? unknown : CheckpointCapability<InferZod<TCheckpoint>>) &
          (TMetadata extends undefined ? unknown : MetadataCapability<InferZod<TMetadata>>);

// Function

// What a function requires; shapes the capability-narrowed `nango` surface.
export type Requires =
    // Connection-bound (default): `getConnection` plus, by default, proxying and invoke capabilities.
    | { connection?: true; outbound?: boolean; invoke?: boolean }
    // Connection-less: no connection context, can only `searchConnections` and `invoke`.
    | { connection: false; outbound?: false; invoke?: boolean };

// Runtime mirror of the declared capabilities, derived from `data`/`requires`.
export interface FunctionCapabilities {
    useRecords: boolean;
    useCheckpoints: boolean;
    useMetadata: boolean;
    useOutbound: boolean;
    useInvoke: boolean;
}
export interface CreateFunctionProps<
    TModels extends Record<string, ZodModel> = Record<never, ZodModel>,
    TOutput extends z.ZodTypeAny = z.ZodVoid,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined,
    TTrigger extends TriggerDefinition = TriggerDefinition,
    TRequires extends Requires = { outbound: true; connection: true }
> {
    description: string;
    // Optional output schema, typing `exec`'s return value.
    output?: TOutput;
    data?: TRequires extends { connection: false }
        ? never
        : {
              // Models the function can `batchSave` against.
              models?: TModels;
              // Connection metadata schema.
              metadata?: TMetadata;
              // Progress/resume state schema.
              checkpoint?: TCheckpoint;
          };
    // What initiates execution.
    trigger: TTrigger;
    // Opt in/out of capabilities (connection, outbound, invoke). See `Requires`.
    requires?: TRequires;
    limits?: {
        // Max concurrent runs. Pinned to `1` for schedule triggers; `'max'` allowed otherwise.
        concurrency?: TTrigger extends { kind: 'schedule' } ? 1 : ConcurrencyLimit;
    };
    // The handler. Runs on the runner with the capability-narrowed `nango` surface.
    exec: (nango: Nango<TModels, TMetadata, TCheckpoint, TRequires>, trigger: Trigger<TTrigger>) => MaybePromise<z.infer<TOutput>>;
}
export interface CreateFunctionResponse<
    TModels extends Record<string, ZodModel> = Record<never, ZodModel>,
    TOutput extends z.ZodTypeAny = z.ZodVoid,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined,
    TTrigger extends TriggerDefinition = TriggerDefinition,
    TRequires extends Requires = { outbound: true; connection: true }
> extends CreateFunctionProps<TModels, TOutput, TMetadata, TCheckpoint, TTrigger, TRequires> {
    type: 'function';
    // The capabilities derived from the function definition.
    capabilities: FunctionCapabilities;
}

/**
 * Create a function, a trigger-agnostic primitive with capabilities.
 *
 * @example
 * ```ts
 * export default createFunction({
 *     description: 'Fetch issues from GitHub',
 *     trigger: { kind: 'schedule', frequency: 'every hour' },
 *     data: { models: { GithubIssue: z.object({ id: z.string() }) } },
 *     exec: async (nango) => {
 *         await nango.batchSave([{ id: '1' }], 'GithubIssue');
 *     }
 * });
 * ```
 */
export function createFunction<
    TModels extends Record<string, ZodModel> = Record<never, ZodModel>,
    TOutput extends z.ZodTypeAny = z.ZodVoid,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined,
    TTrigger extends TriggerDefinition = TriggerDefinition,
    TRequires extends Requires = { outbound: true; connection: true }
>(
    params: CreateFunctionProps<TModels, TOutput, TMetadata, TCheckpoint, TTrigger, TRequires>
): CreateFunctionResponse<TModels, TOutput, TMetadata, TCheckpoint, TTrigger, TRequires> {
    const models = params.data?.models;
    // A connection-less function has no connection to proxy through, so outbound is always off.
    const connectionLess = params.requires?.connection === false;
    const capabilities: FunctionCapabilities = {
        useRecords: !!models && Object.keys(models).length > 0,
        useCheckpoints: !!params.data?.checkpoint,
        useMetadata: !!params.data?.metadata,
        useOutbound: !connectionLess && params.requires?.outbound !== false,
        useInvoke: params.requires?.invoke === true
    };
    return { type: 'function', ...params, capabilities };
}
