import { describe, expect, it } from 'vitest';

import { getDeployErrorCode, getDryrunErrorCode } from './cli-exit-codes.js';

describe('remote function CLI exit codes', () => {
    it('maps deploy exit codes to API error codes', () => {
        expect(getDeployErrorCode({ exitCode: 10 })).toBe('compilation_error');
        expect(getDeployErrorCode({ exitCode: 11 })).toBe('deployment_error');
        expect(getDeployErrorCode({ code: 10 })).toBe('compilation_error');
        expect(getDeployErrorCode({ code: '11' })).toBe('deployment_error');
    });

    it('maps dryrun exit codes to API error codes', () => {
        expect(getDryrunErrorCode({ exitCode: 10 })).toBe('compilation_error');
        expect(getDryrunErrorCode({ exitCode: 12 })).toBe('dryrun_error');
        expect(getDryrunErrorCode({ code: 10 })).toBe('compilation_error');
        expect(getDryrunErrorCode({ code: '12' })).toBe('dryrun_error');
    });

    it('defaults unknown failures to command-specific errors', () => {
        expect(getDeployErrorCode({ exitCode: 1 })).toBe('deployment_error');
        expect(getDryrunErrorCode({ exitCode: 1 })).toBe('dryrun_error');
        expect(getDeployErrorCode(new Error('failed'))).toBe('deployment_error');
        expect(getDryrunErrorCode(new Error('failed'))).toBe('dryrun_error');
    });
});
