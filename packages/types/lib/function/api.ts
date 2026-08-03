import type { ApiEndpoint, ApiError } from '../api.js';
import type { AuditPolicy } from '../audit-trail/event.js';
import type { FunctionCapabilities, FunctionLimits, FunctionRequires, FunctionTriggerDefinition } from './config.js';
import type { JSONSchema7 } from 'json-schema';

export type PostFunctionDeploy = ApiEndpoint<{
    Audit: AuditPolicy<'function', 'deployed', 'environment'>;
    Method: 'POST';
    Path: '/functions/deploy';
    Body: {
        mode: 'preview' | 'apply';
        functions: {
            name: string;
            integrationId: string;
            description: string;
            trigger: FunctionTriggerDefinition;
            requires: FunctionRequires;
            capabilities: FunctionCapabilities;
            limits: FunctionLimits;
            input_schema_ref: string | null;
            output_schema_ref: string | null;
            model_schema_refs: string[];
            metadata_schema_ref: string | null;
            checkpoint_schema_ref: string | null;
            json_schema: JSONSchema7;
            fileBody: {
                js: string;
                ts: string;
            };
        }[];
    };
    Error: ApiError<'not_implemented' | 'integration_not_found' | 'file_upload_error'>;
    Success: {
        created: { integrationId: string; name: string }[];
        updated: { integrationId: string; name: string }[];
        unchanged: { integrationId: string; name: string }[];
        deleted: { integrationId: string; name: string }[];
    };
}>;
