import { afterEach, describe, expect, it, vi } from 'vitest';

import { getLogger } from '@nangohq/utils';

import { IntegrationServiceError } from '../../../services/integration.service.js';
import { handleMcpToolError, InternalMcpError } from '../utils.js';
import { createIntegrationServiceErrorToMcp, getIntegrationServiceErrorToMcp, updateIntegrationsServiceErrorToMcp } from './errors.js';

import type { CreateIntegrationServiceError, GetIntegrationServiceError, UpdateIntegrationsServiceError } from '../../../services/integration.service.js';

describe('integration service MCP error mapping', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        {
            operation: 'creating',
            mapError: (error: IntegrationServiceError) => createIntegrationServiceErrorToMcp(error as CreateIntegrationServiceError)
        },
        {
            operation: 'getting',
            mapError: (error: IntegrationServiceError) => getIntegrationServiceErrorToMcp(error as GetIntegrationServiceError)
        },
        {
            operation: 'updating',
            mapError: (error: IntegrationServiceError) => updateIntegrationsServiceErrorToMcp(error as UpdateIntegrationsServiceError)
        }
    ])('returns an explicit 500 and logs an unexpected error code while $operation an integration', ({ operation, mapError }) => {
        const errorSpy = spyOnLoggerError();
        const serviceError = new IntegrationServiceError({ code: 'get_failed', message: 'sensitive internal error' });
        Object.assign(serviceError, { code: 'unexpected_code' });

        const error = mapError(serviceError);

        expect(error).toBeInstanceOf(InternalMcpError);
        expect(error).toMatchObject({ status: 500, message: 'Internal error' });
        expect(errorSpy).toHaveBeenCalledWith(`Unexpected IntegrationService error code while ${operation} integration`, { code: 'unexpected_code' });
        expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('sensitive internal error');
        expect(handleMcpToolError(error, `integrations_${operation}`)).toStrictEqual({
            content: [{ type: 'text', text: 'Internal error' }],
            isError: true
        });
    });
});

function spyOnLoggerError() {
    const integrationLogger = getLogger('Server.MCP.Integrations');
    let errorPrototype: object = integrationLogger;
    while (errorPrototype && !Object.prototype.hasOwnProperty.call(errorPrototype, 'error')) {
        errorPrototype = Object.getPrototypeOf(errorPrototype) as object;
    }
    return vi.spyOn(errorPrototype as { error: (...args: unknown[]) => unknown }, 'error').mockImplementation(() => undefined);
}
