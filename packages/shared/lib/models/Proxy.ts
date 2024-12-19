import type { ParamsSerializerOptions } from 'axios';
import type { HTTP_METHOD } from './Generic.js';
import type {
    BasicApiCredentials,
    ApiKeyCredentials,
    AppCredentials,
    TbaCredentials,
    TableauCredentials,
    JwtCredentials,
    SignatureCredentials
} from './Auth.js';
import type { Connection } from './Connection.js';
import type { Provider, TwoStepCredentials } from '@nangohq/types';

export interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    destination: string;
    filename: string;
    path: string;
    buffer: Buffer;
}

interface BaseProxyConfiguration {
    providerConfigKey: string;
    connectionId: string;
    endpoint: string;
    retries?: number;
    data?: unknown;
    files?: File[];
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
    method: HTTP_METHOD;
    providerName: string;
    token:
        | string
        | BasicApiCredentials
        | ApiKeyCredentials
        | AppCredentials
        | TbaCredentials
        | TableauCredentials
        | JwtCredentials
        | TwoStepCredentials
        | SignatureCredentials;
    provider: Provider;
    connection: Pick<Connection, 'connection_id' | 'connection_config' | 'credentials' | 'metadata'>;
}

export type ResponseType = 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';

export interface InternalProxyConfiguration {
    providerName: string;
    connection: Pick<Connection, 'connection_id' | 'connection_config' | 'credentials' | 'metadata'>;
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

export type OffsetCalculationMethod = 'per-page' | 'by-response-size';

export interface OffsetPagination extends Pagination {
    offset_name_in_request: string;
    offset_start_value?: number;
    offset_calculation_method?: OffsetCalculationMethod;
}
