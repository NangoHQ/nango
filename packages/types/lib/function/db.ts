import type { TimestampsAndDeletedAt } from '../db.js';
import type { FunctionCapabilities } from '../functions/capabilities.js';
import type { FunctionLimits, FunctionTriggerDefinition, Requires } from '../functions/config.js';
import type { FunctionSource } from '../syncConfigs/db.js';
import type { JSONSchema7 } from 'json-schema';

export interface DBFunctionConfig extends TimestampsAndDeletedAt {
    id: number;
    nango_config_id: number;
    environment_id: number;
    name: string;
    current_version_id: number | null;
    enabled: boolean;
}

export interface DBFunctionConfigVersion extends TimestampsAndDeletedAt {
    id: number;
    function_config_id: number;
    description: string;
    file_location: string;
    version: string;
    source: FunctionSource;
    trigger: FunctionTriggerDefinition;
    requires: Requires;
    capabilities: FunctionCapabilities;
    limits: FunctionLimits;
    input_schema_ref: string | null;
    output_schema_ref: string | null;
    model_schema_refs: string[];
    metadata_schema_ref: string | null;
    checkpoint_schema_ref: string | null;
    json_schema: JSONSchema7;
}

export interface DBFunctionInstance extends TimestampsAndDeletedAt {
    id: number;
    nango_connection_id: number;
    function_config_id: number;
    name: string;
    variant: string;
    last_run_at: Date | null;
    frequency: string | null;
}
