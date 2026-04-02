import { describe, expect, it } from 'vitest';

import { buildFlowConfig } from './compiler-client.js';

import type { FlowsZeroJson } from '@nangohq/types';

describe('buildFlowConfig', () => {
    it('builds an action flow from zero-yaml nango.json output', () => {
        const flows: FlowsZeroJson = [
            {
                providerConfigKey: 'github',
                sdkVersion: '0.0.0',
                actions: [
                    {
                        name: 'smokeTest',
                        type: 'action',
                        description: 'Smoke test action',
                        input: 'SmokeInput',
                        output: ['SmokeOutput'],
                        endpoint: { method: 'POST', path: '/smoke', group: 'Smoke' },
                        scopes: [],
                        usedModels: ['SmokeInput', 'SmokeOutput'],
                        version: '1.0.0',
                        json_schema: { definitions: {} },
                        features: []
                    }
                ],
                syncs: [],
                onEventScripts: {
                    'post-connection-creation': [],
                    'pre-connection-deletion': [],
                    'validate-connection': []
                }
            }
        ];

        const flow = buildFlowConfig(
            JSON.stringify(flows),
            {
                integration_id: 'github',
                function_name: 'smokeTest',
                function_type: 'action',
                code: ''
            },
            'module.exports = {};'
        );

        expect(flow).toMatchObject({
            type: 'action',
            syncName: 'smokeTest',
            providerConfigKey: 'github',
            input: 'SmokeInput',
            models: ['SmokeOutput'],
            endpoints: [{ method: 'POST', path: '/smoke', group: 'Smoke' }]
        });
    });

    it('builds a sync flow from zero-yaml nango.json output', () => {
        const flows: FlowsZeroJson = [
            {
                providerConfigKey: 'github',
                sdkVersion: '0.0.0',
                actions: [],
                syncs: [
                    {
                        name: 'syncIssues',
                        type: 'sync',
                        description: 'Sync issues',
                        endpoints: [{ method: 'GET', path: '/issues', group: 'Issues' }],
                        sync_type: 'incremental',
                        track_deletes: true,
                        auto_start: false,
                        runs: 'every 30min',
                        scopes: [],
                        input: null,
                        output: ['Issue'],
                        usedModels: ['Issue'],
                        webhookSubscriptions: ['issues'],
                        version: '1.0.0',
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
        ];

        const flow = buildFlowConfig(
            JSON.stringify(flows),
            {
                integration_id: 'github',
                function_name: 'syncIssues',
                function_type: 'sync',
                code: ''
            },
            'module.exports = {};'
        );

        expect(flow).toMatchObject({
            type: 'sync',
            syncName: 'syncIssues',
            providerConfigKey: 'github',
            models: ['Issue'],
            runs: 'every 30min',
            track_deletes: true,
            auto_start: false,
            endpoints: [{ method: 'GET', path: '/issues', group: 'Issues' }],
            webhookSubscriptions: ['issues']
        });
    });
});
