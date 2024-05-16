import type { ApiError, Endpoint } from '../../api';
import type { Metadata } from '../db';

export type SetMetadata = Endpoint<{
    Method: 'POST';
    Path: '/connection/metadata';
    Body: {
        connection_id: string | string[];
        provider_config_key: string;
        metadata: Metadata;
    };
    Error: ApiError<'invalid_body'> | ApiError<'unknown_connection'>;
    Success: {
        connection_id: string | string[];
        provider_config_key: string;
        metadata: Metadata;
    };
}>;

export type UpdateMetadata = Endpoint<{
    Method: 'PATCH';
    Path: '/connection/metadata';
    Body: {
        connection_id: string | string[];
        provider_config_key: string;
        metadata: Metadata;
    };
    Error: ApiError<'invalid_body'> | ApiError<'unknown_connection'>;
    Success: {
        connection_id: string | string[];
        provider_config_key: string;
        metadata: Metadata;
    };
}>;
