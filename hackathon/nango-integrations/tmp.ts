import type { NangoAction, NangoSync } from './models';
import type { z } from 'zod';

export function createSync<TModels extends Record<string, Zod.ZodObject<any>>, TMetadata extends Zod.ZodObject<any> | undefined = undefined>(params: {
    name: string;
    endpoint: { method: 'GET' | 'POST'; path: string; group: string };
    integrationId: string;
    runs: string;
    models: TModels;
    description: string;
    syncType: 'full' | 'incremental';
    trackDeletes?: boolean;
    autoStart?: boolean;
    scopes?: string;
    metadata?: TMetadata;
    version?: string;
    fetchData: (nango: NangoSync<TModels, TMetadata>) => Promise<void> | void;
    onWebhook?: (nango: NangoSync<TModels, TMetadata>, payload: any) => Promise<void> | void;
}) {
    return params;
}

export function createAction<
    TInput extends Zod.ZodTypeAny,
    TOutput extends Zod.ZodTypeAny,
    TMetadata extends Zod.ZodObject<any> | undefined = undefined,
    TOutputInferred = z.infer<TOutput>,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    TInputInferred = z.infer<TInput>
>(params: {
    name: string;
    endpoint: { method: 'GET' | 'POST'; path: string; group: string };
    description: string;
    integrationId: string;
    input: TInput;
    output: TOutput;
    metadata?: TMetadata;
    version?: string;
    runAction: (nango: NangoAction<TMetadata>, input: TInputInferred) => Promise<TOutputInferred> | TOutputInferred;
}) {
    return params;
}

export function createOnEvent<TMetadata extends Zod.ZodObject<any> | undefined = undefined>(params: {
    name: string;
    description: string;
    integrationId: string;
    type: 'post-connection-creation' | 'pre-connection-deletion';
    metadata?: TMetadata;
    version?: string;
    exec: (nango: NangoAction<TMetadata>) => Promise<void> | void;
}) {
    return params;
}
