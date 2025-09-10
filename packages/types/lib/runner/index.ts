import type { TelemetryBag } from './sdk.js';

export interface RunnerOutputError {
    type: string;
    payload: Record<string, unknown> | unknown[];
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
