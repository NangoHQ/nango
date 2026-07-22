import { APIError } from '@/utils/api';

const mfaErrorMessages: Record<string, string> = {
    invalid_mfa_code: 'Invalid verification code. Try again.',
    mfa_already_enabled: 'Two-factor authentication is already enabled.',
    mfa_enrollment_not_found: 'Start setup again before confirming.',
    mfa_not_enabled: 'Two-factor authentication is not enabled.'
};

export function getMFAErrorMessage(error: unknown): string {
    if (error instanceof APIError) {
        const json: unknown = error.json;
        if (typeof json === 'object' && json !== null && 'error' in json) {
            const apiError = (json as { error: unknown }).error;
            if (typeof apiError === 'object' && apiError !== null) {
                const { code, message } = apiError as { code?: unknown; message?: unknown };
                if (typeof code === 'string' && code in mfaErrorMessages) {
                    return mfaErrorMessages[code]!;
                }
                if (typeof message === 'string') {
                    return message;
                }
            }
        }
    }
    return 'Something went wrong. Please try again.';
}
