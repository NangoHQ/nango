import type { RunnerOutputError, TelemetryBag } from '@nangohq/types';

export abstract class SDKError extends Error {
    abstract code: string;
    payload: Record<string, unknown>;

    constructor(payload?: Record<string, unknown>) {
        super();
        this.payload = payload || {};
    }
}

export class AbortedSDKError extends SDKError {
    code = 'script_aborted';
}

export class UnknownProviderSDKError extends SDKError {
    code = 'unknown_provider_template_in_config';
}

export class InvalidRecordSDKError extends SDKError {
    code = 'invalid_sync_record';
}

export class InvalidActionInputSDKError extends SDKError {
    code = 'invalid_action_input';
}

export class InvalidActionOutputSDKError extends SDKError {
    code = 'invalid_action_output';
}

/**
 * For external use only
 */
export class ActionError<T = Record<string, unknown>> extends Error {
    type: string;
    payload?: Record<string, unknown>;

    constructor(payload?: T) {
        super();
        this.type = 'action_script_runtime_error';
        if (payload) {
            this.payload = payload;
        }
    }
}

export class ExecutionError extends Error {
    type: string;
    payload: RunnerOutputError['payload'];
    status: RunnerOutputError['status'];
    additional_properties: RunnerOutputError['additional_properties'];
    telemetryBag: TelemetryBag;

    constructor(payload: RunnerOutputError & { telemetryBag: TelemetryBag }) {
        super();
        this.type = payload.type;
        this.payload = payload.payload;
        this.status = payload.status;
        this.additional_properties = payload.additional_properties;
        this.telemetryBag = payload.telemetryBag;
    }

    toJSON(): RunnerOutputError {
        return {
            type: this.type,
            payload: this.payload,
            status: this.status,
            additional_properties: this.additional_properties
        };
    }
}
