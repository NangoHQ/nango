import type { ParamsSerializerOptions } from 'axios';
import type { EndpointMethod } from '../api.js';
import type { BasicApiCredentials, ApiKeyCredentials, AppCredentials } from '../auth/api.js';
import type { Connection } from '../connection/db.js';
import type { Provider } from '../providers/provider.js';

export interface BaseProxyConfiguration {
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
    retryOn?: number[] | null;
}

export interface UserProvidedProxyConfiguration extends BaseProxyConfiguration {
    decompress?: boolean | string;
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'get' | 'post' | 'patch' | 'put' | 'delete';
    paginate?: Partial<CursorPagination> | Partial<LinkPagination> | Partial<OffsetPagination>;
}

export interface ApplicationConstructedProxyConfiguration extends BaseProxyConfiguration {
    decompress?: boolean;
    method: EndpointMethod;
    providerName: string;
    token: string | BasicApiCredentials | ApiKeyCredentials | AppCredentials;
    provider: Provider;
    connection: Connection;
}

export type ResponseType = 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';

export interface InternalProxyConfiguration {
    providerName: string;
    connection: Connection;
    existingActivityLogId?: string | null | undefined;
}

export interface RetryHeaderConfig {
    at?: string;
    after?: string;
    remaining?: string;
    error_code?: number;
}

export enum PaginationType {
    CURSOR = 'cursor',
    LINK = 'link',
    OFFSET = 'offset'
}

export interface PaginationBase {
    limit?: number;
    response_path?: string;
    limit_name_in_request: string;
}

export type Pagination = CursorPagination | LinkPagination | OffsetPagination;

export interface CursorPagination extends PaginationBase {
    type: 'cursor';
    cursor_path_in_response: string;
    cursor_name_in_request: string;
}

export interface LinkPagination extends PaginationBase {
    type: 'link';
    link_rel_in_response_header?: string;
    link_path_in_response_body?: string;
}

export type OffsetCalculationMethod = 'per-page' | 'by-response-size';

export interface OffsetPagination extends PaginationBase {
    type: 'offset';
    offset_name_in_request: string;
    offset_start_value?: number;
    offset_calculation_method?: OffsetCalculationMethod;
}
