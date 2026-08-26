import { describe, expect, it, vi } from 'vitest';

import { RunSyncCommandError } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';

import { InternalMcpError, PublicMcpError } from '../utils.js';
import { syncCommandErrorToMcp } from './errors.js';

describe('syncCommandErrorToMcp', () => {
    it.each([
        { code: 'no_syncs_found' as const, message: 'No syncs found given the inputs.' },
        { code: 'unknown_connection' as const, message: 'Connection does not exist' },
        { code: 'unknown_provider_config' as const, message: 'Integration does not exist' }
    ])('maps $code to a public error', ({ code, message }) => {
        const result = syncCommandErrorToMcp(new RunSyncCommandError(code));

        expect(result).toBeInstanceOf(PublicMcpError);
        expect(result.message).toBe(message);
    });

    it('logs unexpected service error codes and keeps them private', () => {
        const error = new RunSyncCommandError('unknown_provider_config');
        Object.assign(error, { code: 'unexpected_code' });
        const controllerLogger = getLogger('Server.MCP.Syncs');
        let errorPrototype: object = controllerLogger;
        while (errorPrototype && !Object.prototype.hasOwnProperty.call(errorPrototype, 'error')) {
            errorPrototype = Object.getPrototypeOf(errorPrototype) as object;
        }
        const errorSpy = vi.spyOn(errorPrototype as { error: (...args: unknown[]) => unknown }, 'error').mockImplementation(() => undefined);

        try {
            const result = syncCommandErrorToMcp(error);

            expect(result).toBeInstanceOf(InternalMcpError);
            expect(errorSpy).toHaveBeenCalledWith('Unexpected RunSyncCommandError code while running sync command', { code: 'unexpected_code' });
        } finally {
            errorSpy.mockRestore();
        }
    });
});
