import type { OnEventType } from '../scripts/on-events/api.js';
import type { FunctionSource } from '../syncConfigs/db.js';
import type { JSONSchema7 } from 'json-schema';

export type FunctionType = 'action' | 'sync' | 'on-event';

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

export interface DeployedMeta {
    id: number;
    enabled: boolean;
    /** ISO-8601 timestamp. */
    last_deployed: string;
    source: FunctionSource;
}

export type DeployedNangoSyncFunction = NangoSyncFunction & DeployedMeta;
export type DeployedNangoActionFunction = NangoActionFunction & DeployedMeta;
export type DeployedNangoOnEventFunction = NangoOnEventFunction & DeployedMeta;
export type DeployedNangoFunction = DeployedNangoSyncFunction | DeployedNangoActionFunction | DeployedNangoOnEventFunction;

export type NangoFunctionTemplate = (NangoSyncFunction | NangoActionFunction) & { deployed?: DeployedMeta };
