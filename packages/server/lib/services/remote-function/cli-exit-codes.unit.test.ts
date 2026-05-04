import { describe, expect, it } from 'vitest';

import {
    NANGO_CLI_COMPILE_ERROR_EXIT_CODE,
    NANGO_CLI_DEPLOY_ERROR_EXIT_CODE,
    NANGO_CLI_DRYRUN_ERROR_EXIT_CODE,
    getDeployErrorCode,
    getDryrunErrorCode
} from './cli-exit-codes.js';

describe('remote function CLI exit codes', () => {
    it('maps deploy exit codes to API error codes', () => {
        expect(getDeployErrorCode({ exitCode: NANGO_CLI_COMPILE_ERROR_EXIT_CODE })).toBe('compilation_error');
        expect(getDeployErrorCode({ exitCode: NANGO_CLI_DEPLOY_ERROR_EXIT_CODE })).toBe('deployment_error');
        expect(getDeployErrorCode({ code: NANGO_CLI_COMPILE_ERROR_EXIT_CODE })).toBe('compilation_error');
        expect(getDeployErrorCode({ code: String(NANGO_CLI_DEPLOY_ERROR_EXIT_CODE) })).toBe('deployment_error');
    });

    it('maps dryrun exit codes to API error codes', () => {
        expect(getDryrunErrorCode({ exitCode: NANGO_CLI_COMPILE_ERROR_EXIT_CODE })).toBe('compilation_error');
        expect(getDryrunErrorCode({ exitCode: NANGO_CLI_DRYRUN_ERROR_EXIT_CODE })).toBe('dryrun_error');
        expect(getDryrunErrorCode({ code: NANGO_CLI_COMPILE_ERROR_EXIT_CODE })).toBe('compilation_error');
        expect(getDryrunErrorCode({ code: String(NANGO_CLI_DRYRUN_ERROR_EXIT_CODE) })).toBe('dryrun_error');
    });

    it('defaults unknown failures to command-specific errors', () => {
        expect(getDeployErrorCode({ exitCode: 1 })).toBe('deployment_error');
        expect(getDryrunErrorCode({ exitCode: 1 })).toBe('dryrun_error');
        expect(getDeployErrorCode(new Error('failed'))).toBe('deployment_error');
        expect(getDryrunErrorCode(new Error('failed'))).toBe('dryrun_error');
    });
});
