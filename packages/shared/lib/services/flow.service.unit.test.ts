import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FlowService from './flow.service.js';

describe('Flow service tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset the cache before each test
        (FlowService as any).flowsStandard = undefined;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should get all available flows as standard config', () => {
        const result = FlowService.getAllAvailableFlowsAsStandardConfig();

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);

        // Check that each integration has the required properties
        for (const integration of result) {
            expect(integration.providerConfigKey).toBeDefined();
            expect(Array.isArray(integration.syncs)).toBe(true);
            expect(Array.isArray(integration.actions)).toBe(true);
            expect(Array.isArray(integration['on-events'])).toBe(true);
        }
    });

    it('should get flow by integration and name', () => {
        // Get all flows first to find a valid provider and flow
        const allFlows = FlowService.getAllAvailableFlowsAsStandardConfig();
        expect(allFlows.length).toBeGreaterThan(0);

        const firstIntegration = allFlows[0];
        expect(firstIntegration).toBeDefined();

        // Test with a sync if available
        if (firstIntegration?.syncs?.length > 0) {
            const syncFlow = FlowService.getFlowByIntegrationAndName({
                provider: firstIntegration?.providerConfigKey || '',
                type: 'sync',
                scriptName: firstIntegration.syncs[0]?.name || ''
            });

            expect(syncFlow).not.toBeNull();
            expect(syncFlow?.name).toBe(firstIntegration.syncs[0]?.name);
            expect(syncFlow?.type).toBe('sync');
        }

        // Test with an action if available
        if (firstIntegration?.actions?.length > 0) {
            const actionFlow = FlowService.getFlowByIntegrationAndName({
                provider: firstIntegration?.providerConfigKey || '',
                type: 'action',
                scriptName: firstIntegration.actions[0]?.name || ''
            });

            expect(actionFlow).not.toBeNull();
            expect(actionFlow?.name).toBe(firstIntegration.actions[0]?.name);
            expect(actionFlow?.type).toBe('action');
        }
    });

    it('should get flow by name across all integrations', () => {
        // Get all flows first to find a valid flow name
        const allFlows = FlowService.getAllAvailableFlowsAsStandardConfig();
        expect(allFlows.length).toBeGreaterThan(0);

        // Find a sync flow
        let syncFlowName: string | null = null;
        for (const integration of allFlows) {
            if (integration.syncs?.length > 0) {
                syncFlowName = integration.syncs[0]?.name || null;
                break;
            }
        }

        if (syncFlowName) {
            const syncFlow = FlowService.getFlow(syncFlowName);
            expect(syncFlow).not.toBeNull();
            expect(syncFlow?.name).toBe(syncFlowName);
            expect(syncFlow?.type).toBe('sync');
        }

        // Find an action flow
        let actionFlowName: string | null = null;
        for (const integration of allFlows) {
            if (integration.actions?.length > 0) {
                actionFlowName = integration.actions[0]?.name || null;
                break;
            }
        }

        if (actionFlowName) {
            const actionFlow = FlowService.getFlow(actionFlowName);
            expect(actionFlow).not.toBeNull();
            expect(actionFlow?.name).toBe(actionFlowName);
            expect(actionFlow?.type).toBe('action');
        }
    });

    it('should get single flow as standard config', () => {
        // Get all flows first to find valid flow names
        const allFlows = FlowService.getAllAvailableFlowsAsStandardConfig();
        expect(allFlows.length).toBeGreaterThan(0);

        // Find a sync flow
        let syncFlowName: string | null = null;
        for (const integration of allFlows) {
            if (integration.syncs?.length > 0) {
                syncFlowName = integration.syncs[0]?.name || null;
                break;
            }
        }

        if (syncFlowName) {
            const syncConfig = FlowService.getSingleFlowAsStandardConfig(syncFlowName);
            expect(syncConfig).not.toBeNull();
            expect(syncConfig?.syncs).toHaveLength(1);
            expect(syncConfig?.syncs[0]?.name).toBe(syncFlowName);
            expect(syncConfig?.actions).toHaveLength(0); // Should only contain the specific sync
        }

        // Find an action flow
        let actionFlowName: string | null = null;
        for (const integration of allFlows) {
            if (integration.actions?.length > 0) {
                actionFlowName = integration.actions[0]?.name || null;
                break;
            }
        }

        if (actionFlowName) {
            const actionConfig = FlowService.getSingleFlowAsStandardConfig(actionFlowName);
            expect(actionConfig).not.toBeNull();
            expect(actionConfig?.actions).toHaveLength(1);
            expect(actionConfig?.actions[0]?.name).toBe(actionFlowName);
            expect(actionConfig?.syncs).toHaveLength(0); // Should only contain the specific action
        }
    });

    it('should cache flows standard config after first call', () => {
        // First call should populate cache
        const result1 = FlowService.getAllAvailableFlowsAsStandardConfig();
        expect(result1).toBeDefined();

        // Second call should use cached version
        const result2 = FlowService.getAllAvailableFlowsAsStandardConfig();
        expect(result2).toBeDefined();

        // Both should be the same reference due to caching
        expect(result2).toBe(result1);
    });
});
