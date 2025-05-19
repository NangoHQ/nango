import type { NangoActionBase } from './action.js';
import type { NangoSyncBase } from './sync.js';
import type { z } from 'zod';

export interface CreateSyncProps<TModels extends Record<string, Zod.ZodObject<any>>, TMetadata extends Zod.ZodObject<any> | undefined = undefined> {
    version?: string;
    description: string;
    endpoints: { method: 'GET' | 'POST'; path: string; group: string }[];
    runs: string;
    models: TModels;
    syncType: 'full' | 'incremental';
    trackDeletes?: boolean;
    autoStart?: boolean;
    scopes?: string[];
    metadata?: TMetadata;
    webhookSubscriptions?: string[];
    exec: (nango: NangoSyncBase<TModels, TMetadata>) => Promise<void> | void;
    onWebhook?: (nango: NangoSyncBase<TModels, TMetadata>, payload: any) => Promise<void> | void;
}
export interface CreateSyncResponse<TModels extends Record<string, Zod.ZodObject<any>>, TMetadata extends Zod.ZodObject<any> | undefined = undefined> {
    type: 'sync';
    params: CreateSyncProps<TModels, TMetadata>;
}

export interface CreateActionProps<
    TInput extends Zod.ZodTypeAny,
    TOutput extends Zod.ZodTypeAny,
    TMetadata extends Zod.ZodObject<any> | undefined = undefined,
    TOutputInferred = z.infer<TOutput>,
    TInputInferred = z.infer<TInput>
> {
    version?: string;
    description: string;
    endpoint: { method: 'GET' | 'POST'; path: string; group: string };
    input: TInput;
    output: TOutput;
    metadata?: TMetadata;
    scopes?: string[];
    exec: (nango: NangoActionBase<TMetadata>, input: TInputInferred) => Promise<TOutputInferred> | TOutputInferred;
}
export interface CreateActionResponse<
    TInput extends Zod.ZodTypeAny,
    TOutput extends Zod.ZodTypeAny,
    TMetadata extends Zod.ZodObject<any> | undefined = undefined
> {
    type: 'action';
    params: CreateActionProps<TInput, TOutput, TMetadata>;
}

export interface CreateOnEventProps<TMetadata extends Zod.ZodObject<any> | undefined = undefined> {
    version?: string;
    description: string;
    event: 'post-connection-creation' | 'pre-connection-deletion';
    metadata?: TMetadata;
    exec: (nango: NangoActionBase<TMetadata>) => Promise<void> | void;
}
export interface CreateOnEventResponse<TMetadata extends Zod.ZodObject<any> | undefined = undefined> {
    type: 'on-event';
    params: CreateOnEventProps<TMetadata>;
}

export type CreateAnyResponse = CreateSyncResponse<any, any> | CreateActionResponse<any, any> | CreateOnEventResponse;

export function createSync<TModels extends Record<string, Zod.ZodObject<any>>, TMetadata extends Zod.ZodObject<any> | undefined = undefined>(
    params: CreateSyncProps<TModels, TMetadata>
): CreateSyncResponse<TModels, TMetadata> {
    return { type: 'sync', params };
}

export function createAction<
    TInput extends Zod.ZodTypeAny,
    TOutput extends Zod.ZodTypeAny,
    TMetadata extends Zod.ZodObject<any> | undefined = undefined,
    TOutputInferred = z.infer<TOutput>,
    TInputInferred = z.infer<TInput>
>(params: CreateActionProps<TInput, TOutput, TMetadata, TOutputInferred, TInputInferred>): CreateActionResponse<TInput, TOutput, TMetadata> {
    return { type: 'action', params };
}

export function createOnEvent<TMetadata extends Zod.ZodObject<any> | undefined = undefined>(
    params: CreateOnEventProps<TMetadata>
): CreateOnEventResponse<TMetadata> {
    return { type: 'on-event', params };
}

export type { ActionError } from './errors.js';
export type { NangoActionBase as NangoAction } from './action.js';
export type { NangoSyncBase as NangoSync } from './sync.js';
