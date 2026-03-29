import { afterEach, describe, expect, it } from 'vitest';

import { agentProjectPath, createAgentPrompt, createRuntimeConfig } from '../agent/agent-runtime.js';
import { getSandboxRuntimeConfigPath } from './agent-sandbox.service.js';

type RuntimeConfig = {
    permission: Record<string, unknown>;
    provider?: Record<string, unknown>;
};

const model = {
    full: 'opencode/kimi-k2.5',
    providerID: 'opencode',
    modelID: 'kimi-k2.5'
};

describe('createAgentPrompt', () => {
    it('removes sensitive runtime fields from the prompt context', () => {
        const prompt = createAgentPrompt({
            prompt: 'Build a sync.',
            functionName: 'sync-users',
            providerConfigKey: 'github',
            api_key: 'sk-live-secret',
            api_base_url: 'https://models.example.com/v1',
            credentials: {
                access_token: 'access-secret',
                nested: {
                    clientSecret: 'client-secret'
                }
            },
            metadata: {
                team: 'platform',
                refreshToken: 'refresh-secret'
            }
        });

        expect(prompt).toContain('Build a sync.');
        expect(prompt).toContain('sync-users');
        expect(prompt).toContain('github');
        expect(prompt).toContain('platform');
        expect(prompt).not.toContain('sk-live-secret');
        expect(prompt).not.toContain('access-secret');
        expect(prompt).not.toContain('client-secret');
        expect(prompt).not.toContain('refresh-secret');
        expect(prompt).not.toContain('api_key');
        expect(prompt).not.toContain('api_base_url');
        expect(prompt).not.toContain('credentials');
    });

    it('guides the agent toward workspace-local temp files', () => {
        const prompt = createAgentPrompt({ prompt: 'Build a sync.' });

        expect(prompt).toContain('./.nango-agent-tmp/');
        expect(prompt).toContain('/tmp');
        expect(prompt).toContain(agentProjectPath);
    });
});

describe('createRuntimeConfig', () => {
    afterEach(() => {
        delete process.env['OPENCODE_API_KEY'];
    });

    it('uses the request override key and denies external directories', () => {
        process.env['OPENCODE_API_KEY'] = 'env-secret';

        const config = createRuntimeConfig(
            {
                api_key: 'override-secret',
                api_base_url: 'https://models.example.com/v1'
            },
            model
        ) as RuntimeConfig;

        expect(config['permission']).toEqual({
            '*': 'allow',
            external_directory: 'deny'
        });
        expect(config['provider']).toEqual({
            opencode: {
                options: {
                    apiKey: 'override-secret',
                    baseURL: 'https://models.example.com/v1'
                }
            }
        });
    });

    it('falls back to the server key for the opencode provider', () => {
        process.env['OPENCODE_API_KEY'] = 'env-secret';

        const config = createRuntimeConfig({}, model) as RuntimeConfig;

        expect(config['provider']).toEqual({
            opencode: {
                options: {
                    apiKey: 'env-secret'
                }
            }
        });
    });

    it('throws when the opencode provider has no API key', () => {
        expect(() => createRuntimeConfig({}, model)).toThrow('OPENCODE_API_KEY is required');
    });
});

describe('getSandboxRuntimeConfigPath', () => {
    it('stores runtime config outside the workspace', () => {
        const path = getSandboxRuntimeConfigPath('session:123');

        expect(path).toBe('/home/user/.nango-opencode-runtime-session123.json');
        expect(path.startsWith(`${agentProjectPath}/`)).toBe(false);
    });
});
