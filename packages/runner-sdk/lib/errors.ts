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
