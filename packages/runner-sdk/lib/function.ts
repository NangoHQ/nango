import type { ProxyConfiguration } from './action.js';
import type { ZodCheckpoint, ZodMetadata, ZodModel } from './types.js';
import type { UncontrolledFetchOptions } from './uncontrolledFetch.js';
import type {
    AllAuthCredentials,
    EnvironmentVariable,
    GetPublicConnection,
    GetPublicIntegration,
    HTTP_METHOD,
    MaybePromise,
    MergingStrategy,
    OnEventType,
    SdkLogger
} from '@nangohq/types';
import type * as z from 'zod';

type InferZod<T> = T extends z.ZodTypeAny ? z.infer<T> : never;

// Limits

// Max concurrent runs for a single connection: `1` serializes, `'max'` lets them overlap.
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
 * A trigger declares how a function is initiated FROM OUTSIDE; the `kind` discriminates what initiates execution.
 * - `schedule`: a periodic schedule
 * - `http`: an incoming http call or webhook request
 * - `event`: an internal Nango lifecycle event
 */
export type TriggerDefinition =
    | { kind: 'schedule'; frequency: string; autoStart?: boolean }
    | { kind: 'http'; subscriptions?: string[]; debounce?: DebounceOptions }
    | { kind: 'event'; events: OnEventType[] };

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

// `debounce.take: 'all'` delivers the whole coalesced batch, so the payload becomes an array; otherwise a single input.
type HttpPayload<TT, TInput extends z.ZodTypeAny> = TT extends { debounce: { take: 'all' } } ? z.infer<TInput>[] : z.infer<TInput>;

interface TriggerBase {
    /**
     * Present when the run carries connection context (invoke calls may pass one;
     * http/event may resolve one). Undefined for connection-less runs.
     */
    connection?: { connection_id: string; integrationId: string };
}

// The per-kind runtime trigger shapes an `exec` can receive.
export type InvokeTrigger<TInput extends z.ZodTypeAny> = TriggerBase & { kind: 'invoke'; input: z.infer<TInput> };
export type ScheduleTrigger = TriggerBase & { kind: 'schedule'; input: null };
export type HttpTrigger<TT, TInput extends z.ZodTypeAny> = TriggerBase & {
    kind: 'http';
    input: HttpPayload<TT, TInput>;
    request: HttpRequest;
    subscriptions?: string[];
    coalesced: CoalescedInfo;
};
export type EventTrigger = TriggerBase & { kind: 'event'; input: { event: OnEventType } };

/**
 * The runtime trigger a function `exec` receives. Any function can be invoked by another, but an
 * invoke reuses the declared trigger's shape rather than adding a separate arrival — so `exec` only
 * ever sees its declared kind and never has to discriminate. On the invoke path the runtime
 * synthesizes the envelope (e.g. an http `request`/`coalesced` derived from the invoked input).
 * A function with no declared trigger is invoke-only and receives `InvokeTrigger`.
 */
export type Trigger<TT extends TriggerDefinition | undefined, TInput extends z.ZodTypeAny> = TT extends { kind: 'schedule' }
    ? ScheduleTrigger
    : TT extends { kind: 'http' }
      ? HttpTrigger<TT, TInput>
      : TT extends { kind: 'event' }
        ? EventTrigger
        : InvokeTrigger<TInput>;

// Capability-narrowed nango

// Always present: base methods every function can use.
export interface NangoBase {
    log(message: string, options?: unknown): Promise<void>;
    setLogger(logger: SdkLogger): void;
    getEnvironmentVariables(): Promise<EnvironmentVariable[] | null>;
}
// Present for connection-bound runs: the single connection the run executes against.
export interface ConnectionCapability {
    getConnection(): Promise<GetPublicConnection['Success']>;
    getToken(): Promise<string | AllAuthCredentials>;
    getIntegration(queries?: GetPublicIntegration['Querystring']): Promise<GetPublicIntegration['Success']['data']>;
    getVariant(): string;
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
    T extends CreateFunctionResponse<infer _M, infer I extends z.ZodTypeAny, infer _O, infer _Me, infer _Cp, infer _Tr, infer _R> ? z.infer<I> : void;
type InferOutput<T> =
    T extends CreateFunctionResponse<infer _M, infer _I, infer O extends z.ZodTypeAny, infer _Me, infer _Cp, infer _Tr, infer _R> ? z.infer<O> : void;

// Any function can be invoked. Input/output live on the function itself, not the trigger.
type InvokeConnection = { connection_id: string; integrationId: string };
type InvokeTarget = { type: 'function'; capabilities: FunctionCapabilities };
// `invoke` options: `input` is required when the target declares one, and the whole object is optional when it declares none.
type InvokeArgs<T> = [InferInput<T>] extends [void]
    ? [options?: { connection?: InvokeConnection }]
    : [options: { input: InferInput<T>; connection?: InvokeConnection }];
// Present when `requires.invoke` is set: call another function and get its typed output back.
export interface InvokeCapability {
    invoke<T extends InvokeTarget>(fn: T, ...args: InvokeArgs<T>): Promise<InferOutput<T>>;
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
    TInput extends z.ZodTypeAny = z.ZodVoid,
    TOutput extends z.ZodTypeAny = z.ZodVoid,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined,
    TTrigger extends TriggerDefinition | undefined = undefined,
    TRequires extends Requires = { outbound: true; connection: true }
> {
    description: string;
    // Optional input schema: the invoke call argument and/or the http request body. Omit when there is no input.
    input?: TInput;
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
    // How the function is initiated from outside. Omit for an invoke-only helper.
    trigger?: TTrigger;
    // Opt in/out of capabilities (connection, outbound, invoke). See `Requires`.
    requires?: TRequires;
    limits?: {
        concurrency?: {
            // Max concurrent runs for a single connection. Pinned to `1` for schedule triggers.
            perConnection?: TTrigger extends { kind: 'schedule' } ? 1 : ConcurrencyLimit;
        };
    };
    // The handler. Runs on the runner with the capability-narrowed `nango` surface.
    exec: (nango: Nango<TModels, TMetadata, TCheckpoint, TRequires>, trigger: Trigger<TTrigger, TInput>) => MaybePromise<z.infer<TOutput>>;
}
export interface CreateFunctionResponse<
    TModels extends Record<string, ZodModel> = Record<never, ZodModel>,
    TInput extends z.ZodTypeAny = z.ZodVoid,
    TOutput extends z.ZodTypeAny = z.ZodVoid,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined,
    TTrigger extends TriggerDefinition | undefined = undefined,
    TRequires extends Requires = { outbound: true; connection: true }
> extends CreateFunctionProps<TModels, TInput, TOutput, TMetadata, TCheckpoint, TTrigger, TRequires> {
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
    TInput extends z.ZodTypeAny = z.ZodVoid,
    TOutput extends z.ZodTypeAny = z.ZodVoid,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined,
    TTrigger extends TriggerDefinition | undefined = undefined,
    TRequires extends Requires = { outbound: true; connection: true }
>(
    params: CreateFunctionProps<TModels, TInput, TOutput, TMetadata, TCheckpoint, TTrigger, TRequires>
): CreateFunctionResponse<TModels, TInput, TOutput, TMetadata, TCheckpoint, TTrigger, TRequires> {
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
