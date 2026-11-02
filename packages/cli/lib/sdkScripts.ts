// This file is only used by scripts locally

export type { ActionError, NangoActionBase as NangoAction, NangoSyncBase as NangoSync, ProxyConfiguration } from '@nangohq/runner-sdk';

export { createAction, createOnEvent, createSync, createTool } from '@nangohq/runner-sdk';
export type {
    CreateActionProps,
    CreateActionResponse,
    CreateAnyResponse,
    CreateOnEventProps,
    CreateOnEventResponse,
    CreateSyncProps,
    CreateSyncResponse,
    CreateToolProps,
    CreateToolResponse,
    HttpResponse,
    ToolMeta
} from '@nangohq/runner-sdk';
