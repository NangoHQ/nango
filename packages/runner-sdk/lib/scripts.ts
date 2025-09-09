import type { NangoActionBase } from './action.js';
import type { NangoSyncBase } from './sync.js';
import type { ZodMetadata, ZodModel } from './types.js';
import type { NangoSyncEndpointV2 } from '@nangohq/types';
import type { MaybePromise } from 'rollup';
import type * as z from 'zod';

export type CreateAnyResponse = CreateSyncResponse<any, any> | CreateActionResponse<any, any> | CreateOnEventResponse;

export type { ActionError } from './errors.js';
export type { NangoActionBase as NangoAction, ProxyConfiguration } from './action.js';
export type { NangoSyncBase as NangoSync } from './sync.js';

// ----- Sync
export interface CreateSyncProps<TModels extends Record<string, ZodModel>, TMetadata extends ZodMetadata = never> {
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
     * @example
     * ```ts
     * endpoints: [{ method: 'GET', path: '/github/issues' }],
     * ```
     * ```ts
     * const res = await fetch('https://api.nango.dev/github/issues');
     * ```
     */
    endpoints: NangoSyncEndpointV2[];

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
     */
    syncType: 'full' | 'incremental';

    /**
     * If `true`, automatically detects deleted records and removes them when you fetch the latest data.
     *
     * @deprecated This option will be removed in future versions. Please automatically detect deletions by calling `nango.deleteRecordsFromPreviousExecution()` in your sync script.
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
    exec: (nango: NangoSyncBase<TModels, TMetadata>) => MaybePromise<void>;

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
    onWebhook?: (nango: NangoSyncBase<TModels, TMetadata>, payload: any) => MaybePromise<void>;
}
export interface CreateSyncResponse<TModels extends Record<string, ZodModel>, TMetadata extends ZodMetadata = undefined>
    extends CreateSyncProps<TModels, TMetadata> {
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
export function createSync<TModels extends Record<string, ZodModel>, TMetadata extends ZodMetadata = undefined>(
    params: CreateSyncProps<TModels, TMetadata>
): CreateSyncResponse<TModels, TMetadata> {
    return { type: 'sync', ...params };
}

// ----- Action
export interface CreateActionProps<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny, TMetadata extends ZodMetadata = undefined> {
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
    endpoint: NangoSyncEndpointV2;

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
    exec: (nango: NangoActionBase<TMetadata>, input: z.infer<TInput>) => MaybePromise<z.infer<TOutput>>;
}
export interface CreateActionResponse<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny, TMetadata extends ZodMetadata = undefined>
    extends CreateActionProps<TInput, TOutput, TMetadata> {
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
export function createAction<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny, TMetadata extends ZodMetadata = undefined>(
    params: CreateActionProps<TInput, TOutput, TMetadata>
): CreateActionResponse<TInput, TOutput, TMetadata> {
    return { type: 'action', ...params };
}

// ----- On Event
export interface CreateOnEventProps<TMetadata extends ZodMetadata = undefined> {
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
     * The function that will be called when the onEvent script is triggered.
     * @example
     * ```ts
     * exec: async (nango) => {
     *  await nango.log('Hello, world!');
     * }
     * ```
     */
    exec: (nango: NangoActionBase<TMetadata>) => MaybePromise<void>;
}
export interface CreateOnEventResponse<TMetadata extends ZodMetadata = undefined> extends CreateOnEventProps<TMetadata> {
    type: 'onEvent';
}
/**
 * Create an onEvent script
 */
export function createOnEvent<TMetadata extends ZodMetadata = undefined>(params: CreateOnEventProps<TMetadata>): CreateOnEventResponse<TMetadata> {
    return { type: 'onEvent', ...params };
}
