import type { FunctionTags } from '../function/config.js';
import type { ToolTags } from '../function/tool.js';
import type { OnEventType } from '../scripts/on-events/api.js';
import type { FunctionSource } from '../syncConfigs/db.js';
import type { JSONSchema7 } from 'json-schema';

/** `tools-catalog` is list/API only — never a DB `FunctionSource`. */
export type FunctionListSource = FunctionSource | 'tools-catalog';

export type FunctionType = 'action' | 'sync' | 'on-event';
export type FunctionListType = FunctionType | 'tool';

interface NangoFunctionBase {
    name: string;
    description?: string;
    scopes?: string[];
}

export interface NangoSyncFunction extends NangoFunctionBase {
    type: 'sync';
    input?: string;
    returns: string[];
    json_schema: JSONSchema7 | null;
    /** Schedule expression such as `every day`. */
    runs: string | null;
    auto_start: boolean;
    track_deletes: boolean;
}

export interface NangoActionFunction extends NangoFunctionBase {
    type: 'action';
    input?: string;
    returns: string[];
    json_schema: JSONSchema7 | null;
}

export interface NangoOnEventFunction extends NangoFunctionBase {
    type: 'on-event';
    event: OnEventType;
}

export type NangoFunction = NangoSyncFunction | NangoActionFunction | NangoOnEventFunction;

/** A deployed sync-config row. `id` and `last_deployed` are always present. */
export interface FunctionAvailability {
    id: number;
    enabled: boolean;
    /** ISO-8601 timestamp. */
    last_deployed: string;
    source: FunctionSource;
}

/** A row in a function list. Catalog actions have no deployed row. */
export interface ListedFunctionAvailability {
    /** Sync-config id. `null` when the function is served from the catalog (no deployed row) or is a tool (identified by `uuid`). */
    id: number | null;
    enabled: boolean;
    /** ISO-8601 timestamp. `null` when the function was never deployed. */
    last_deployed: string | null;
    source: FunctionListSource;
}

export type ListedNangoSyncFunction = NangoSyncFunction & ListedFunctionAvailability;
export type ListedNangoActionFunction = NangoActionFunction & ListedFunctionAvailability;
export type ListedNangoOnEventFunction = NangoOnEventFunction & ListedFunctionAvailability;
export type ListedNangoToolFunction = NangoFunctionBase &
    ListedFunctionAvailability & {
        type: 'tool';
        uuid: string;
        integration_id: string;
        provider: string;
        description: string;
        input_json_schema: JSONSchema7 | null;
        output_json_schema: JSONSchema7 | null;
        meta: Pick<ToolTags, 'instructions' | 'required_scopes'> & {
            tags: FunctionTags;
        };
    };
export type ListedNangoFunction = ListedNangoSyncFunction | ListedNangoActionFunction | ListedNangoOnEventFunction | ListedNangoToolFunction;

export type NangoFunctionTemplate = (NangoSyncFunction | NangoActionFunction) & { deployed?: FunctionAvailability };
