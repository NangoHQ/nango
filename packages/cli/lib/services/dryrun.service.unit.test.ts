import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getConfig: vi.fn(),
    getConnection: vi.fn(),
    parseIntegrationDefinitions: vi.fn(),
    parseSecretKey: vi.fn()
}));

vi.mock('../utils.js', () => ({
    getConfig: mocks.getConfig,
    getConnection: mocks.getConnection,
    parseSecretKey: mocks.parseSecretKey,
    printDebug: vi.fn(),
    resolveHostport: () => 'https://api.nango.dev'
}));

vi.mock('../zeroYaml/definitions.js', () => ({
    parseIntegrationDefinitions: mocks.parseIntegrationDefinitions
}));

import { DryRunService } from './dryrun.service.js';
import { Err, Ok } from '../utils/result.js';

const parsedDefinitions = {
    integrations: [
        {
            providerConfigKey: 'github',
            syncs: [
                {
                    name: 'syncIssues',
                    type: 'sync',
                    output: [],
                    json_schema: null
                }
            ],
            actions: [],
            onEventScripts: { 'post-connection-creation': [], 'pre-connection-deletion': [], 'validate-connection': [] }
        }
    ]
};

function buildService() {
    return new DryRunService({ fullPath: '/tmp/nango-integrations', validation: false, environment: 'dev' });
}

describe('DryRunService', () => {
    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        mocks.parseSecretKey.mockResolvedValue(undefined);
        mocks.parseIntegrationDefinitions.mockResolvedValue(Ok(parsedDefinitions as any));
        mocks.getConnection.mockResolvedValue(
            Ok({
                id: 1,
                connection_id: 'conn-1',
                provider_config_key: 'github'
            } as any)
        );
        mocks.getConfig.mockResolvedValue(Ok({ data: { provider: 'github' } } as any));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it('returns a Result error when the environment is missing', async () => {
        const service = new DryRunService({ fullPath: '/tmp/nango-integrations', validation: false });

        const result = await service.run({ sync: 'syncIssues', connectionId: 'conn-1' } as any);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('Environment is required');
        }
        expect(mocks.parseSecretKey).not.toHaveBeenCalled();
    });

    it('returns a Result error when no script matches', async () => {
        const result = await buildService().run({ sync: 'missingSync', connectionId: 'conn-1' } as any);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('No script matched "missingSync"');
        }
        expect(mocks.getConnection).not.toHaveBeenCalled();
    });

    it('returns a Result error when connection lookup fails', async () => {
        mocks.getConnection.mockResolvedValue(Err(new Error('connection lookup failed')));

        const result = await buildService().run({ sync: 'syncIssues', connectionId: 'conn-1' } as any);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('connection lookup failed');
        }
    });

    it('returns a Result error when config lookup fails', async () => {
        mocks.getConfig.mockResolvedValue(Err(new Error('config lookup failed')));

        const result = await buildService().run({ sync: 'syncIssues', connectionId: 'conn-1' } as any);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('config lookup failed');
        }
    });

    it('returns a Result error when input JSON cannot be parsed', async () => {
        const result = await buildService().run({ sync: 'syncIssues', connectionId: 'conn-1', input: '{bad json' } as any);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('Failed to parse --input');
        }
    });

    it('returns a Result error when script execution fails', async () => {
        const service = buildService();
        vi.spyOn(service, 'runScript').mockResolvedValue({ success: false, error: new Error('script failed'), response: null });

        const result = await service.run({ sync: 'syncIssues', connectionId: 'conn-1' } as any);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('script failed');
        }
    });
});
