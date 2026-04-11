import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    AGENT_MODEL,
    agentProjectPath,
    createAgentPrompt,
    createAnswerPrompt,
    createRuntimeConfig,
    createSessionTitle,
    resolvePayload
} from './agent-runtime.js';

describe('agent runtime helpers', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('resolves payloads with the production API base URL by default', () => {
        expect(
            resolvePayload({
                prompt: 'Build a sync',
                integration_id: 'github'
            })
        ).toStrictEqual({
            prompt: 'Build a sync',
            integration_id: 'github',
            nango_base_url: 'https://api.nango.dev'
        });
    });

    it('resolves payloads with NANGO_SERVER_URL when configured', () => {
        vi.stubEnv('NANGO_SERVER_URL', 'http://localhost:3003');

        expect(
            resolvePayload({
                prompt: 'Build an action',
                integration_id: 'github',
                connection_id: 'conn_1'
            })
        ).toStrictEqual({
            prompt: 'Build an action',
            integration_id: 'github',
            connection_id: 'conn_1',
            nango_base_url: 'http://localhost:3003'
        });
    });

    it('builds OpenCode runtime config without provider credentials by default', () => {
        expect(createRuntimeConfig()).toStrictEqual({
            model: AGENT_MODEL.full,
            small_model: AGENT_MODEL.full,
            enabled_providers: [AGENT_MODEL.providerID],
            permission: {
                '*': 'allow',
                external_directory: { '/**': 'allow' }
            }
        });
    });

    it('injects OpenCode API credentials when configured', () => {
        vi.stubEnv('OPENCODE_API_KEY', 'sk-test');

        expect(createRuntimeConfig()).toStrictEqual({
            model: AGENT_MODEL.full,
            small_model: AGENT_MODEL.full,
            enabled_providers: [AGENT_MODEL.providerID],
            permission: {
                '*': 'allow',
                external_directory: { '/**': 'allow' }
            },
            provider: {
                [AGENT_MODEL.providerID]: {
                    options: { apiKey: 'sk-test' }
                }
            }
        });
    });

    it('builds the initial agent prompt with workspace and task context', () => {
        const prompt = createAgentPrompt({
            prompt: 'Build a GitHub issue sync',
            integration_id: 'github',
            connection_id: 'conn_1',
            nango_base_url: 'http://localhost:3003'
        });

        expect(prompt).toContain('Build a GitHub issue sync');
        expect(prompt).toContain(agentProjectPath);
        expect(prompt).toContain('nango-remote-function-builder');
        expect(prompt).toContain('"integration_id": "github"');
        expect(prompt).toContain('"connection_id": "conn_1"');
        expect(prompt).toContain('"nango_base_url": "http://localhost:3003"');
    });

    it('builds answer prompts and session titles', () => {
        expect(createAnswerPrompt('Use the REST API')).toBe('User response: Use the REST API\n\nContinue from the current session state.');
        expect(
            createSessionTitle({
                prompt: 'Build it',
                integration_id: 'github',
                nango_base_url: 'https://api.nango.dev'
            })
        ).toBe('Build github');
    });
});
