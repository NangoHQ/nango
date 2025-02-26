import type { DBConnectionDecrypted } from '../connection/db.js';
import type { HTTP_METHOD } from '../nangoYaml/index.js';
import type { Provider } from '../providers/provider.js';

export interface ProxyFile {
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

export interface BaseProxyConfiguration {
    providerConfigKey: string;
    endpoint: string;
    retries?: number;
    data?: unknown;
    files?: ProxyFile[]; // TODO: only allow this from the API
    headers?: Record<string, string>;
    params?: string | Record<string, string | number | string[] | number[]>;
    baseUrlOverride?: string;
    responseType?: ResponseType | undefined;
    retryHeader?: RetryHeaderConfig;
    retryOn?: number[] | null;
}

export interface UserProvidedProxyConfiguration extends BaseProxyConfiguration {
    decompress?: boolean | string;
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'get' | 'post' | 'patch' | 'put' | 'delete';
    paginate?: Partial<CursorPagination> | Partial<LinkPagination> | Partial<OffsetPagination>;
}

export type ConnectionForProxy = Pick<DBConnectionDecrypted, 'connection_id' | 'connection_config' | 'credentials' | 'metadata'>;

export interface ApplicationConstructedProxyConfiguration extends BaseProxyConfiguration {
    decompress: boolean;
    method: HTTP_METHOD;
    providerName: string;
    provider: Provider;
}

export type ResponseType = 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';

export interface InternalProxyConfiguration {
    providerName: string;
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
    in_body?: boolean;
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
