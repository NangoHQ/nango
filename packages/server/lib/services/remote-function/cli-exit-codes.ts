import type { FunctionErrorCode } from '@nangohq/types';

// Keep in sync with packages/cli/lib/exit-codes.ts.
export const NANGO_CLI_COMPILE_ERROR_EXIT_CODE = 10;
export const NANGO_CLI_DEPLOY_ERROR_EXIT_CODE = 11;
export const NANGO_CLI_DRYRUN_ERROR_EXIT_CODE = 12;

export function getCommandExitCode(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') {
        return undefined;
    }

    const err = error as Record<string, unknown>;
    const exitCode = err['exitCode'];
    if (typeof exitCode === 'number') {
        return exitCode;
    }

    const code = err['code'];
    if (typeof code === 'number') {
        return code;
    }
    if (typeof code === 'string') {
        const parsed = Number(code);
        if (Number.isInteger(parsed) && String(parsed) === code) {
            return parsed;
        }
    }

    return undefined;
}

export function getDeployErrorCode(error: unknown): Extract<FunctionErrorCode, 'compilation_error' | 'deployment_error'> {
    switch (getCommandExitCode(error)) {
        case NANGO_CLI_COMPILE_ERROR_EXIT_CODE:
            return 'compilation_error';
        case NANGO_CLI_DEPLOY_ERROR_EXIT_CODE:
        default:
            return 'deployment_error';
    }
}

export function getDryrunErrorCode(error: unknown): Extract<FunctionErrorCode, 'compilation_error' | 'dryrun_error'> {
    switch (getCommandExitCode(error)) {
        case NANGO_CLI_COMPILE_ERROR_EXIT_CODE:
            return 'compilation_error';
        case NANGO_CLI_DRYRUN_ERROR_EXIT_CODE:
        default:
            return 'dryrun_error';
    }
}
