// import type {
//     CreateActionProps,
//     CreateActionResponse,
//     CreateOnEventProps,
//     CreateOnEventResponse,
//     CreateSyncProps,
//     CreateSyncResponse
// } from '@nangohq/runner-sdk';
// import type { z } from 'zod';

// export function createSync<TModels extends Record<string, Zod.ZodObject<any>>, TMetadata extends Zod.ZodObject<any> | undefined = undefined>(
//     params: CreateSyncProps<TModels, TMetadata>
// ): CreateSyncResponse<TModels, TMetadata> {
//     return { type: 'sync', params };
// }

// export function createAction<
//     TInput extends Zod.ZodTypeAny,
//     TOutput extends Zod.ZodTypeAny,
//     TMetadata extends Zod.ZodObject<any> | undefined = undefined,
//     TOutputInferred = z.infer<TOutput>,
//     TInputInferred = z.infer<TInput>
// >(params: CreateActionProps<TInput, TOutput, TMetadata, TOutputInferred, TInputInferred>): CreateActionResponse<TInput, TOutput, TMetadata> {
//     return { type: 'action', params };
// }

// export function createOnEvent<TMetadata extends Zod.ZodObject<any> | undefined = undefined>(
//     params: CreateOnEventProps<TMetadata>
// ): CreateOnEventResponse<TMetadata> {
//     return { type: 'on-event', params };
// }

export type { ActionError, NangoActionBase as NangoAction, NangoSyncBase as NangoSync } from '@nangohq/runner-sdk';

export { createAction, createOnEvent, createSync } from '@nangohq/runner-sdk';
export type {
    CreateActionProps,
    CreateActionResponse,
    CreateAnyResponse,
    CreateOnEventProps,
    CreateOnEventResponse,
    CreateSyncProps,
    CreateSyncResponse
} from '@nangohq/runner-sdk/lib/scripts';
