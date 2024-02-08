import type { ParamsSerializerOptions } from 'axios';
import type { HTTP_VERB } from './Generic.js';
import type { BasicApiCredentials, ApiKeyCredentials, AppCredentials } from './Auth.js';
import type { Connection } from './Connection.js';
import type { Template as ProviderTemplate } from './Provider.js';

interface BaseProxyConfiguration {
    providerConfigKey: string;
    connectionId: string;
    endpoint: string;
    retries?: number;
    data?: unknown;
    headers?: Record<string, string>;
    params?: string | Record<string, string | number>;
    paramsSerializer?: ParamsSerializerOptions;
    baseUrlOverride?: string;
    responseType?: ResponseType;
    retryHeader?: RetryHeaderConfig;
}

export interface UserProvidedProxyConfiguration extends BaseProxyConfiguration {
    decompress?: boolean | string;
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'get' | 'post' | 'patch' | 'put' | 'delete';
    paginate?: Partial<CursorPagination> | Partial<LinkPagination> | Partial<OffsetPagination>;
}

export interface ApplicationConstructedProxyConfiguration extends BaseProxyConfiguration {
    decompress?: boolean;
    method: HTTP_VERB;
    provider: string;
    token: string | BasicApiCredentials | ApiKeyCredentials | AppCredentials;
    template: ProviderTemplate;
    connection: Connection;
}

export type ResponseType = 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';

export interface InternalProxyConfiguration {
    provider: string;
    connection: Connection;
    existingActivityLogId?: number;
}

export interface RetryHeaderConfig {
    at?: string;
    after?: string;
}

export enum PaginationType {
    CURSOR = 'cursor',
    LINK = 'link',
    OFFSET = 'offset'
}

export interface Pagination {
    type: string;
    limit?: number;
    response_path?: string;
    limit_name_in_request: string;
}

export interface CursorPagination extends Pagination {
    cursor_path_in_response: string;
    cursor_name_in_request: string;
}

export interface LinkPagination extends Pagination {
    link_rel_in_response_header?: string;
    link_path_in_response_body?: string;
}

export interface OffsetPagination extends Pagination {
    offset_name_in_request: string;
}
