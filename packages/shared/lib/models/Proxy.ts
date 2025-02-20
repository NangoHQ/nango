export type ResponseType = 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';

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
    in_body?: boolean;
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
