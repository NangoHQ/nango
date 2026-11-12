// This file is only used by scripts locally

export type { ActionError, FunctionError, NangoActionBase as NangoAction, NangoSyncBase as NangoSync, ProxyConfiguration } from '@nangohq/runner-sdk';

export { scopes, createAction, createOnEvent, createSync, createTool } from '@nangohq/runner-sdk';
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
    RequiredScopes,
    ToolMeta
} from '@nangohq/runner-sdk';
