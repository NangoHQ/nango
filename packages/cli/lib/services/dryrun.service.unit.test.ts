import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixturesPath } from '../tests/helpers.js';
import { Err, Ok } from '../utils/result.js';
import { bundleFile } from '../zeroYaml/compile.js';
import { DryRunService } from './dryrun.service.js';
import { NangoActionCLI } from './sdk.js';

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

const functionCapabilities = {
    usesRecords: false,
    usesCheckpoints: false,
    usesMetadata: false,
    usesOutbound: true,
    usesInvoke: false
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
        vi.unstubAllEnvs();
    });

    it('returns a Result success when the dry run completes', async () => {
        const service = buildService();
        vi.spyOn(service, 'runScript').mockResolvedValue({ success: true, error: null, response: null } as any);

        const result = await service.run({ sync: 'syncIssues', connectionId: 'conn-1' } as any);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toBeUndefined();
        }
    });

    it.each([
        { factory: 'createFunction', name: 'echoFunction', filePath: './github/functions/echoFunction.ts' },
        { factory: 'createTool', name: 'echo_tool', filePath: './github/tools/echoTool.ts' }
    ])('resolves and dry runs a function', async ({ name, filePath }) => {
        mocks.parseIntegrationDefinitions.mockResolvedValue(
            Ok({
                ...parsedDefinitions,
                integrations: [{ ...parsedDefinitions.integrations[0], syncs: [] }],
                functions: [{ name, integrationId: 'github', filePath, trigger: { kind: 'none' } }]
            } as any)
        );
        const service = buildService();
        const runScript = vi.spyOn(service, 'runScript').mockResolvedValue({ success: true, error: null, response: null } as any);
        const input = { message: 'Hello from dryrun' };

        const result = await service.run({ sync: name, connectionId: 'conn-1', input: JSON.stringify(input) } as any);

        expect(result.isErr() ? result.error.message : undefined).toBeUndefined();
        expect(result.isOk()).toBe(true);
        expect(runScript).toHaveBeenCalledWith(
            expect.objectContaining({
                syncName: name,
                input,
                filePath,
                nangoProps: expect.objectContaining({ scriptType: 'function', providerConfigKey: 'github' })
            })
        );
    });

    it.each([
        {
            factory: 'createFunction',
            name: 'echoFunction',
            filePath: './github/functions/echoFunction.ts',
            bundleName: 'github_functions_echoFunction.cjs',
            source: 'createFunction.valid.js',
            trigger: { kind: 'none' },
            input: '{"id":"123"}',
            output: undefined
        },
        {
            factory: 'createTool',
            name: 'echo_tool',
            filePath: './github/tools/getIssue.ts',
            bundleName: 'github_tools_getIssue.cjs',
            source: 'createTool.valid.js',
            trigger: { kind: 'http' },
            input: '{"id":"123"}',
            output: { ok: true }
        },
        {
            factory: 'createFunction using an HTTP response',
            name: 'httpResponse',
            filePath: './github/functions/httpResponse.ts',
            bundleName: 'github_functions_httpResponse.cjs',
            source: '../../replay/github/functions/echo.js',
            trigger: { kind: 'http' },
            input: '{"id":"123"}',
            output: {
                title: 'Recorded issue',
                responseStatus: 200,
                responseRequestId: 'recorded-response',
                method: 'POST',
                path: '/',
                event: '',
                source: '',
                connectionId: 'conn-1',
                subscriptions: []
            }
        },
        {
            factory: 'scheduled createFunction',
            name: 'scheduleFunction',
            filePath: './github/functions/scheduleFunction.ts',
            bundleName: 'github_functions_scheduleFunction.cjs',
            source: 'createFunction.schedule.valid.js',
            trigger: { kind: 'schedule', frequency: 'every day' },
            input: undefined,
            output: { kind: 'schedule', input: null }
        },
        {
            factory: 'event createFunction',
            name: 'eventFunction',
            filePath: './github/functions/eventFunction.ts',
            bundleName: 'github_functions_eventFunction.cjs',
            source: 'createFunction.event.valid.js',
            trigger: { kind: 'event', events: ['post-connection-creation', 'pre-connection-deletion'] },
            input: '{"event":"pre-connection-deletion"}',
            output: { kind: 'event', event: 'pre-connection-deletion' }
        }
    ])('executes a compiled $factory bundle', async ({ name, filePath, bundleName, source, trigger, input, output }) => {
        vi.stubEnv('NANGO_SECRET_KEY', 'test-secret-key');
        mocks.parseIntegrationDefinitions.mockResolvedValue(
            Ok({
                ...parsedDefinitions,
                integrations: [{ ...parsedDefinitions.integrations[0], syncs: [] }],
                functions: [{ name, integrationId: 'github', filePath, capabilities: functionCapabilities, trigger }]
            } as any)
        );
        const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nango-dryrun-'));
        try {
            const bundled = await bundleFile({ entryPoint: path.join(fixturesPath, 'zero/cases', source), projectRootPath: fixturesPath });
            expect(bundled.isOk()).toBe(true);
            await fs.mkdir(path.join(projectPath, 'build'));
            await fs.writeFile(path.join(projectPath, 'build', bundleName), bundled.unwrap());
            const proxy = vi.spyOn(NangoActionCLI.prototype, 'proxy').mockResolvedValue({
                data: { title: 'Recorded issue' },
                status: 200,
                headers: { 'x-request-id': 'recorded-response' }
            } as any);
            const service = new DryRunService({ fullPath: projectPath, validation: false, environment: 'dev' });

            const result = await service.run({ sync: name, connectionId: 'conn-1', input } as any);

            expect(result.isErr() ? result.error.message : undefined).toBeUndefined();
            expect(result.isOk()).toBe(true);
            if (output === undefined) {
                expect(proxy).toHaveBeenCalledWith({ endpoint: '/repos/NangoHQ/nango/issues' });
                expect(console.log).toHaveBeenCalledWith('no output');
            } else {
                expect(console.log).toHaveBeenCalledWith(JSON.stringify(output, null, 2));
            }
        } finally {
            await fs.rm(projectPath, { recursive: true, force: true });
        }
    });

    it.each([{ subscriptions: ['issues.opened'] }, { subscriptions: [] }, { subscriptions: undefined }])(
        'executes and records an HTTP trigger with subscriptions $subscriptions',
        async ({ subscriptions }) => {
            vi.stubEnv('NANGO_SECRET_KEY', 'test-secret-key');
            mocks.parseIntegrationDefinitions.mockResolvedValue(
                Ok({
                    ...parsedDefinitions,
                    integrations: [{ ...parsedDefinitions.integrations[0], syncs: [] }],
                    functions: [
                        {
                            name: 'httpFunction',
                            integrationId: 'github',
                            filePath: './github/functions/httpFunction.ts',
                            capabilities: functionCapabilities,
                            trigger: { kind: 'http', subscriptions: ['issues.opened', 'issues.closed'] }
                        }
                    ]
                } as any)
            );
            const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nango-http-dryrun-'));
            try {
                const bundled = await bundleFile({
                    entryPoint: path.join(fixturesPath, 'zero/cases/createFunction.http.valid.js'),
                    projectRootPath: fixturesPath
                });
                await fs.mkdir(path.join(projectPath, 'build'));
                await fs.writeFile(path.join(projectPath, 'build/github_functions_httpFunction.cjs'), bundled.unwrap());
                const request = {
                    method: 'PATCH',
                    path: '/webhooks/issues',
                    headers: { 'x-event': 'issues.opened' },
                    query: { source: 'test' },
                    body: { id: '123' }
                };
                const service = new DryRunService({ fullPath: projectPath, validation: false, environment: 'dev' });
                const result = await service.run({
                    sync: 'httpFunction',
                    connectionId: 'conn-1',
                    triggerHttp: JSON.stringify({ ...request, subscriptions }),
                    saveResponses: true
                });
                expect(result.isErr() ? result.error.message : undefined).toBeUndefined();
                expect(result.isOk()).toBe(true);
                const fixture = JSON.parse(await fs.readFile(path.join(projectPath, 'github/tests/httpFunction.test.json'), 'utf8'));
                expect(fixture.output).toEqual({ input: request.body, request, subscriptions: subscriptions ?? null });
                expect(fixture.triggerHttp).toEqual(request);
                expect(fixture.trigger.request).toEqual(request);
                if (subscriptions === undefined) {
                    expect(fixture.trigger).not.toHaveProperty('subscriptions');
                } else {
                    expect(fixture.trigger.subscriptions).toEqual(subscriptions);
                }
            } finally {
                await fs.rm(projectPath, { recursive: true, force: true });
            }
        }
    );

    it('rejects --input for a schedule-triggered function', async () => {
        mocks.parseIntegrationDefinitions.mockResolvedValue(
            Ok({
                ...parsedDefinitions,
                integrations: [{ ...parsedDefinitions.integrations[0], syncs: [] }],
                functions: [{ name: 'scheduleFunction', integrationId: 'github', trigger: { kind: 'schedule', frequency: 'every day' } }]
            } as any)
        );

        const result = await buildService().run({ sync: 'scheduleFunction', connectionId: 'conn-1', input: '{"since":"2024"}' } as any);

        expect(result.isErr() ? result.error.message : undefined).toBe('--input is not supported for functions with a schedule trigger');
    });

    it('requires an integration when multiple integrations contain the same native function name', async () => {
        mocks.parseIntegrationDefinitions.mockResolvedValue(
            Ok({
                ...parsedDefinitions,
                integrations: [
                    { ...parsedDefinitions.integrations[0], syncs: [] },
                    { ...parsedDefinitions.integrations[0], providerConfigKey: 'github-other', syncs: [] }
                ],
                functions: [
                    { name: 'echo', integrationId: 'github' },
                    { name: 'echo', integrationId: 'github-other' }
                ]
            } as any)
        );

        const result = await buildService().run({ sync: 'echo', connectionId: 'conn-1' } as any);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('Multiple integrations contain a script named "echo". Please use "--integration-id"');
        }
        expect(mocks.getConnection).not.toHaveBeenCalled();
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

    it('returns a Result error when checkpoint JSON is invalid', async () => {
        const result = await buildService().run({ sync: 'syncIssues', connectionId: 'conn-1', checkpoint: '{"cursor":{"nested":true}}' } as any);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toContain('Invalid checkpoint');
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
