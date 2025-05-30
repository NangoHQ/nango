import type { NangoActionBase } from './action.js';
import type { NangoSyncBase } from './sync.js';
import type { ZodMetadata } from './types.js';
import type { NangoSyncEndpointV2 } from '@nangohq/types';
import type { MaybePromise } from 'rollup';
import type { z } from 'zod';

export type CreateAnyResponse = CreateSyncResponse<any, any> | CreateActionResponse<any, any> | CreateOnEventResponse;

export type { ActionError } from './errors.js';
export type { NangoActionBase as NangoAction, ProxyConfiguration } from './action.js';
export type { NangoSyncBase as NangoSync } from './sync.js';

// ----- Sync
export interface CreateSyncProps<TModels extends Record<string, Zod.ZodObject<any>>, TMetadata extends ZodMetadata = never> {
    version?: string;
    description: string;
    endpoints: NangoSyncEndpointV2[];
    frequency: string;
    models: TModels;
    syncType: 'full' | 'incremental';
    trackDeletes?: boolean;
    autoStart?: boolean;
    scopes?: string[];
    metadata?: TMetadata;
    webhookSubscriptions?: string[];
    exec: (nango: NangoSyncBase<TModels, TMetadata>) => MaybePromise<void>;
    onWebhook?: (nango: NangoSyncBase<TModels, TMetadata>, payload: any) => MaybePromise<void>;
}
export interface CreateSyncResponse<TModels extends Record<string, Zod.ZodObject<any>>, TMetadata extends ZodMetadata = undefined>
    extends CreateSyncProps<TModels, TMetadata> {
    type: 'sync';
}
/**
 * Create a sync script
 */
export function createSync<TModels extends Record<string, Zod.ZodObject<any>>, TMetadata extends ZodMetadata = undefined>(
    params: CreateSyncProps<TModels, TMetadata>
): CreateSyncResponse<TModels, TMetadata> {
    return { type: 'sync', ...params };
}

// ----- Action
export interface CreateActionProps<TInput extends Zod.ZodTypeAny, TOutput extends Zod.ZodTypeAny, TMetadata extends ZodMetadata = undefined> {
    version?: string;
    description: string;
    endpoint: NangoSyncEndpointV2;
    input: TInput;
    output: TOutput;
    metadata?: TMetadata;
    scopes?: string[];
    exec: (nango: NangoActionBase<TMetadata>, input: z.infer<TInput>) => MaybePromise<z.infer<TOutput>>;
}
export interface CreateActionResponse<TInput extends Zod.ZodTypeAny, TOutput extends Zod.ZodTypeAny, TMetadata extends ZodMetadata = undefined>
    extends CreateActionProps<TInput, TOutput, TMetadata> {
    type: 'action';
}
/**
 * Create an action script
 */
export function createAction<TInput extends Zod.ZodTypeAny, TOutput extends Zod.ZodTypeAny, TMetadata extends ZodMetadata = undefined>(
    params: CreateActionProps<TInput, TOutput, TMetadata>
): CreateActionResponse<TInput, TOutput, TMetadata> {
    return { type: 'action', ...params };
}

// ----- On Event
export interface CreateOnEventProps<TMetadata extends ZodMetadata = undefined> {
    version?: string;
    description: string;
    event: 'post-connection-creation' | 'pre-connection-deletion';
    metadata?: TMetadata;
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
