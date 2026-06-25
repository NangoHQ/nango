// This file is only used by scripts locally

export type { ActionError, NangoActionBase as NangoAction, NangoSyncBase as NangoSync, ProxyConfiguration } from '@nangohq/runner-sdk';

// `createFunction` is intentionally not re-exported yet: the spec is still in flux, so we keep the
// public surface to `createWebhook` to limit breaking changes until it stabilizes (NAN-5943).
export { createAction, createOnEvent, createSync, createWebhook } from '@nangohq/runner-sdk';
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
