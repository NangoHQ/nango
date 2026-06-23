import type { NangoActionBase } from './action.js';
import type { NangoSyncBase } from './sync.js';
import type { ZodCheckpoint, ZodMetadata, ZodModel } from './types.js';
import type { HTTP_METHOD, NangoSyncEndpointV2 } from '@nangohq/types';
import type { MaybePromise } from 'rollup';
import type * as z from 'zod';

export type CreateAnyResponse =
    | CreateSyncResponse<any, ZodMetadata, ZodCheckpoint>
    | CreateActionResponse<any, any, ZodMetadata, ZodCheckpoint>
    | CreateOnEventResponse<ZodMetadata, ZodCheckpoint>
    | CreateFunctionResponse<any, any, any, ZodMetadata, ZodCheckpoint>;

export type { ActionError } from './errors.js';
export type { NangoActionBase as NangoAction, ProxyConfiguration } from './action.js';
export type { NangoSyncBase as NangoSync } from './sync.js';

// ----- Sync
export interface CreateSyncProps<TModels extends Record<string, ZodModel>, TMetadata extends ZodMetadata = never, TCheckpoint extends ZodCheckpoint = never> {
    /**
     * The version of the sync.
     * Use it to track changes to the sync inside Nango's UI.
     *
     * @default '0.0.1'
     * @example '1.0.0'
     */
    version?: string;

    /**
     * The description of the sync.
     *
     * @example 'Fetch issues from GitHub'
     */
    description: string;

    /**
     * The endpoints of the sync.
     * You can call this endpoint to fetch records synced by the sync.
     * You need one endpoint per model.
     *
     * @deprecated Endpoints are no longer required. This field will be removed in a future version.
     * @example
     * ```ts
     * endpoints: [{ method: 'GET', path: '/github/issues' }],
     * ```
     * ```ts
     * const res = await fetch('https://api.nango.dev/github/issues');
     * ```
     */
    endpoints?: NangoSyncEndpointV2[];

    /**
     * The frequency of the sync.
     *
     * @minimum 30 seconds
     * @maximum 31 days
     * @example 'every hour'
     */
    frequency: string;

    /**
     * The models that will be synced by this script.
     * You need one endpoint per model.
     *
     * @example
     * ```ts
     * models: {
     *     GithubIssue: z.object({
     *         id: z.string(),
     *     }),
     * },
     */
    models: TModels;

    /**
     * The type of the sync.
     * @deprecated This option will be removed in future versions.
     */
    syncType?: 'full' | 'incremental';

    /**
     * If `true`, automatically detects deleted records and removes them when you fetch the latest data.
     *
     * @deprecated This option will be removed in future versions. Please automatically detect deletions by calling `nango.trackDeletesStart()` and `nango.trackDeletesEnd()` in your sync function.
     * @default false
     */
    trackDeletes?: boolean;

    /**
     * If `true`, automatically runs the sync when a new connection is created.
     * Otherwise, it needs to be triggered via the API or Nango UI.
     *
     * @default true
     */
    autoStart?: boolean;

    /**
     * The integration's scopes required by the action.
     * This field is for documentation purposes only and currently not enforced by Nango.
     *
     * @example
     * ```ts
     * scopes: ['read:user', 'write:user'],
     * ```
     */
    scopes?: string[];

    /**
     * The connection's metadata of the action.
     *
     * @default z.void();
     * @example
     * ```ts
     * metadata: z.object({
     *     userId: z.string(),
     * });
     * ```
     */
    metadata?: TMetadata;

    /**
     * The checkpoint schema for storing sync progress and resume state.
     * Checkpoint must be an object with string, number or boolean values.
     * Nested objects or arrays are not supported.
     *
     * @example
     * ```ts
     * checkpoint: z.object({
     *     lastPage: z.number(),
     *     cursor: z.string(),
     * });
     * ```
     */
    checkpoint?: TCheckpoint;

    /**
     * The webhook subscriptions of the sync.
     * Specify the types of webhooks the method `onWebhook` will handle.
     * If a webhook type is not on the list, it will not be handled.
     *
     * @default 'undefined'
     * @example
     * ```ts
     * webhookSubscriptions: ['*'],
     * ```
     */
    webhookSubscriptions?: string[];

    /**
     * The function that will be called when the sync is triggered.
     *
     * @example
     * ```ts
     * exec: (nango) => MaybePromise<void> {
     *  await nango.log('Hello, world!');
     * }
     * ```
     */
    exec: (nango: NangoSyncBase<TModels, TMetadata, TCheckpoint>) => MaybePromise<void>;

    /**
     * The function that will be called when a webhook is received.
     *
     * @example
     * ```ts
     * onWebhook: (nango, payload) => MaybePromise<void> {
     *  await nango.log('Hello, world!', payload);
     * }
     * ```
     */
    onWebhook?: (nango: NangoSyncBase<TModels, TMetadata, TCheckpoint>, payload: any) => MaybePromise<void>;
}
export interface CreateSyncResponse<
    TModels extends Record<string, ZodModel>,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined
> extends CreateSyncProps<TModels, TMetadata, TCheckpoint> {
    type: 'sync';
}
/**
 * Create a sync script
 *
 * @example
 * ```ts
 * const sync = createSync({
 *     description: 'Fetch issues from GitHub',
 *     endpoints: [{ method: 'GET', path: '/github/issues' }],
 *     frequency: 'every hour',
 *     exec: async (nango) => {
 *         await nango.log('Hello, world!');
 *     }
 * });
 *
 * export default sync;
 * ```
 */
export function createSync<TModels extends Record<string, ZodModel>, TMetadata extends ZodMetadata = undefined, TCheckpoint extends ZodCheckpoint = undefined>(
    params: CreateSyncProps<TModels, TMetadata, TCheckpoint>
): CreateSyncResponse<TModels, TMetadata, TCheckpoint> {
    return { type: 'sync', ...params };
}

// ----- Action
export interface CreateActionProps<
    TInput extends z.ZodTypeAny,
    TOutput extends z.ZodTypeAny,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined
> {
    /**
     * The version of the action.
     * Use it to track changes to the action inside Nango's UI.
     *
     * @default '0.0.1'
     * @example '1.0.0'
     */
    version?: string;

    /**
     * The description of the action.
     *
     * @example 'Create a new issue in GitHub'
     */
    description: string;

    /**
     * The endpoint of the action.
     * You can call this endpoint to trigger the action.
     *
     * @deprecated Endpoints are no longer required. This field will be removed in a future version.
     * @example
     * ```ts
     * endpoint: { method: 'POST', path: '/github/issues' },
     * ```
     * ```ts
     * const res = await fetch('https://api.nango.dev/github/issues', {
     *     method: 'POST',
     *     body: JSON.stringify({
     *         title: 'New Issue',
     *     })
     * });
     * ```
     */
    endpoint?: NangoSyncEndpointV2;

    /**
     * The input required by the action when triggering it.
     *
     * @example
     * ```ts
     * input: z.object({
     *     title: z.string(),
     * });
     * ```
     */
    input: TInput;

    /**
     * The output of the action.
     *
     * @example
     * ```ts
     * output: z.object({
     *     issueId: z.string(),
     * });
     * ```
     */
    output: TOutput;

    /**
     * The connection's metadata of the action.
     *
     * @default z.void();
     *
     * @example
     * ```ts
     * metadata: z.object({
     *     userId: z.string(),
     * });
     * ```
     */
    metadata?: TMetadata;

    /**
     * The checkpoint schema for storing action progress and resume state.
     * Checkpoint must be an object with string, number or boolean values.
     * Nested objects or arrays are not supported.
     *
     * @example
     * ```ts
     * checkpoint: z.object({
     *     lastPage: z.number(),
     *     cursor: z.string(),
     * });
     * ```
     */
    checkpoint?: TCheckpoint;

    /**
     * The integration's scopes required by the action.
     * This field is for documentation purposes only and currently not enforced by Nango.
     *
     * @example
     * ```ts
     * scopes: ['read:user', 'write:user'],
     * ```
     */
    scopes?: string[];

    /**
     * The function that will be called when the action is triggered.
     * @example
     * ```ts
     * exec: async (nango, input) => {
     *  await nango.log('Hello, world!', input);
     * }
     * ```
     */
    exec: (nango: NangoActionBase<TMetadata, TCheckpoint>, input: z.infer<TInput>) => MaybePromise<z.infer<TOutput>>;
}
export interface CreateActionResponse<
    TInput extends z.ZodTypeAny,
    TOutput extends z.ZodTypeAny,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined
> extends CreateActionProps<TInput, TOutput, TMetadata, TCheckpoint> {
    type: 'action';
}
/**
 * Create an action script
 *
 * @example
 * ```ts
 * const action = createAction({
 *     description: 'Create a new issue in GitHub',
 *     endpoint: { method: 'POST', path: '/github/issues' },
 *     input: z.object({
 *         title: z.string(),
 *     }),
 *     output: z.object({
 *         issueId: z.string(),
 *     }),
 *     exec: async (nango, input) => {
 *         await nango.log('Hello, world!', input);
 *     }
 * });
 * export default action;
 * ```
 */
export function createAction<
    TInput extends z.ZodTypeAny,
    TOutput extends z.ZodTypeAny,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined
>(params: CreateActionProps<TInput, TOutput, TMetadata, TCheckpoint>): CreateActionResponse<TInput, TOutput, TMetadata, TCheckpoint> {
    return { type: 'action', ...params };
}

// ----- On Event
export interface CreateOnEventProps<TMetadata extends ZodMetadata = undefined, TCheckpoint extends ZodCheckpoint = undefined> {
    /**
     * The version of the onEvent script.
     * Use it to track changes to the onEvent script inside Nango's UI.
     *
     * @default '0.0.1'
     * @example '1.0.0'
     */
    version?: string;

    /**
     * The description of the onEvent script.
     *
     * @example 'Fetch id from GitHub'
     */
    description: string;

    /**
     * The event that will trigger this script.
     */
    event: 'post-connection-creation' | 'pre-connection-deletion' | 'validate-connection';

    /**
     * The connection's metadata of the script.
     *
     * @default z.void();
     * @example
     * ```ts
     * metadata: z.object({
     *     userId: z.string(),
     * });
     * ```
     */
    metadata?: TMetadata;

    /**
     * The checkpoint schema for storing OnEvent script progress and resume state.
     * Checkpoint must be an object with string, number or boolean values.
     * Nested objects or arrays are not supported.
     *
     * @example
     * ```ts
     * checkpoint: z.object({
     *     lastPage: z.number(),
     *     cursor: z.string(),
     * });
     * ```
     */
    checkpoint?: TCheckpoint;

    /**
     * The function that will be called when the onEvent script is triggered.
     * @example
     * ```ts
     * exec: async (nango) => {
     *  await nango.log('Hello, world!');
     * }
     * ```
     */
    exec: (nango: NangoActionBase<TMetadata, TCheckpoint>) => MaybePromise<void>;
}
export interface CreateOnEventResponse<TMetadata extends ZodMetadata = undefined, TCheckpoint extends ZodCheckpoint = undefined>
    extends CreateOnEventProps<TMetadata, TCheckpoint> {
    type: 'onEvent';
}
/**
 * Create an onEvent script
 */
export function createOnEvent<TMetadata extends ZodMetadata = undefined, TCheckpoint extends ZodCheckpoint = undefined>(
    params: CreateOnEventProps<TMetadata, TCheckpoint>
): CreateOnEventResponse<TMetadata, TCheckpoint> {
    return { type: 'onEvent', ...params };
}

// ----- Function / Webhook
//
// A `function` is a trigger-agnostic primitive: it separates the trigger (what initiates
// execution) from the handler (what runs). Webhooks are the first trigger type.
// `createWebhook()` is syntactic sugar for a function with a single implicit `http` trigger.
// Syncs and actions will eventually be merged into functions.

/**
 * The kind of declared trigger that initiated a function run.
 * - `http`: an incoming http call or webhook request
 * - `schedule`: a periodic schedule
 * - `event`: an internal Nango event
 *
 * On-demand invocation (`nango.triggerFunction()`, the REST API, the CLI, or the UI) is always
 * available regardless of the declared trigger — it is not a trigger kind.
 */
export type TriggerKind = 'http' | 'schedule' | 'event';

/**
 * Declares where the debounce/coalescing key is extracted from.
 * - `{ body: '$.portalId' }` — dot-notation path into the normalized body
 * - `{ header: 'x-goog-resource-id' }` — flat, case-insensitive header lookup
 */
export type DebounceKeySource = { body: string } | { header: string };

/**
 * Coalesces multiple inbound events into a single function run within a sliding window.
 */
export interface DebounceOptions {
    /**
     * One source, or an array of sources combined into a composite key (e.g. an object id plus an
     * event type). Events sharing the same resolved key coalesce together.
     */
    key?: DebounceKeySource | DebounceKeySource[];
    /** Sliding window in milliseconds. */
    windowMs: number;
    /** Hard ceiling for the window regardless of incoming events. */
    maxWindowMs?: number;
    /** When exceeded, the window stops sliding and `event.coalesced.overflowed` is set. */
    maxEntities?: number;
    /**
     * Whether the handler receives only the latest payload or every coalesced payload.
     */
    payloadMode?: 'latest' | 'all';
}

/** Read-only request view passed to ingress hooks. No SDK, no I/O, hard timeout. */
export interface IngressEvent {
    rawBody: string;
    headers: Record<string, string>;
    query: Record<string, string | string[] | undefined>;
}

/** A response that short-circuits the HTTP exchange at ingress (e.g. a provider handshake). */
export interface IngressResponse {
    status?: number;
    body?: unknown;
    headers?: Record<string, string>;
}

/**
 * Runs synchronously at ingress before the event is enqueued. No SDK, no I/O, hard timeout.
 * Each interceptor can:
 * - return an `IngressResponse` to short-circuit the HTTP exchange (e.g. a provider handshake),
 * - throw to reject the request (responds 401),
 * - return `undefined` to fall through (and ultimately run the function).
 *
 * @internal Interceptors run inline on Nango's ingress servers, so they are never author-supplied.
 * Nango injects them from the declarative `IngressConfig` on the trigger (see `createWebhook`).
 */
export type HttpInterceptor = (event: IngressEvent) => MaybePromise<IngressResponse | undefined | void>;

/**
 * A secret resolved by Nango at ingress. Authors reference it by key; the value never appears in
 * the function source. Only the integration config is supported for now.
 */
export interface IngressSecretRef {
    source: 'integrationConfig';
    /** Key within the integration config holding the secret value. */
    key: string;
}

/**
 * HMAC signature validation. Nango computes `HMAC(rawBody, secret)` and timing-safe compares it
 * against the value in `header`.
 */
export interface HmacValidation {
    type: 'hmac';
    algorithm: 'sha1' | 'sha256' | 'sha512';
    /** Header carrying the provider signature (case-insensitive). */
    header: string;
    /** Encoding of the signature in the header. */
    encoding: 'base64' | 'hex';
    /** Prefix stripped from the header value before comparison (e.g. `'sha256='`). */
    prefix?: string;
    secret: IngressSecretRef;
}

/**
 * How an inbound request is authenticated at ingress. Discriminated on `type`; today only `'hmac'`
 * exists, with `'svix'` / `'token'` / asymmetric schemes to follow as the declarative surface
 * grows to replace Nango's built-in provider routers.
 */
export type IngressValidation = HmacValidation;

/** Where a value is read from on the inbound request. */
export interface IngressValueSource {
    in: 'query' | 'body' | 'header';
    key: string;
}

/**
 * Endpoint-verification handshake. Nango echoes the challenge token back so the provider can
 * confirm the endpoint.
 */
export interface EchoChallenge {
    type: 'echo';
    /** Where the challenge token arrives. For `body`, `key` is a dot-notation path. */
    token: IngressValueSource;
    /** Optional shared-secret check (e.g. a verify token) performed before echoing. */
    verify?: IngressValueSource & { secret: IngressSecretRef };
    /** How to respond. Defaults to status 200, `text/plain`. */
    respond?: { status?: number; contentType?: 'text/plain' | 'application/json' };
}

/** How an endpoint-verification handshake is answered. Discriminated on `type`. */
export type IngressChallenge = EchoChallenge;

/**
 * Declarative ingress checks for an http trigger. Authors *select* validation/challenge behaviour;
 * Nango injects and runs the implementation at ingress (see `HttpInterceptor`). No author code runs
 * inline on Nango's servers. For known providers `createWebhook` fills this in automatically.
 */
export interface IngressConfig {
    validation?: IngressValidation;
    challenge?: IngressChallenge;
}

/** Fields shared by every declared trigger. */
interface TriggerDefinitionBase {
    /**
     * For http triggers maps to the webhook URL path segment (defaults to the file basename).
     * Surfaced on the runtime trigger.
     */
    name?: string;
}
export interface HttpTriggerDefinition extends TriggerDefinitionBase {
    kind: 'http';
    /** Declarative ingress validation/challenge. Nango runs the implementation at ingress. */
    ingress?: IngressConfig;
    /** Coalesces a burst of inbound webhook events into a single run within a sliding window. */
    debounce?: DebounceOptions;
}
export interface ScheduleTriggerDefinition extends TriggerDefinitionBase {
    kind: 'schedule';
    /** e.g. 'every hour', 'every 2 minutes'. */
    schedule: string;
}
export interface EventTriggerDefinition extends TriggerDefinitionBase {
    kind: 'event';
    event: string;
}
/** What a function declares as its trigger. A function has exactly one. */
export type TriggerDefinition = HttpTriggerDefinition | ScheduleTriggerDefinition | EventTriggerDefinition;

/** Coalescing summary, present on an http trigger when `debounce` is configured and coalescing happened. */
export interface CoalescedInfo {
    count: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    overflowed: boolean;
}

/** Fields shared by every runtime trigger a function `exec` receives. */
interface TriggerBase {
    /** The name of the trigger that fired, when declared. */
    name?: string;
    /**
     * Pre-populated when the run was started with connection context (connection-level URL,
     * `triggerFunction({ connectionId })`, or CLI `--connection`). Undefined for connection-less runs.
     */
    connection?: { connection_id: string; provider_config_key: string };
}

/**
 * The inbound http request that initiated the run. `body` is typed as the function's `input` schema
 * when declared, otherwise `unknown`.
 */
export interface HttpRequest<TBody = unknown> {
    method: HTTP_METHOD;
    path: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    body: TBody;
}

/**
 * Runtime trigger for an `http` definition (an incoming http call or webhook request). The payload
 * lives on `request.body`.
 */
export interface HttpTrigger<TPayload = unknown> extends TriggerBase {
    kind: 'http';
    request: HttpRequest<TPayload>;
    /**
     * Coalescing summary when the http trigger's `debounce` is configured and a burst was coalesced
     * into this run. Undefined for single, non-coalesced runs.
     */
    coalesced?: CoalescedInfo;
}

/** Runtime trigger for a `schedule` definition. */
export interface ScheduleTrigger<TPayload = unknown> extends TriggerBase {
    kind: 'schedule';
    /** The payload that initiated the run. Typed as the function's `input` schema when declared. */
    payload: TPayload;
    /** The cadence the trigger was declared with (e.g. 'every hour'), exposed read-only. */
    schedule?: string;
}

/** Runtime trigger for an `event` definition (an internal Nango event). */
export interface EventTrigger<TPayload = unknown> extends TriggerBase {
    kind: 'event';
    /** The payload that initiated the run. Typed as the function's `input` schema when declared. */
    payload: TPayload;
}

/**
 * The runtime trigger a function `exec` receives, mapped from the declared `TriggerDefinition` so the
 * handler gets exactly that kind's shape (keyed by `trigger.kind`). Conditional types distribute, so
 * bare `Trigger` resolves to the full union. Distinct from `(nango, input)` for actions — functions
 * are trigger-driven, so the second argument describes the trigger and its payload.
 */
export type Trigger<TDef extends TriggerDefinition = TriggerDefinition, TPayload = unknown> = TDef extends { kind: 'http' }
    ? HttpTrigger<TPayload>
    : TDef extends { kind: 'schedule' }
      ? ScheduleTrigger<TPayload>
      : TDef extends { kind: 'event' }
        ? EventTrigger<TPayload>
        : never;

export interface CreateFunctionProps<
    TModels extends Record<string, ZodModel>,
    TInput extends z.ZodTypeAny = z.ZodUnknown,
    TOutput extends z.ZodTypeAny = z.ZodTypeAny,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined,
    TTrigger extends TriggerDefinition = TriggerDefinition
> {
    /**
     * The version of the function. Use it to track changes inside Nango's UI.
     * Supports semver (e.g. `'1.0.0'`)
     * If omitted, Nango auto-manages it: `1` on first deploy, and auto-increments for subsequent deploys.
     */
    version?: string;

    /** The description of the function. */
    description?: string;

    /**
     * What initiates execution. A function declares exactly one trigger. Any function can also be
     * started on-demand via `nango.triggerFunction()` or the API regardless of the declared trigger.
     */
    trigger: TTrigger;

    /** Optional input schema. When set, it types the trigger payload and is used for API invocation. */
    input?: TInput;

    /**
     * Optional output schema, typing `exec`'s return value. The return value is surfaced to
     * on-demand callers (`triggerFunction()`, the API). Trigger-driven runs (http, schedule,
     * event) are fire-and-forget and discard it.
     */
    output?: TOutput;

    scopes?: string[];

    /** Schemas the function operates on. */
    data?: {
        /** Models the function can `batchSave`/`batchUpdate`/`batchDelete` against. */
        models?: TModels;
        metadata?: TMetadata;
        checkpoint?: TCheckpoint;
    };

    /**
     * The handler. Runs on the customer runner with full SDK access. The `trigger` argument is typed
     * to the declared trigger's kind.
     * @example
     * ```ts
     * exec: async (nango, trigger) => {
     *   const connections = await nango.searchConnections({ tags: { portalId: trigger.request.body.portalId } });
     *   for (const connection of connections) {
     *     await nango.triggerSync(connection.provider_config_key, connection.connection_id, 'contacts');
     *   }
     * }
     * ```
     */
    exec: (nango: NangoSyncBase<TModels, TMetadata, TCheckpoint>, trigger: Trigger<TTrigger, z.infer<TInput>>) => MaybePromise<z.infer<TOutput>>;
}

export interface CreateFunctionResponse<
    TModels extends Record<string, ZodModel>,
    TInput extends z.ZodTypeAny = z.ZodUnknown,
    TOutput extends z.ZodTypeAny = z.ZodTypeAny,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined,
    TTrigger extends TriggerDefinition = TriggerDefinition
> extends CreateFunctionProps<TModels, TInput, TOutput, TMetadata, TCheckpoint, TTrigger> {
    type: 'function';
    /** Set when authored via `createWebhook()`; mirrors the http trigger name. */
    name?: string;
}

/**
 * Create a function — the trigger-agnostic primitive.
 *
 * Use this directly for a schedule or event trigger. For a webhook, prefer the `createWebhook()` sugar.
 *
 * @internal Not part of the public authoring surface yet — the spec is still in flux, so
 * `createWebhook` is the only exposed function primitive (it is not re-exported by the CLI nor
 * accepted by the compiler). See NAN-5943.
 *
 * @example
 * ```ts
 * export default createFunction({
 *     trigger: { kind: 'schedule', schedule: 'every hour' },
 *     exec: async (nango, trigger) => { ... }
 * });
 * ```
 */
export function createFunction<
    // Default to an empty model map (not `Record<string, ZodModel>`) so that when `models` is
    // omitted `keyof TModels` is `never`, keeping `batchSave`/`batchUpdate`/`batchDelete` model
    // names type-checked against the declared models instead of accepting any string.
    TModels extends Record<string, ZodModel> = Record<never, ZodModel>,
    TInput extends z.ZodTypeAny = z.ZodUnknown,
    TOutput extends z.ZodTypeAny = z.ZodTypeAny,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined,
    TTrigger extends TriggerDefinition = TriggerDefinition
>(
    params: CreateFunctionProps<TModels, TInput, TOutput, TMetadata, TCheckpoint, TTrigger>
): CreateFunctionResponse<TModels, TInput, TOutput, TMetadata, TCheckpoint, TTrigger> {
    return { type: 'function', ...params };
}

export interface CreateWebhookProps<
    TModels extends Record<string, ZodModel>,
    // Webhook runs are fire-and-forget, the return value is discarded. Default the output to
    // `void`. Authors who need a typed return for on-demand invocation opt in via `output`.
    TOutput extends z.ZodTypeAny = z.ZodVoid,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined
> {
    /** Maps to the webhook URL path segment. Defaults to the file basename. */
    name?: string;
    version?: string;
    description?: string;
    /** Declarative ingress validation/challenge. Nango runs the implementation at ingress. */
    ingress?: IngressConfig;
    /** Coalesces a burst of inbound webhook events into a single run within a sliding window. */
    debounce?: DebounceOptions;
    output?: TOutput;
    /** Schemas the function operates on. */
    data?: {
        /** Models the function can `batchSave`/`batchUpdate`/`batchDelete` against. */
        models?: TModels;
        metadata?: TMetadata;
        checkpoint?: TCheckpoint;
    };
    exec: (nango: NangoSyncBase<TModels, TMetadata, TCheckpoint>, trigger: HttpTrigger) => MaybePromise<z.infer<TOutput>>;
}

/**
 * Create a webhook handler — sugar for a function with a single implicit `http` trigger.
 *
 * Routing lives entirely in `exec` (customer-owned, runs on your runner). Provider protocol
 * mechanics (signature verification, handshake) are declared in `ingress` and run by Nango at
 * ingress — authors select a scheme, they do not write the verification code.
 *
 * @example
 * ```ts
 * export default createWebhook({
 *     name: 'contacts-updated',
 *     ingress: {
 *         validation: { type: 'hmac', algorithm: 'sha256', header: 'x-signature', encoding: 'hex', secret: { source: 'integrationConfig', key: 'webhookSecret' } }
 *     },
 *     debounce: { key: { body: '$.portalId' }, windowMs: 5000 },
 *     exec: async (nango, trigger) => {
 *         const connections = await nango.searchConnections({ tags: { portalId: trigger.request.body.portalId } });
 *         for (const connection of connections) {
 *             await nango.triggerSync(connection.provider_config_key, connection.connection_id, 'contacts');
 *         }
 *     }
 * });
 * ```
 */
export function createWebhook<
    TModels extends Record<string, ZodModel> = Record<never, ZodModel>,
    TOutput extends z.ZodTypeAny = z.ZodVoid,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined
>(
    params: CreateWebhookProps<TModels, TOutput, TMetadata, TCheckpoint>
): CreateFunctionResponse<TModels, z.ZodTypeAny, TOutput, TMetadata, TCheckpoint, HttpTriggerDefinition> {
    // The trigger-shaped props (`ingress`/`debounce`) are lifted into the implicit http trigger
    // definition; everything else lands at the function top level.
    const { name, ingress, debounce, exec, ...rest } = params;
    const trigger: HttpTriggerDefinition = {
        kind: 'http',
        ...(name !== undefined ? { name } : {}),
        ...(ingress !== undefined ? { ingress } : {}),
        ...(debounce !== undefined ? { debounce } : {})
    };
    return {
        type: 'function',
        ...rest,
        exec,
        ...(name !== undefined ? { name } : {}),
        trigger
    };
}
