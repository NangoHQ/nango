import { APIError } from '@/utils/api';

const mfaErrorMessages: Record<string, string> = {
    invalid_mfa_code: 'Invalid verification code. Try again.',
    mfa_code_required: 'Enter your two-factor code to continue.',
    mfa_already_enabled: 'Two-factor authentication is already enabled.',
    mfa_enrollment_not_found: 'Start setup again before confirming.',
    mfa_not_enabled: 'Two-factor authentication is not enabled.'
};

/** Message for a known MFA error code, or null when the code is not one of ours. */
export function mfaErrorMessage(code: string | undefined): string | null {
    return code && Object.prototype.hasOwnProperty.call(mfaErrorMessages, code) ? mfaErrorMessages[code]! : null;
}

export function getMFAErrorMessage(error: unknown): string {
    if (error instanceof APIError) {
        const json: unknown = error.json;
        if (typeof json === 'object' && json !== null && 'error' in json) {
            const apiError = (json as { error: unknown }).error;
            if (typeof apiError === 'object' && apiError !== null) {
                const { code, message } = apiError as { code?: unknown; message?: unknown };
                const known = mfaErrorMessage(typeof code === 'string' ? code : undefined);
                if (known) {
                    return known;
                }
                if (typeof message === 'string') {
                    return message;
                }
            }
        }
    }
    return 'Something went wrong. Please try again.';
}
