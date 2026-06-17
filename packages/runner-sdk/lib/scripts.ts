import type { NangoActionBase } from './action.js';
import type { NangoSyncBase } from './sync.js';
import type { ZodCheckpoint, ZodMetadata, ZodModel } from './types.js';
import type { NangoSyncEndpointV2 } from '@nangohq/types';
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
 * available regardless of declared triggers — it is not a trigger type. Such runs leave
 * `FunctionEvent.trigger` undefined.
 */
export type FunctionTriggerType = 'http' | 'schedule' | 'event';

/**
 * Declares where the debounce/coalescing key is extracted from.
 * - `{ body: '$.portalId' }` — dot-notation path into the normalized body
 * - `{ header: 'x-goog-resource-id' }` — flat, case-insensitive header lookup
 */
export type DebounceKeySource = { body: string } | { header: string };

/**
 * Coalesces multiple inbound events into a single function run within a sliding window.
 */
export interface WebhookDebounceConfig {
    key?: DebounceKeySource;
    /** Sliding window in milliseconds. */
    windowMs: number;
    /** Hard ceiling for the window regardless of incoming events. */
    maxWindowMs?: number;
    /** When exceeded, the window stops sliding and `event.coalesced.overflowed` is set. */
    maxEntities?: number;
    /** Whether the handler receives only the latest payload or every coalesced payload. */
    payloadMode?: 'latest' | 'all';
}

/** Read-only request view passed to ingress hooks. No SDK, no I/O, hard timeout. */
export interface IngressEvent {
    rawBody: string;
    headers: Record<string, string>;
    query: Record<string, string | string[] | undefined>;
}

/**
 * Runs synchronously at ingress before enqueueing. Return a response object to short-circuit
 * the HTTP exchange (provider handshake), or `undefined` to let the request proceed.
 */
export type IngressChallenge = (event: IngressEvent) => MaybePromise<{ status?: number; body?: unknown; headers?: Record<string, string> } | undefined | void>;

/**
 * Runs synchronously at ingress before enqueueing. Return `true` to accept the event,
 * or `false` (or throw) to reject it with a 401.
 */
export type IngressValidation = (event: IngressEvent) => MaybePromise<boolean>;

export interface HttpTrigger {
    type: 'http';
    /** Maps to the webhook URL path segment. Defaults to the file basename. */
    name?: string;
    /** `connection` opts into connection-level URLs (`/:webhookName/:targetToken`). */
    scope?: 'integration' | 'connection';
    ingressChallenge?: IngressChallenge;
    ingressValidation?: IngressValidation;
}
export interface ScheduleTrigger {
    type: 'schedule';
    /** e.g. 'every hour', 'every 2 minutes'. */
    schedule: string;
}
export interface EventTrigger {
    type: 'event';
    event: string;
}
export type FunctionTrigger = HttpTrigger | ScheduleTrigger | EventTrigger;

/** Coalescing summary, present on an http ingress event when `debounce` is configured. */
export interface CoalescedInfo {
    count: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    overflowed: boolean;
}

/** Fields shared by every ingress event a function `exec` receives. */
interface IngressEventBase<TPayload> {
    /**
     * The payload that initiated the run. Typed as the function's `input` schema when declared,
     * otherwise `unknown`.
     */
    payload: TPayload;
    /**
     * Pre-populated when the run was started with connection context (connection-level URL,
     * `triggerFunction({ connectionId })`, or CLI `--connection`). Undefined for connection-less runs.
     */
    connection?: { connection_id: string; provider_config_key: string };
}

/**
 * Ingress event for an `http` trigger (an incoming http call or webhook request).
 * For an http trigger the `payload` is the provider's body (not validated against `input` at
 * runtime), and is an array of `TPayload` when `payloadMode: 'all'` is set and debounced.
 */
export interface HttpIngressEvent<TPayload = unknown> extends IngressEventBase<TPayload> {
    type: 'http';
    /** The name of the trigger that fired, when declared. */
    name?: string;
    /** Raw headers from the provider. */
    headers: Record<string, string>;
    /** Original request body as received by ingress. */
    rawBody: string;
    /** Coalescing summary when `debounce` is configured. */
    coalesced?: CoalescedInfo;
}

/** Ingress event for a `schedule` trigger. */
export interface ScheduleIngressEvent<TPayload = unknown> extends IngressEventBase<TPayload> {
    type: 'schedule';
    /** The name of the trigger that fired, when declared. */
    name?: string;
}

/** Ingress event for an `event` trigger (an internal Nango event). */
export interface EventIngressEvent<TPayload = unknown> extends IngressEventBase<TPayload> {
    type: 'event';
    /** The name of the trigger that fired, when declared. */
    name?: string;
}

/**
 * The event a function `exec` receives, as a discriminated union over the trigger kind that fired
 * (keyed by `event.type`). Distinct from `(nango, input)` for actions — functions are
 * trigger-driven, so the second argument describes the trigger and its payload.
 */
export type FunctionEvent<TPayload = unknown> = HttpIngressEvent<TPayload> | ScheduleIngressEvent<TPayload> | EventIngressEvent<TPayload>;

export interface CreateFunctionProps<
    TModels extends Record<string, ZodModel>,
    TInput extends z.ZodTypeAny = z.ZodUnknown,
    TOutput extends z.ZodTypeAny = z.ZodTypeAny,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined
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
     * What can initiate execution. A function can have multiple triggers of different types
     * (e.g. a webhook trigger plus a scheduled safety net). Any function can also be started
     * on-demand via `nango.triggerFunction()` or the API regardless of declared triggers.
     */
    triggers: FunctionTrigger[];

    /**
     * Coalesces a burst of inbound events into a single run within a sliding window.
     * Applies to http-triggered runs.
     */
    debounce?: WebhookDebounceConfig;

    /** Models the function can `batchSave`/`batchUpdate`/`batchDelete` against. */
    models?: TModels;

    /** Optional input schema. When set, it types `event.payload` and is used for API invocation. */
    input?: TInput;

    /** Optional output schema. Types `exec`'s return value. Ignored for http-triggered runs. */
    output?: TOutput;

    metadata?: TMetadata;
    checkpoint?: TCheckpoint;
    scopes?: string[];

    /**
     * The handler. Runs on the customer runner with full SDK access.
     * @example
     * ```ts
     * exec: async (nango, event) => {
     *   const connections = await nango.searchConnections({ tags: { portalId: event.payload.portalId } });
     *   for (const connection of connections) {
     *     await nango.triggerSync(connection.provider_config_key, connection.connection_id, 'contacts');
     *   }
     * }
     * ```
     */
    exec: (nango: NangoSyncBase<TModels, TMetadata, TCheckpoint>, event: FunctionEvent<z.infer<TInput>>) => MaybePromise<z.infer<TOutput>>;
}

export interface CreateFunctionResponse<
    TModels extends Record<string, ZodModel>,
    TInput extends z.ZodTypeAny = z.ZodUnknown,
    TOutput extends z.ZodTypeAny = z.ZodTypeAny,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined
> extends CreateFunctionProps<TModels, TInput, TOutput, TMetadata, TCheckpoint> {
    type: 'function';
    /** Set when authored via `createWebhook()`; mirrors the http trigger name. */
    name?: string;
}

/**
 * Create a function — the trigger-agnostic primitive.
 *
 * Use this directly when you need multiple trigger types (e.g. webhook + cron).
 * For a single webhook trigger, prefer the `createWebhook()` sugar.
 *
 * @example
 * ```ts
 * export default createFunction({
 *     triggers: [
 *         { type: 'http', name: 'contacts-updated', debounce: { key: { body: '$.objectId' }, windowMs: 5000 } },
 *         { type: 'schedule', schedule: 'every hour' }
 *     ],
 *     exec: async (nango, event) => { ... }
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
    TCheckpoint extends ZodCheckpoint = undefined
>(params: CreateFunctionProps<TModels, TInput, TOutput, TMetadata, TCheckpoint>): CreateFunctionResponse<TModels, TInput, TOutput, TMetadata, TCheckpoint> {
    return { type: 'function', ...params };
}

export interface CreateWebhookProps<
    TModels extends Record<string, ZodModel>,
    TOutput extends z.ZodTypeAny = z.ZodTypeAny,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined
> {
    /** Maps to the webhook URL path segment. Defaults to the file basename. */
    name?: string;
    version?: string;
    description?: string;
    /** `connection` opts into connection-level URLs (`/:webhookName/:targetToken`). */
    scope?: 'integration' | 'connection';
    ingressChallenge?: IngressChallenge;
    ingressValidation?: IngressValidation;
    /** Coalesces a burst of inbound events into a single run within a sliding window. */
    debounce?: WebhookDebounceConfig;
    models?: TModels;
    /** Optional output schema. Types `exec`'s return value. Ignored at ingress. */
    output?: TOutput;
    metadata?: TMetadata;
    checkpoint?: TCheckpoint;
    exec: (nango: NangoSyncBase<TModels, TMetadata, TCheckpoint>, event: FunctionEvent) => MaybePromise<z.infer<TOutput>>;
}

/**
 * Create a webhook handler — sugar for a function with a single implicit `http` trigger.
 *
 * Routing lives entirely in `exec` (customer-owned, runs on your runner). Provider protocol
 * mechanics (handshake, signature verification) live in `ingressChallenge` / `ingressValidation`,
 * which run synchronously at ingress with no SDK access.
 *
 * @example
 * ```ts
 * export default createWebhook({
 *     name: 'contacts-updated',
 *     debounce: { key: { body: '$.portalId' }, windowMs: 5000 },
 *     exec: async (nango, event) => {
 *         const connections = await nango.searchConnections({ tags: { portalId: event.payload.portalId } });
 *         for (const connection of connections) {
 *             await nango.triggerSync(connection.provider_config_key, connection.connection_id, 'contacts');
 *         }
 *     }
 * });
 * ```
 */
export function createWebhook<
    TModels extends Record<string, ZodModel> = Record<never, ZodModel>,
    TOutput extends z.ZodTypeAny = z.ZodTypeAny,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined
>(params: CreateWebhookProps<TModels, TOutput, TMetadata, TCheckpoint>): CreateFunctionResponse<TModels, z.ZodTypeAny, TOutput, TMetadata, TCheckpoint> {
    // `debounce` is a function-level prop, so it stays in `rest` and lands at the top level — only
    // the trigger-shaped props are lifted into the implicit http trigger.
    const { name, scope, ingressChallenge, ingressValidation, ...rest } = params;
    const trigger: HttpTrigger = {
        type: 'http',
        ...(name !== undefined ? { name } : {}),
        ...(scope !== undefined ? { scope } : {}),
        ...(ingressChallenge !== undefined ? { ingressChallenge } : {}),
        ...(ingressValidation !== undefined ? { ingressValidation } : {})
    };
    return {
        type: 'function',
        ...rest,
        ...(name !== undefined ? { name } : {}),
        triggers: [trigger]
    };
}
