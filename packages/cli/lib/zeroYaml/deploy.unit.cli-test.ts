import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import promptly from 'promptly';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '../utils/result.js';
import { tsToJsPath } from './compile.js';
import { parseIntegrationDefinitions } from './definitions.js';
import { deploy } from './deploy.js';

import type { DeployOptions } from '../types.js';
import type { FunctionConfig, ParsedIntegrationDefinitions } from './definitions.js';
import type { FunctionDeploymentBundleSuccess, PostDeploy, PostDeployConfirmation } from '@nangohq/types';

vi.mock('promptly', () => ({ default: { confirm: vi.fn() } }));
vi.mock('./definitions.js', () => ({ parseIntegrationDefinitions: vi.fn() }));

const githubFunction = functionConfig({ integrationId: 'github', name: 'fetch' });
const slackFunction = functionConfig({ integrationId: 'slack', name: 'other' });

const githubIntegration = {
    providerConfigKey: 'github',
    syncs: [],
    actions: [
        {
            name: 'legacy',
            type: 'action',
            description: 'Legacy action',
            input: null,
            output: [],
            endpoint: null,
            scopes: [],
            usedModels: [],
            version: '',
            json_schema: { definitions: {} },
            features: []
        }
    ],
    onEventScripts: {
        'post-connection-creation': [],
        'pre-connection-deletion': [],
        'validate-connection': []
    }
} satisfies ParsedIntegrationDefinitions['integrations'][number];

const parsed = {
    yamlVersion: 'v2',
    models: new Map(),
    integrations: [githubIntegration],
    functions: [githubFunction, slackFunction],
    entryPoints: [
        { filePath: './github/actions/legacy.ts', integrationId: 'github', type: 'action', name: 'legacy' },
        { filePath: githubFunction.filePath, integrationId: 'github', type: 'function', name: 'fetch' },
        { filePath: slackFunction.filePath, integrationId: 'slack', type: 'function', name: 'other' }
    ],
    hasExperimentalFunctions: true
} satisfies ParsedIntegrationDefinitions;

const legacyConfirmation = {
    newSyncs: [],
    updatedSyncs: [],
    deletedSyncs: [],
    newActions: [],
    updatedActions: [],
    deletedActions: [],
    deletedModels: [],
    newOnEventScripts: [],
    updatedOnEventScripts: [],
    deletedOnEventScripts: []
} satisfies PostDeployConfirmation['Success'];

const legacyChangeConfirmation = {
    ...legacyConfirmation,
    updatedActions: [{ providerConfigKey: 'github', name: 'legacy' }]
} satisfies PostDeployConfirmation['Success'];

const legacyDeploymentResult = [{ name: 'legacy', version: '42', providerConfigKey: 'github', type: 'action', models: [] }] satisfies PostDeploy['Success'];

const legacyOnlyParsed = {
    ...parsed,
    functions: [],
    entryPoints: parsed.entryPoints.filter((entryPoint) => entryPoint.type !== 'function'),
    hasExperimentalFunctions: false
} satisfies ParsedIntegrationDefinitions;

const functionsOnlyParsed = {
    ...parsed,
    integrations: parsed.integrations.map((integration) => ({ ...integration, syncs: [], actions: [] })),
    entryPoints: parsed.entryPoints.filter((entryPoint) => entryPoint.type === 'function')
} satisfies ParsedIntegrationDefinitions;

const multiIntegrationLegacyParsed = {
    ...legacyOnlyParsed,
    integrations: [
        {
            ...githubIntegration,
            syncs: [
                {
                    name: 'contacts',
                    type: 'sync',
                    endpoints: [],
                    description: 'Contacts',
                    sync_type: 'full',
                    track_deletes: false,
                    auto_start: true,
                    runs: 'every day',
                    scopes: [],
                    input: null,
                    output: [],
                    usedModels: [],
                    webhookSubscriptions: [],
                    version: '',
                    json_schema: { definitions: {} },
                    features: []
                }
            ]
        },
        { ...githubIntegration, providerConfigKey: 'slack' }
    ],
    entryPoints: [
        { filePath: './github/actions/legacy.ts', integrationId: 'github', type: 'action', name: 'legacy' },
        { filePath: './github/syncs/contacts.ts', integrationId: 'github', type: 'sync', name: 'contacts' },
        { filePath: './slack/actions/legacy.ts', integrationId: 'slack', type: 'action', name: 'legacy' }
    ]
} satisfies ParsedIntegrationDefinitions;

const noFunctionChanges = {
    created: [],
    updated: [],
    unchanged: [{ integrationId: 'github', name: 'fetch' }],
    deleted: []
} satisfies FunctionDeploymentBundleSuccess;

describe('deploy', () => {
    let fullPath: string;
    let fetchMock: ReturnType<typeof vi.fn>;
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        fullPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nango-cli-deploy-'));
        await writeProject(fullPath);

        vi.mocked(parseIntegrationDefinitions).mockReset();
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(parsed));
        vi.mocked(promptly.confirm).mockReset();
        vi.mocked(promptly.confirm).mockResolvedValue(false);
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.stubEnv('NANGO_SECRET_KEY', 'secret');
        vi.stubEnv('NANGO_CLI_TELEMETRY', 'false');
        vi.stubEnv('NANGO_DEPLOY_AUTO_CONFIRM', undefined);
    });

    afterEach(async () => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        await fs.rm(fullPath, { recursive: true, force: true });
    });

    it('previews both families before deploying them in order with one summary', async () => {
        const functionChanges = { ...noFunctionChanges, updated: [{ integrationId: 'github', name: 'fetch' }] };
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ ...legacyChangeConfirmation, deletedActions: [{ providerConfigKey: 'github', name: 'old-action' }] }))
            .mockResolvedValueOnce(jsonResponse(functionChanges))
            .mockResolvedValueOnce(jsonResponse(legacyDeploymentResult))
            .mockResolvedValueOnce(jsonResponse(functionChanges));

        const result = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        expect(result.isOk()).toBe(true);
        expect(fetchMock.mock.calls.map(([url]) => (url as URL).pathname)).toEqual([
            '/sync/deploy/confirmation',
            '/functions/deployments/bundle/preview',
            '/sync/deploy',
            '/functions/deployments/bundle'
        ]);
        const output = logOutput(logSpy);
        expect(output.match(/Nango will perform this plan:/g)).toHaveLength(1);
        expect(output.match(/Summary/g)).toHaveLength(1);
        expect(output).toContain('↳ Actions');
        expect(output).toContain('↳ Functions');
        expect(output).toContain('✓ Deployed');
        expect(output.match(/Successfully deployed:/g)).toHaveLength(1);
        expect(output).toContain('- github → legacy@v42');
        expect(output).toContain('- github → fetch');
        expect(output).toContain('Successfully removed:');
        expect(output).toContain('- github → old-action');
        expect(output.indexOf('✓ Deployed')).toBeLessThan(output.indexOf('Successfully deployed:'));
        expect(promptly.confirm).not.toHaveBeenCalled();
    });

    it('scopes both families to the selected integration and only overrides sync/action versions', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(legacyChangeConfirmation))
            .mockResolvedValueOnce(jsonResponse(noFunctionChanges))
            .mockResolvedValueOnce(jsonResponse(legacyDeploymentResult))
            .mockResolvedValueOnce(jsonResponse(noFunctionChanges));

        const result = await deploy({
            fullPath,
            environmentName: 'test',
            interactive: false,
            options: deployOptions({ integration: 'github', version: '42' })
        });

        expect(result.isOk()).toBe(true);
        const bodies = fetchMock.mock.calls.map(([, request]) => JSON.parse((request as RequestInit).body as string) as Record<string, unknown>);
        expect(bodies[0]).toMatchObject({ deployMode: 'integration', flowConfigs: [{ providerConfigKey: 'github', version: '42' }] });
        expect(bodies[1]).toMatchObject({
            reconciliationScope: { kind: 'integration', integrationId: 'github' },
            functions: [{ integrationId: 'github', name: 'fetch' }]
        });
        expect(bodies[2]).toMatchObject({ flowConfigs: bodies[0]?.['flowConfigs'] });
        expect(bodies[3]).toEqual(bodies[1]);
        expect(logOutput(logSpy).match(/The --version option/g)).toHaveLength(1);
        expect(logOutput(logSpy).indexOf('✓ Packaging')).toBeLessThan(logOutput(logSpy).indexOf('The --version option'));
        expect(logOutput(logSpy)).not.toContain('No changes');
        expect(logOutput(logSpy)).toContain('- github → legacy@v42');
    });

    it.each([
        { name: 'unknown integration', options: { integration: 'missing' }, message: 'No local definitions found for integration "missing"' },
        { name: 'conflicting selectors', options: { sync: 'contacts', action: 'legacy' }, message: 'The --sync and --action options cannot be used together' }
    ])('rejects $name without contacting the API', async ({ options, message }) => {
        const result = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions(options) });

        expect(result.isErr()).toBe(true);
        expect(logOutput(logSpy)).toContain(message);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(['legacy', 'functions'] as const)('does not contact the API when %s packaging fails in a mixed project', async (family) => {
        if (family === 'legacy') {
            await fs.rm(path.join(fullPath, 'github', 'actions', 'legacy.ts'));
        } else {
            await fs.rm(path.join(fullPath, 'build', 'github_functions_fetch.cjs'));
        }

        const result = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        expect(result.isErr()).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(['legacy', 'functions'] as const)('does not deploy either family when the %s preview fails', async (family) => {
        const previewError = jsonResponse({ error: { code: 'server_error', message: 'Preview failed' } });
        fetchMock
            .mockResolvedValueOnce(family === 'legacy' ? previewError : jsonResponse(legacyConfirmation))
            .mockResolvedValueOnce(family === 'functions' ? previewError : jsonResponse(noFunctionChanges));

        const result = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        expect(result.isErr()).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(logOutput(logSpy)).not.toContain('✓ Deployed');
    });

    it.each(['legacy', 'functions'] as const)('clearly reports each outcome when the %s deployment fails', async (family) => {
        fetchMock.mockResolvedValueOnce(jsonResponse(legacyConfirmation)).mockResolvedValueOnce(jsonResponse(noFunctionChanges));
        if (family === 'functions') {
            fetchMock.mockResolvedValueOnce(jsonResponse(legacyDeploymentResult)).mockRejectedValueOnce(new Error('Connection lost'));
        } else {
            fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'server_error', message: 'Apply failed' } }));
        }

        const result = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        expect(result.isErr()).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(family === 'legacy' ? 3 : 4);
        const output = logOutput(logSpy);
        expect(output).toContain(`Syncs/actions/on-events: ${family === 'legacy' ? 'failed' : 'completed'}`);
        expect(output).toContain(`Functions: ${family === 'legacy' ? 'not attempted' : 'failed'}`);
        expect(output).toContain(family === 'legacy' ? 'Deployment failed.' : 'Deployment partially completed.');
        expect(output).toContain('The failed request may have applied changes');
        expect(output).not.toContain('✓ Deployed');
        if (family === 'functions') {
            expect(output).toContain('- github → legacy@v42');
            expect(output.indexOf('✗ Deploying')).toBeLessThan(output.indexOf('Successfully deployed:'));
        }
    });

    it.each([
        {
            name: 'interactive approval',
            interactive: true,
            autoConfirm: false,
            allowDestructive: false,
            accepted: true,
            succeeds: true,
            prompts: 1
        },
        {
            name: 'interactive rejection',
            interactive: true,
            autoConfirm: false,
            allowDestructive: false,
            accepted: false,
            succeeds: false,
            prompts: 1
        },
        {
            name: 'noninteractive auto-confirm alone',
            interactive: false,
            autoConfirm: true,
            allowDestructive: false,
            accepted: false,
            succeeds: false,
            prompts: 0
        },
        {
            name: 'noninteractive allow-destructive alone',
            interactive: false,
            autoConfirm: false,
            allowDestructive: true,
            accepted: false,
            succeeds: false,
            prompts: 0
        },
        {
            name: 'noninteractive approval flags',
            interactive: false,
            autoConfirm: true,
            allowDestructive: true,
            accepted: false,
            succeeds: true,
            prompts: 0
        }
    ])('handles mixed destructive changes with $name', async ({ interactive, autoConfirm, allowDestructive, accepted, succeeds, prompts }) => {
        const changes = { ...noFunctionChanges, deleted: [{ integrationId: 'github', name: 'removed' }] };
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ ...legacyConfirmation, deletedModels: ['RemovedModel'] }))
            .mockResolvedValueOnce(jsonResponse(changes))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(changes));
        vi.mocked(promptly.confirm).mockImplementationOnce(() => {
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(logOutput(logSpy)).toContain('↳ Actions');
            expect(logOutput(logSpy)).toContain('↳ Functions');
            return Promise.resolve(accepted);
        });

        const result = await deploy({ fullPath, environmentName: 'test', interactive, options: deployOptions({ interactive, autoConfirm, allowDestructive }) });

        expect(result.isOk()).toBe(succeeds);
        expect(promptly.confirm).toHaveBeenCalledTimes(prompts);
        expect(fetchMock).toHaveBeenCalledTimes(succeeds ? 4 : 2);
    });

    it.each(['legacy', 'functions'] as const)('requires confirmation when only %s changes are destructive', async (family) => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ ...legacyConfirmation, deletedModels: family === 'legacy' ? ['RemovedModel'] : [] }))
            .mockResolvedValueOnce(
                jsonResponse({ ...noFunctionChanges, deleted: family === 'functions' ? [{ integrationId: 'github', name: 'removed' }] : [] })
            );

        const result = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        expect(result.isErr()).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(promptly.confirm).not.toHaveBeenCalled();
    });

    it('accepts the environment auto-confirm setting for a mixed deployment', async () => {
        vi.stubEnv('NANGO_DEPLOY_AUTO_CONFIRM', 'true');
        const changes = { ...noFunctionChanges, deleted: [{ integrationId: 'github', name: 'removed' }] };
        fetchMock
            .mockResolvedValueOnce(jsonResponse(legacyConfirmation))
            .mockResolvedValueOnce(jsonResponse(changes))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(changes));

        const result = await deploy({
            fullPath,
            environmentName: 'test',
            interactive: false,
            options: deployOptions({ autoConfirm: false, allowDestructive: true })
        });

        expect(result.isOk()).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(promptly.confirm).not.toHaveBeenCalled();
    });

    it('prints only legacy summary rows for a single action deploy', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(legacyChangeConfirmation)).mockResolvedValueOnce(jsonResponse([]));

        await deploy({
            fullPath,
            environmentName: 'test',
            interactive: false,
            options: deployOptions({ action: 'legacy' })
        });

        const output = logOutput(logSpy);
        expect(output).toContain('↳ Syncs');
        expect(output).toContain('↳ Actions');
        expect(output).toContain('↳ OnEvents');
        expect(output).not.toContain('↳ Functions');
        expect(output).toContain('✓ Deployed');
        expect(output).toContain('No destructive changes, proceeding without confirmation');
        expect(output).toContain('--sync and --action are deprecated');
    });

    describe('with a file', () => {
        const functionChanges = {
            created: [{ integrationId: 'github', name: 'fetch' }],
            updated: [],
            unchanged: [],
            deleted: []
        } satisfies FunctionDeploymentBundleSuccess;

        it.each([
            { label: 'a relative path', file: () => 'github/functions/fetch.ts' },
            { label: 'a ./ relative path', file: () => './github/functions/fetch.ts' },
            { label: 'a path with backslashes', file: () => 'github\\functions\\fetch.ts' },
            { label: 'a .js path', file: () => 'github/functions/fetch.js' },
            { label: 'an absolute path', file: () => path.join(fullPath, 'github', 'functions', 'fetch.ts') }
        ])('deploys only that function from $label in a mixed project', async ({ file }) => {
            fetchMock.mockResolvedValueOnce(jsonResponse(functionChanges)).mockResolvedValueOnce(jsonResponse(functionChanges));

            await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions(), file: file() });

            expect(logOutput(logSpy)).toContain('✓ Deployed');
            for (const [, request] of fetchMock.mock.calls as [URL, RequestInit][]) {
                const body = JSON.parse(request.body as string) as { reconciliationScope: unknown; functions: FunctionConfig[] };
                expect(body.reconciliationScope).toEqual({ kind: 'function', integrationId: 'github', name: 'fetch' });
                expect(body.functions).toEqual([expect.objectContaining({ integrationId: 'github', name: 'fetch' })]);
            }
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('deploys a tool under its declared name', async () => {
            const toolConfig = { ...functionConfig({ integrationId: 'github', name: 'get_issue' }), filePath: './github/tools/getIssue.ts' };
            vi.mocked(parseIntegrationDefinitions).mockResolvedValue(
                Ok({
                    ...parsed,
                    functions: [githubFunction, toolConfig],
                    entryPoints: [...parsed.entryPoints, { filePath: toolConfig.filePath, integrationId: 'github', type: 'function', name: 'get_issue' }]
                })
            );
            await fs.mkdir(path.join(fullPath, 'github', 'tools'), { recursive: true });
            await fs.writeFile(path.join(fullPath, '.nango', 'functions.json'), JSON.stringify([githubFunction, toolConfig]));
            await fs.writeFile(path.join(fullPath, 'github', 'tools', 'getIssue.ts'), 'source tool');
            await fs.writeFile(path.join(fullPath, 'build', 'github_tools_getIssue.cjs'), 'compiled tool');
            const toolChanges = { ...functionChanges, created: [{ integrationId: 'github', name: 'get_issue' }] };
            fetchMock.mockResolvedValueOnce(jsonResponse(toolChanges)).mockResolvedValueOnce(jsonResponse(toolChanges));

            await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions(), file: 'github/tools/getIssue.ts' });

            expect(logOutput(logSpy)).toContain('✓ Deployed');
            const previewRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
            const previewBody = JSON.parse(previewRequest.body as string) as {
                reconciliationScope: unknown;
                functions: (FunctionConfig & { fileBody: { js: string; ts: string } })[];
            };
            expect(previewBody.reconciliationScope).toEqual({ kind: 'function', integrationId: 'github', name: 'get_issue' });
            expect(previewBody.functions).toEqual([expect.objectContaining({ name: 'get_issue', fileBody: { js: 'compiled tool', ts: 'source tool' } })]);
        });

        it('deploys a legacy action as a single script', async () => {
            fetchMock.mockResolvedValueOnce(jsonResponse(legacyChangeConfirmation)).mockResolvedValueOnce(jsonResponse([]));

            await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions(), file: 'github/actions/legacy.ts' });

            const output = logOutput(logSpy);
            expect(output).toContain('✓ Deployed');
            expect(output).not.toContain('--sync and --action are deprecated');
            const confirmationRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
            const confirmationBody = JSON.parse(confirmationRequest.body as string) as PostDeployConfirmation['Body'];
            expect(confirmationBody.deployMode).toBe('single');
            expect(confirmationBody.onEventScriptsByProvider).toBeUndefined();
            expect(confirmationBody.flowConfigs).toEqual([expect.objectContaining({ syncName: 'legacy', providerConfigKey: 'github', type: 'action' })]);
        });

        describe('in a project with legacy scripts sharing names across integrations', () => {
            beforeEach(async () => {
                vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(multiIntegrationLegacyParsed));
                await fs.mkdir(path.join(fullPath, 'github', 'syncs'), { recursive: true });
                await fs.mkdir(path.join(fullPath, 'slack', 'actions'), { recursive: true });
                await fs.writeFile(path.join(fullPath, 'build', 'github_syncs_contacts.cjs'), 'compiled contacts');
                await fs.writeFile(path.join(fullPath, 'github', 'syncs', 'contacts.ts'), 'source contacts');
                await fs.writeFile(path.join(fullPath, 'build', 'slack_actions_legacy.cjs'), 'compiled slack legacy');
                await fs.writeFile(path.join(fullPath, 'slack', 'actions', 'legacy.ts'), 'source slack legacy');
                fetchMock.mockResolvedValueOnce(jsonResponse(legacyChangeConfirmation)).mockResolvedValueOnce(jsonResponse([]));
            });

            it('deploys a legacy sync as a single script', async () => {
                await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions(), file: 'github/syncs/contacts.ts' });

                expect(logOutput(logSpy)).toContain('✓ Deployed');
                const confirmationRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
                const confirmationBody = JSON.parse(confirmationRequest.body as string) as PostDeployConfirmation['Body'];
                expect(confirmationBody.deployMode).toBe('single');
                expect(confirmationBody.flowConfigs).toEqual([
                    expect.objectContaining({
                        syncName: 'contacts',
                        providerConfigKey: 'github',
                        type: 'sync',
                        fileBody: { js: 'compiled contacts', ts: 'source contacts' }
                    })
                ]);
            });

            it("deploys only the file's integration when another integration has an action with the same name", async () => {
                await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions(), file: 'slack/actions/legacy.ts' });

                expect(logOutput(logSpy)).toContain('✓ Deployed');
                const confirmationRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
                const confirmationBody = JSON.parse(confirmationRequest.body as string) as PostDeployConfirmation['Body'];
                expect(confirmationBody.flowConfigs).toEqual([
                    expect.objectContaining({
                        syncName: 'legacy',
                        providerConfigKey: 'slack',
                        type: 'action',
                        fileBody: { js: 'compiled slack legacy', ts: 'source slack legacy' }
                    })
                ]);
            });
        });

        it.each([
            { label: 'an unknown file', file: 'github/functions/missing.ts', message: "'github/functions/missing.ts' is not a script" },
            { label: 'a file outside the project', file: '../outside.ts', message: "'../outside.ts' must be inside the project folder" },
            { label: 'an absolute path outside the project', file: '/outside.ts', message: "'/outside.ts' must be inside the project folder" },
            {
                label: 'an on-event script',
                file: 'github/on-events/cleanup.ts',
                message: "can't be deployed on its own. Use `nango deploy <environment> --integration github`",
                entryPoint: { filePath: './github/on-events/cleanup.ts', integrationId: 'github', type: 'on-event', name: 'cleanup' }
            }
        ] satisfies { label: string; file: string; message: string; entryPoint?: ParsedIntegrationDefinitions['entryPoints'][number] }[])(
            'rejects $label',
            async ({ file, message, entryPoint }) => {
                if (entryPoint) {
                    vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok({ ...parsed, entryPoints: [...parsed.entryPoints, entryPoint] }));
                }

                const res = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions(), file });

                expect(res.isErr()).toBe(true);
                expect(logOutput(logSpy)).toContain(message);
                expect(fetchMock).not.toHaveBeenCalled();
            }
        );

        it.each([
            { flag: '--sync', options: { sync: 'legacy' } },
            { flag: '--action', options: { action: 'legacy' } },
            { flag: '--integration', options: { integration: 'github' } }
        ] satisfies { flag: string; options: Partial<DeployOptions> }[])('rejects a file combined with $flag', async ({ options }) => {
            const res = await deploy({
                fullPath,
                environmentName: 'test',
                interactive: false,
                options: deployOptions(options),
                file: 'github/functions/fetch.ts'
            });

            expect(res.isErr()).toBe(true);
            expect(logOutput(logSpy)).toContain('A file cannot be combined with --sync, --action or --integration');
            expect(parseIntegrationDefinitions).not.toHaveBeenCalled();
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it.each(['', '   '])('rejects an empty file argument %j instead of deploying everything', async (file) => {
            const res = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions(), file });

            expect(res.isErr()).toBe(true);
            expect(logOutput(logSpy)).toContain('The file argument is empty');
            expect(parseIntegrationDefinitions).not.toHaveBeenCalled();
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('rejects a file passed in place of the environment', async () => {
            const res = await deploy({ fullPath, environmentName: 'github/syncs/fetchIssues.ts', interactive: false, options: deployOptions() });

            expect(res.isErr()).toBe(true);
            expect(logOutput(logSpy)).toContain("'github/syncs/fetchIssues.ts' is not a valid environment name");
            expect(parseIntegrationDefinitions).not.toHaveBeenCalled();
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('does not deploy when the server rejects the function scope', async () => {
            fetchMock.mockResolvedValueOnce(
                jsonResponse({
                    error: {
                        code: 'invalid_body',
                        errors: [{ code: 'invalid_union_discriminator', message: 'Invalid discriminator value', path: ['reconciliationScope', 'kind'] }]
                    }
                })
            );

            const res = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions(), file: 'github/functions/fetch.ts' });

            expect(res.isErr()).toBe(true);
            expect(logOutput(logSpy)).toContain('reconciliationScope.kind: Invalid discriminator value');
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    it.each([
        { flag: '--sync', options: { sync: 'missing' } },
        { flag: '--action', options: { action: 'missing' } }
    ] satisfies { flag: string; options: Partial<DeployOptions> }[])(
        'reports no matching function for an unknown $flag name in a mixed project',
        async ({ options }) => {
            await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions(options) });

            const output = logOutput(logSpy);
            expect(output).toContain('No syncs or actions to deploy');
            expect(output).not.toContain('The --sync and --action options can only be used with legacy scripts');
            expect(fetchMock).not.toHaveBeenCalled();
        }
    );

    it('deploys functions for a native-only integration in a mixed project', async () => {
        const functionChanges = {
            created: [{ integrationId: 'slack', name: 'other' }],
            updated: [],
            unchanged: [],
            deleted: []
        } satisfies FunctionDeploymentBundleSuccess;
        fetchMock.mockResolvedValueOnce(jsonResponse(functionChanges)).mockResolvedValueOnce(jsonResponse(functionChanges));

        await deploy({
            fullPath,
            environmentName: 'test',
            interactive: false,
            options: deployOptions({ integration: 'slack' })
        });

        const output = logOutput(logSpy);
        expect(output).toContain('↳ Functions');
        expect(output).toContain('✓ Deployed');

        const previewRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
        const previewBody = JSON.parse(previewRequest.body as string) as { reconciliationScope: unknown; functions: FunctionConfig[] };
        expect(previewBody.reconciliationScope).toEqual({ kind: 'integration', integrationId: 'slack' });
        expect(previewBody.functions).toEqual([expect.objectContaining({ integrationId: 'slack', name: 'other', trigger: { kind: 'http' } })]);
    });

    // TODO: Re-enable these tests when empty deployments can delete the last definition for both legacy scripts and functions.
    it.skip('deletes the functions of an integration when its last function was removed', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok({ ...functionsOnlyParsed, functions: [githubFunction] }));
        const functionChanges = {
            created: [],
            updated: [],
            unchanged: [],
            deleted: [{ integrationId: 'slack', name: 'other' }]
        } satisfies FunctionDeploymentBundleSuccess;
        fetchMock.mockResolvedValueOnce(jsonResponse(functionChanges)).mockResolvedValueOnce(jsonResponse(functionChanges));

        await deploy({
            fullPath,
            environmentName: 'test',
            interactive: false,
            options: deployOptions({ integration: 'slack', allowDestructive: true })
        });

        const output = logOutput(logSpy);
        expect(output).toContain('- slack → other');
        expect(output).toContain('✓ Deployed');
        expect(output).toContain('Successfully removed:');
    });

    it.skip('deletes every function of the environment when the last function was removed', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok({ ...functionsOnlyParsed, functions: [] }));
        const functionChanges = {
            created: [],
            updated: [],
            unchanged: [],
            deleted: [
                { integrationId: 'github', name: 'fetch' },
                { integrationId: 'slack', name: 'other' }
            ]
        } satisfies FunctionDeploymentBundleSuccess;
        fetchMock.mockResolvedValueOnce(jsonResponse(functionChanges)).mockResolvedValueOnce(jsonResponse(functionChanges));

        await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions({ allowDestructive: true }) });

        const output = logOutput(logSpy);
        expect(output).toContain('- github → fetch');
        expect(output).toContain('- slack → other');
        expect(output).toContain('✓ Deployed');
        expect(output).toContain('Successfully removed:');
    });

    it('warns about --version for function deployments and still deploys', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(functionsOnlyParsed));
        fetchMock.mockResolvedValueOnce(jsonResponse(noFunctionChanges)).mockResolvedValueOnce(jsonResponse(noFunctionChanges));

        const result = await deploy({
            fullPath,
            environmentName: 'test',
            interactive: false,
            options: deployOptions({ version: 'v1' })
        });

        expect(result.isOk()).toBe(true);
        expect(logOutput(logSpy)).toContain('The --version option only applies to syncs/actions; it has no effect on functions.');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('prints only the Functions summary row for a functions-only project', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(functionsOnlyParsed));
        const functionChanges = {
            created: [{ integrationId: 'github', name: 'fetch' }],
            updated: [],
            unchanged: [{ integrationId: 'slack', name: 'other' }],
            deleted: []
        } satisfies FunctionDeploymentBundleSuccess;
        fetchMock.mockResolvedValueOnce(jsonResponse(functionChanges)).mockResolvedValueOnce(jsonResponse(functionChanges));

        await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        const output = logOutput(logSpy);
        expect(output).not.toContain('↳ Syncs');
        expect(output).not.toContain('↳ Actions');
        expect(output).not.toContain('↳ OnEvents');
        expect(output).toContain('↳ Functions');
        expect(output).toContain('✓ Deployed');
        expect(output).toContain('- github → fetch');
        expect(output).not.toContain('- slack → other');
    });

    it('loads function files when the source path contains .js before the extension', async () => {
        const config = functionConfig({ integrationId: 'github.js', name: 'fetch' });
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok({ ...functionsOnlyParsed, functions: [config] }));
        await fs.mkdir(path.join(fullPath, 'github.js', 'functions'), { recursive: true });
        await fs.writeFile(path.join(fullPath, 'github.js', 'functions', 'fetch.ts'), 'source with dotted path');
        await fs.writeFile(path.join(fullPath, 'build', 'github.js_functions_fetch.cjs'), 'compiled with dotted path');

        const functionChanges = {
            created: [{ integrationId: 'github.js', name: 'fetch' }],
            updated: [],
            unchanged: [],
            deleted: []
        } satisfies FunctionDeploymentBundleSuccess;
        fetchMock.mockResolvedValueOnce(jsonResponse(functionChanges)).mockResolvedValueOnce(jsonResponse(functionChanges));

        await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        expect(logOutput(logSpy)).toContain('✓ Deployed');
        const previewRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
        const previewBody = JSON.parse(previewRequest.body as string) as {
            functions: { fileBody: { js: string; ts: string } }[];
        };
        expect(previewBody.functions[0]?.fileBody).toEqual({ js: 'compiled with dotted path', ts: 'source with dotted path' });
    });

    it('rejects function source paths outside the project directory', async () => {
        const externalDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nango-cli-external-'));

        try {
            const externalFilePath = path.join(externalDir, 'secret.ts');
            const sourcePath = path.relative(fullPath, externalFilePath);
            const maliciousConfig = { ...githubFunction, filePath: sourcePath };
            vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok({ ...functionsOnlyParsed, functions: [maliciousConfig] }));
            await fs.writeFile(externalFilePath, 'sensitive contents');
            await fs.writeFile(path.join(fullPath, 'build', tsToJsPath(sourcePath.replace(/\.ts$/, '.js'))), 'compiled function');

            await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

            expect(logOutput(logSpy)).toContain(`Function source path "${sourcePath}" must be within the project directory`);
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            await fs.rm(externalDir, { recursive: true, force: true });
        }
    });

    it('prints only legacy summary rows when no functions bundle', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(legacyOnlyParsed));
        fetchMock.mockResolvedValueOnce(jsonResponse(legacyChangeConfirmation)).mockResolvedValueOnce(jsonResponse([]));

        await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        const output = logOutput(logSpy);
        expect(output).toContain('↳ Syncs');
        expect(output).toContain('↳ Actions');
        expect(output).toContain('↳ OnEvents');
        expect(output).not.toContain('↳ Functions');
        expect(output).toContain('✓ Deployed');
    });

    it.each([
        { name: 'legacy', definitions: legacyOnlyParsed },
        { name: 'functions', definitions: functionsOnlyParsed },
        { name: 'mixed', definitions: parsed }
    ])('prints No changes when the $name deployment is unchanged', async ({ name, definitions }) => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(definitions));
        fetchMock.mockResolvedValueOnce(jsonResponse(name === 'functions' ? noFunctionChanges : legacyConfirmation));
        if (name === 'mixed') {
            fetchMock.mockResolvedValueOnce(jsonResponse(noFunctionChanges));
        }
        fetchMock.mockResolvedValueOnce(jsonResponse(name === 'functions' ? noFunctionChanges : []));
        if (name === 'mixed') {
            fetchMock.mockResolvedValueOnce(jsonResponse(noFunctionChanges));
        }

        const result = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        const output = logOutput(logSpy);
        expect(result.isOk()).toBe(true);
        expect(output.match(/No changes/g)).toHaveLength(2);
        expect(output).toContain('No changes were deployed.');
        expect(output).not.toContain('Successfully');
        expect(output).not.toContain('Summary');
        expect(output).not.toContain('↳');
        expect(output).not.toContain('No destructive changes, proceeding');
    });

    it('prints Function preview errors', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(functionsOnlyParsed));
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'functions_deployment_error', message: 'Preview failed' } }));

        await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        expect(logOutput(logSpy)).toContain('Error checking functions state:\nPreview failed');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('prints Function deploy errors', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(functionsOnlyParsed));
        fetchMock
            .mockResolvedValueOnce(jsonResponse(noFunctionChanges))
            .mockResolvedValueOnce(jsonResponse({ error: { code: 'functions_deployment_error', message: 'Apply failed' } }));

        await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        expect(logOutput(logSpy)).toContain('Error deploying functions');
        expect(logOutput(logSpy)).not.toContain('✓ Deployed');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not deploy legacy scripts when the preview fails', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(legacyOnlyParsed));
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'server_error', message: 'Preview failed' } }));

        const result = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        expect(result.isErr()).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(logOutput(logSpy)).toContain('Error checking state:\nPreview failed');
        expect(logOutput(logSpy)).not.toContain('✓ Deployed');
    });

    it('reports legacy deployment errors', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(legacyOnlyParsed));
        fetchMock
            .mockResolvedValueOnce(jsonResponse(legacyConfirmation))
            .mockResolvedValueOnce(jsonResponse({ error: { code: 'server_error', message: 'Apply failed' } }));

        const result = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        expect(result.isErr()).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(logOutput(logSpy)).toContain('Error deploying:\nApply failed');
        expect(logOutput(logSpy)).not.toContain('✓ Deployed');
    });

    it.each([
        { name: 'a sync with connections', changes: { deletedSyncs: [{ providerConfigKey: 'github', name: 'removed', connections: 1, auto_start: false }] } },
        { name: 'a model', changes: { deletedModels: ['RemovedModel'] } }
    ])('requires destructive confirmation when removing $name', async ({ changes }) => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(legacyOnlyParsed));
        fetchMock.mockResolvedValueOnce(jsonResponse({ ...legacyConfirmation, ...changes }));

        const result = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        expect(result.isErr()).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(logOutput(logSpy)).not.toContain('✓ Deployed');
    });

    it('deploys legacy destructive changes when confirmation flags are provided', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(legacyOnlyParsed));
        fetchMock.mockResolvedValueOnce(jsonResponse({ ...legacyConfirmation, deletedModels: ['RemovedModel'] })).mockResolvedValueOnce(jsonResponse([]));

        const result = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions({ allowDestructive: true }) });

        expect(result.isOk()).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(promptly.confirm).not.toHaveBeenCalled();
        expect(logOutput(logSpy)).toContain('allowDestructive flag is on');
        expect(logOutput(logSpy)).toContain('✓ Deployed');
    });

    it('explains the required legacy confirmation flags when non-interactive', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(legacyOnlyParsed));
        fetchMock.mockResolvedValueOnce(jsonResponse({ ...legacyConfirmation, deletedModels: ['RemovedModel'] }));

        const result = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        expect(result.isErr()).toBe(true);
        expect(logOutput(logSpy)).toContain('Nothing was deployed. Confirm the deploy by passing the --auto-confirm and --allow-destructive flags. Exiting');
        expect(promptly.confirm).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('prints the legacy abort message when confirmation is declined', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(legacyOnlyParsed));
        fetchMock.mockResolvedValueOnce(jsonResponse({ ...legacyConfirmation, deletedModels: ['RemovedModel'] }));

        const result = await deploy({
            fullPath,
            environmentName: 'test',
            interactive: true,
            options: deployOptions({ autoConfirm: false, interactive: true })
        });

        expect(result.isErr()).toBe(true);
        expect(logOutput(logSpy)).toContain('Deploy aborted. Exiting');
        expect(promptly.confirm).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('preserves the legacy version override in both preview and deployment', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(legacyOnlyParsed));
        fetchMock.mockResolvedValueOnce(jsonResponse(legacyConfirmation)).mockResolvedValueOnce(jsonResponse([]));

        const result = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions({ version: '42' }) });

        expect(result.isOk()).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const previewRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
        const deployRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
        const previewBody = JSON.parse(previewRequest.body as string) as PostDeployConfirmation['Body'];
        const deployBody = JSON.parse(deployRequest.body as string) as PostDeployConfirmation['Body'];
        expect(previewBody).toMatchObject({ reconcile: false, flowConfigs: [{ version: '42' }] });
        expect(deployBody).toMatchObject({ reconcile: true, flowConfigs: previewBody.flowConfigs });
        expect(logOutput(logSpy)).not.toContain('The --version option');
    });

    it.each(['preview', 'deploy'])('prints backend validation details during function %s', async (stage) => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(functionsOnlyParsed));
        if (stage === 'deploy') {
            fetchMock.mockResolvedValueOnce(jsonResponse(noFunctionChanges));
        }
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                error: {
                    code: 'invalid_body',
                    errors: [
                        { code: 'invalid_union', path: ['functions', 0, 'tags', 'required_scopes'], message: 'Expected a structured scope requirement' },
                        { code: 'custom', path: [], message: 'Another validation error' }
                    ]
                }
            })
        );

        await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        const output = logOutput(logSpy);
        expect(output).toContain('invalid_body');
        expect(output).toContain('- functions.0.tags.required_scopes: Expected a structured scope requirement');
        expect(output).toContain('- Another validation error');
        expect(output).not.toContain('✓ Deployed');
        expect(fetchMock).toHaveBeenCalledTimes(stage === 'preview' ? 1 : 2);
    });

    it('prints an aborted deployment when function deletions are not allowed', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(functionsOnlyParsed));
        fetchMock.mockResolvedValueOnce(
            jsonResponse({
                created: [],
                updated: [],
                unchanged: [{ integrationId: 'github', name: 'fetch' }],
                deleted: [{ integrationId: 'github', name: 'removed' }]
            } satisfies FunctionDeploymentBundleSuccess)
        );

        await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        const output = logOutput(logSpy);
        expect(output).toContain('↳ Functions');
        expect(output).toContain('Nothing was deployed.');
        expect(output).not.toContain('✓ Deployed');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([false, true])('reports function removals alongside updates: %s', async (withUpdates) => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(functionsOnlyParsed));
        const functionChanges = {
            created: [],
            updated: withUpdates ? [{ integrationId: 'slack', name: 'other' }] : [],
            unchanged: [{ integrationId: 'github', name: 'fetch' }],
            deleted: [{ integrationId: 'github', name: 'removed' }]
        } satisfies FunctionDeploymentBundleSuccess;
        fetchMock.mockResolvedValueOnce(jsonResponse(functionChanges)).mockResolvedValueOnce(jsonResponse(functionChanges));

        await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions({ allowDestructive: true }) });

        const output = logOutput(logSpy);
        expect(output).toContain('allowDestructive flag is on');
        expect(output).toContain('✓ Deployed');
        expect(output).toContain('Successfully removed:');
        expect(output).toContain('- github → removed');
        expect(output).not.toContain('- github → fetch');
        if (withUpdates) {
            expect(output).toContain('Successfully deployed:');
            expect(output).toContain('- slack → other');
        } else {
            expect(output).not.toContain('Successfully deployed:');
        }
    });

    it.each([false, true])('reports legacy removals alongside deployments: %s', async (withDeployments) => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(legacyOnlyParsed));
        const changes = {
            ...legacyConfirmation,
            deletedSyncs: [{ providerConfigKey: 'github', name: 'old-sync', connections: 1, auto_start: false }],
            deletedActions: [{ providerConfigKey: 'github', name: 'old-action' }],
            deletedOnEventScripts: [{ providerConfigKey: 'github', name: 'old-event', event: 'post-connection-creation' }]
        } satisfies PostDeployConfirmation['Success'];
        fetchMock.mockResolvedValueOnce(jsonResponse(changes)).mockResolvedValueOnce(jsonResponse(withDeployments ? legacyDeploymentResult : []));

        const result = await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions({ allowDestructive: true }) });

        const output = logOutput(logSpy);
        expect(result.isOk()).toBe(true);
        expect(output).toContain('Successfully removed:');
        expect(output).toContain('- github → old-sync');
        expect(output).toContain('- github → old-action');
        expect(output).toContain('- github → old-event');
        expect(output).not.toContain('No changes');
        if (withDeployments) {
            expect(output).toContain('Successfully deployed:');
            expect(output).toContain('- github → legacy@v42');
        } else {
            expect(output).not.toContain('Successfully deployed:');
        }
    });
});

function functionConfig({ integrationId, name }: { integrationId: string; name: string }): FunctionConfig {
    return {
        name,
        integrationId,
        filePath: `./${integrationId}/functions/${name}.ts`,
        description: 'Function',
        trigger: { kind: 'http' },
        requires: { connection: true, outbound: true, invoke: false },
        capabilities: { usesRecords: false, usesOutbound: true, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
        limits: { concurrency: { perConnection: 'max' } },
        input_schema_ref: null,
        output_schema_ref: null,
        model_schema_refs: [],
        metadata_schema_ref: null,
        checkpoint_schema_ref: null,
        json_schema: { definitions: {} }
    };
}

function deployOptions(overrides: Partial<DeployOptions> = {}): DeployOptions {
    return {
        autoConfirm: true,
        debug: false,
        dependencyUpdate: false,
        interactive: false,
        env: 'local',
        ...overrides
    };
}

async function writeProject(fullPath: string): Promise<void> {
    await fs.mkdir(path.join(fullPath, '.nango'), { recursive: true });
    await fs.mkdir(path.join(fullPath, 'build'), { recursive: true });
    await fs.mkdir(path.join(fullPath, 'github', 'actions'), { recursive: true });
    await fs.mkdir(path.join(fullPath, 'github', 'functions'), { recursive: true });
    await fs.mkdir(path.join(fullPath, 'slack', 'functions'), { recursive: true });
    await fs.writeFile(path.join(fullPath, 'build', 'github_actions_legacy.cjs'), 'compiled legacy');
    await fs.writeFile(path.join(fullPath, 'github', 'actions', 'legacy.ts'), 'source legacy');
    await fs.writeFile(path.join(fullPath, 'build', 'github_functions_fetch.cjs'), 'compiled function');
    await fs.writeFile(path.join(fullPath, 'github', 'functions', 'fetch.ts'), 'source function');
    await fs.writeFile(path.join(fullPath, 'build', 'slack_functions_other.cjs'), 'compiled other');
    await fs.writeFile(path.join(fullPath, 'slack', 'functions', 'other.ts'), 'source other');
}

function jsonResponse(value: unknown): Pick<Response, 'json'> {
    return { json: vi.fn().mockResolvedValue(value) };
}

function logOutput(logSpy: ReturnType<typeof vi.spyOn>): string {
    const calls = (logSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    return calls.map((args) => args.map(String).join(' ')).join('\n');
}
