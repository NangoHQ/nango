import type { NangoAction, NangoSync } from './toDelete';
import type { z } from 'zod';

export interface CreateSyncProps<TModels extends Record<string, Zod.ZodObject<any>>, TMetadata extends Zod.ZodObject<any> | undefined = undefined> {
    version?: string;
    description: string;
    endpoints: { method: 'GET' | 'POST'; path: string; group: string }[];
    integrationId: string;
    runs: string;
    models: TModels;
    syncType: 'full' | 'incremental';
    trackDeletes?: boolean;
    autoStart?: boolean;
    scopes?: string[];
    metadata?: TMetadata;
    webhookSubscriptions?: string[];
    exec: (nango: NangoSync<TModels, TMetadata>) => Promise<void> | void;
    onWebhook?: (nango: NangoSync<TModels, TMetadata>, payload: any) => Promise<void> | void;
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
    integrationId: string;
    input: TInput;
    output: TOutput;
    metadata?: TMetadata;
    scopes?: string[];
    exec: (nango: NangoAction<TMetadata>, input: TInputInferred) => Promise<TOutputInferred> | TOutputInferred;
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
    integrationId: string;
    event: 'post-connection-creation' | 'pre-connection-deletion';
    metadata?: TMetadata;
    exec: (nango: NangoAction<TMetadata>) => Promise<void> | void;
}
export interface CreateOnEventResponse<TMetadata extends Zod.ZodObject<any> | undefined = undefined> {
    type: 'on-event';
    params: CreateOnEventProps<TMetadata>;
}

export type CreateAnyResponse = CreateSyncResponse<any, any> | CreateActionResponse<any, any> | CreateOnEventResponse;
