// This file is only used by scripts locally

export type { ActionError, NangoActionBase as NangoAction, NangoSyncBase as NangoSync, ProxyConfiguration } from '@nangohq/runner-sdk';

export { createAction, createFunction, createOnEvent, createSync, createWebhook } from '@nangohq/runner-sdk';
export type {
    CreateActionProps,
    CreateActionResponse,
    CreateAnyResponse,
    CreateFunctionProps,
    CreateFunctionResponse,
    CreateOnEventProps,
    CreateOnEventResponse,
    CreateSyncProps,
    CreateSyncResponse,
    CreateWebhookProps
} from '@nangohq/runner-sdk';
