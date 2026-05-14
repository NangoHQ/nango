import { NangoCliExitCode } from '@nangohq/utils';

import type { FunctionErrorCode } from '@nangohq/types';

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
        case NangoCliExitCode.CompileError:
            return 'compilation_error';
        case NangoCliExitCode.DeployError:
        default:
            return 'deployment_error';
    }
}

export function getDryrunErrorCode(error: unknown): Extract<FunctionErrorCode, 'compilation_error' | 'dryrun_error'> {
    switch (getCommandExitCode(error)) {
        case NangoCliExitCode.CompileError:
            return 'compilation_error';
        case NangoCliExitCode.DryrunError:
        default:
            return 'dryrun_error';
    }
}
