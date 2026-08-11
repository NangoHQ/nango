import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import promptly from 'promptly';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Ok } from '../utils/result.js';
import { parseIntegrationDefinitions } from './definitions.js';
import { deploy } from './deploy.js';

import type { DeployOptions } from '../types.js';
import type { FunctionConfig, ParsedIntegrationDefinitions } from './definitions.js';
import type { FunctionDeploymentBundleSuccess, PostDeployConfirmation } from '@nangohq/types';

vi.mock('promptly', () => ({ default: { confirm: vi.fn() } }));
vi.mock('./definitions.js', () => ({ parseIntegrationDefinitions: vi.fn() }));

const githubFunction = functionConfig({ integrationId: 'github', name: 'fetch' });
const slackFunction = functionConfig({ integrationId: 'slack', name: 'other' });

const parsed = {
    yamlVersion: 'v2',
    models: new Map(),
    integrations: [
        {
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
        }
    ],
    functions: [githubFunction, slackFunction]
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

const legacyOnlyParsed = {
    ...parsed,
    functions: []
} satisfies ParsedIntegrationDefinitions;

const functionsOnlyParsed = {
    ...parsed,
    integrations: parsed.integrations.map((integration) => ({ ...integration, syncs: [], actions: [] }))
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

    it('prints an error for a mixed deploy', async () => {
        await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        const output = logOutput(logSpy);
        expect(output).toContain('Legacy scripts and functions cannot be deployed together');
        expect(output).not.toContain('✓ Deployed');
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
        expect(previewBody.functions).toEqual([expect.objectContaining({ integrationId: 'slack', name: 'other' })]);
    });

    it('deletes the functions of an integration when its last function was removed', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok({ ...functionsOnlyParsed, functions: [githubFunction] }));
        await fs.writeFile(path.join(fullPath, '.nango', 'functions.json'), JSON.stringify([githubFunction]));
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
        expect(output).toContain('Successfully removed the functions');
    });

    it('deletes every function of the environment when the last function was removed', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok({ ...functionsOnlyParsed, functions: [] }));
        await fs.rm(path.join(fullPath, '.nango', 'functions.json'));
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
        expect(output).toContain('Successfully removed the functions');
    });

    it('rejects --version for native function deployments', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(functionsOnlyParsed));

        await deploy({
            fullPath,
            environmentName: 'test',
            interactive: false,
            options: deployOptions({ version: 'v1' })
        });

        expect(logOutput(logSpy)).toContain('The --version option can only be used with legacy scripts');
        expect(fetchMock).not.toHaveBeenCalled();
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

    it.each([
        { state: 'malformed', write: async (artifactPath: string) => await fs.writeFile(artifactPath, '{'.repeat(2)) },
        { state: 'not an array', write: async (artifactPath: string) => await fs.writeFile(artifactPath, JSON.stringify({})) }
    ])('does not reconcile anything when the functions artifact is $state', async ({ write }) => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok({ ...functionsOnlyParsed, functions: [] }));
        await write(path.join(fullPath, '.nango', 'functions.json'));

        await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        const output = logOutput(logSpy);
        expect(output).not.toContain('↳ Functions');
        expect(output).toContain('functions artifact');
        expect(output).not.toContain('✓ Deployed');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('prints only legacy summary rows when no functions bundle', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(legacyOnlyParsed));
        await fs.rm(path.join(fullPath, '.nango', 'functions.json'));
        fetchMock.mockResolvedValueOnce(jsonResponse(legacyConfirmation)).mockResolvedValueOnce(jsonResponse([]));

        await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        const output = logOutput(logSpy);
        expect(output).toContain('↳ Syncs');
        expect(output).toContain('↳ Actions');
        expect(output).toContain('↳ OnEvents');
        expect(output).not.toContain('↳ Functions');
        expect(output).toContain('✓ Deployed');
    });

    it('prints no summary when functions are unchanged', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(functionsOnlyParsed));
        fetchMock.mockResolvedValueOnce(jsonResponse(noFunctionChanges)).mockResolvedValueOnce(jsonResponse(noFunctionChanges));

        await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        const output = logOutput(logSpy);
        expect(output).toContain('No changes');
        expect(output).toContain('No function changes were deployed');
        expect(output).not.toContain('↳ Functions');
        expect(output).not.toContain('- github → fetch');
    });

    it('prints Function preview errors', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(functionsOnlyParsed));
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 'functions_deployment_error', message: 'Preview failed' } }));

        await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        expect(logOutput(logSpy)).toContain('Error checking functions state:\nPreview failed');
    });

    it('prints Function deploy errors', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(functionsOnlyParsed));
        fetchMock
            .mockResolvedValueOnce(jsonResponse(noFunctionChanges))
            .mockResolvedValueOnce(jsonResponse({ error: { code: 'functions_deployment_error', message: 'Apply failed' } }));

        await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions() });

        expect(logOutput(logSpy)).toContain('Error deploying functions');
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
        expect(output).toMatch(/Deploy aborted\. Exiting|Functions were not deployed/);
        expect(output).not.toContain('✓ Deployed');
    });

    it('prints a successful deployment when function deletions are allowed', async () => {
        vi.mocked(parseIntegrationDefinitions).mockResolvedValue(Ok(functionsOnlyParsed));
        const functionChanges = {
            created: [],
            updated: [],
            unchanged: [{ integrationId: 'github', name: 'fetch' }],
            deleted: [{ integrationId: 'github', name: 'removed' }]
        } satisfies FunctionDeploymentBundleSuccess;
        fetchMock.mockResolvedValueOnce(jsonResponse(functionChanges)).mockResolvedValueOnce(jsonResponse(functionChanges));

        await deploy({ fullPath, environmentName: 'test', interactive: false, options: deployOptions({ allowDestructive: true }) });

        const output = logOutput(logSpy);
        expect(output).toContain('allowDestructive flag is on');
        expect(output).toContain('✓ Deployed');
        expect(output).toContain('Successfully removed the functions');
        expect(output).not.toContain('- github → fetch');
    });
});

function functionConfig({ integrationId, name }: { integrationId: string; name: string }): FunctionConfig {
    return {
        name,
        integrationId,
        description: 'Function',
        trigger: { kind: 'none' },
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
    await fs.writeFile(path.join(fullPath, '.nango', 'functions.json'), JSON.stringify([githubFunction, slackFunction]));
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
