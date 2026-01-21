import type { TelemetryBag } from './sdk.js';
import type { DBPlan } from '../plans/db.js';

export interface RunnerOutputError {
    type: string;
    payload: Record<string, unknown> | unknown[];
    /**
     * @deprecated useless now
     */
    status: number;
    additional_properties?: Record<string, unknown> | undefined;
}

export interface RunnerOutput {
    output: unknown;
    telemetryBag: TelemetryBag;
}

export interface RunnerFlags {
    validateActionInput: boolean;
    validateActionOutput: boolean;
    validateSyncRecords: boolean;
    validateSyncMetadata: boolean;
}

export interface RuntimeContext {
    plan: DBPlan | null;
}
