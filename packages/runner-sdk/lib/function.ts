import type { ProxyConfiguration } from './action.js';
import type { ZodCheckpoint, ZodMetadata, ZodModel } from './types.js';
import type { UncontrolledFetchOptions } from './uncontrolledFetch.js';
import type {
    AllAuthCredentials,
    EnvironmentVariable,
    FunctionCapabilities,
    FunctionConcurrencyLimit,
    FunctionRequires,
    FunctionTriggerDefinition,
    GetPublicConnection,
    GetPublicIntegration,
    MaybePromise,
    MergingStrategy,
    SdkLogger,
    Trigger
} from '@nangohq/types';
import type * as z from 'zod';

export type {
    CoalescedInfo,
    DebounceKeySource,
    DebounceOptions,
    EventTrigger,
    FunctionRequires,
    FunctionTriggerDefinition,
    HttpRequest,
    HttpTrigger,
    InvokeTrigger,
    ScheduleTrigger,
    Trigger
} from '@nangohq/types';

type InferZod<T> = T extends z.ZodTypeAny ? z.infer<T> : never;

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
    TRequires extends FunctionRequires
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

export interface CreateFunctionProps<
    TModels extends Record<string, ZodModel> = Record<never, ZodModel>,
    TInput extends z.ZodTypeAny = z.ZodVoid,
    TOutput extends z.ZodTypeAny = z.ZodVoid,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined,
    TTrigger extends FunctionTriggerDefinition | undefined = undefined,
    TRequires extends FunctionRequires = { outbound: true; connection: true }
> {
    description: string;
    // Optional input schema: the invoke call argument and/or the http request body. Omit when there is no input.
    // schedule or event triggers have no input
    input?: TTrigger extends { kind: 'schedule' } | { kind: 'event' } ? never : TInput;
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
    // Opt in/out of capabilities (connection, outbound, invoke). See `FunctionRequires`.
    requires?: TRequires;
    limits?: {
        concurrency?: {
            // Max concurrent runs for a single connection. Pinned to `1` for schedule triggers.
            perConnection?: TTrigger extends { kind: 'schedule' } ? 1 : FunctionConcurrencyLimit;
        };
    };
    // The handler. Runs on the runner with the capability-narrowed `nango` surface.
    exec: (nango: Nango<TModels, TMetadata, TCheckpoint, TRequires>, trigger: Trigger<TTrigger, z.infer<TInput>>) => MaybePromise<z.infer<TOutput>>;
}
export interface CreateFunctionResponse<
    TModels extends Record<string, ZodModel> = Record<never, ZodModel>,
    TInput extends z.ZodTypeAny = z.ZodVoid,
    TOutput extends z.ZodTypeAny = z.ZodVoid,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined,
    TTrigger extends FunctionTriggerDefinition | undefined = undefined,
    TRequires extends FunctionRequires = { outbound: true; connection: true }
> extends CreateFunctionProps<TModels, TInput, TOutput, TMetadata, TCheckpoint, TTrigger, TRequires> {
    type: 'function';
    // The capabilities derived from the function definition.
    capabilities: FunctionCapabilities;
}

/**
 * Create a function, a trigger-agnostic primitive with capabilities.
 *
 * @experimental **Not production ready.**
 * The function primitive is under active development.
 * Its API may change or be removed without notice, do NOT USE it in production integrations.
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
    TTrigger extends FunctionTriggerDefinition | undefined = undefined,
    TRequires extends FunctionRequires = { outbound: true; connection: true }
>(
    params: CreateFunctionProps<TModels, TInput, TOutput, TMetadata, TCheckpoint, TTrigger, TRequires>
): CreateFunctionResponse<TModels, TInput, TOutput, TMetadata, TCheckpoint, TTrigger, TRequires> {
    return { type: 'function', ...params, capabilities: deriveFunctionCapabilities(params) };
}

// Derives the runtime capabilities from function definition
export function deriveFunctionCapabilities(params: {
    data?: { models?: Record<string, ZodModel>; metadata?: ZodMetadata; checkpoint?: ZodCheckpoint } | undefined;
    requires?: FunctionRequires | undefined;
}): FunctionCapabilities {
    const models = params.data?.models;
    // A connection-less function has no connection to proxy through, so outbound is always off.
    const connectionLess = params.requires?.connection === false;
    return {
        usesRecords: !!models && Object.keys(models).length > 0,
        usesCheckpoints: !!params.data?.checkpoint,
        usesMetadata: !!params.data?.metadata,
        usesOutbound: !connectionLess && params.requires?.outbound !== false,
        usesInvoke: params.requires?.invoke === true
    };
}
