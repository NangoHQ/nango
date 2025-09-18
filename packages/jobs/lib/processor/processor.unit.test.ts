import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the handler
vi.mock('./handler.js', () => ({
    handler: vi.fn()
}));

// Mock the OrchestratorClient and OrchestratorProcessor
vi.mock('@nangohq/nango-orchestrator', () => ({
    OrchestratorClient: vi.fn(),
    OrchestratorProcessor: vi.fn()
}));

// Mock the logger
vi.mock('@nangohq/utils', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }))
}));

// Mock the env module
vi.mock('../env.js', () => ({
    envs: {
        JOB_PROCESSOR_CONFIG: [
            { groupKeyPattern: 'sync*', maxConcurrency: 200 },
            { groupKeyPattern: 'action*', maxConcurrency: 100 },
            { groupKeyPattern: 'webhook*', maxConcurrency: 0 },
            { groupKeyPattern: 'on-event*', maxConcurrency: 50 }
        ]
    }
}));

import { OrchestratorProcessor } from '@nangohq/nango-orchestrator';

import { Processor } from './processor.js';

describe('Processor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should create processors from config and skip zero concurrency ones', () => {
        new Processor('http://localhost:3008');

        // Should create 3 processors (webhook* skipped due to maxConcurrency = 0)
        expect(OrchestratorProcessor).toHaveBeenCalledTimes(3);

        // Verify correct processors were created
        expect(OrchestratorProcessor).toHaveBeenCalledWith(expect.objectContaining({ groupKey: 'sync*', maxConcurrency: 200 }));
        expect(OrchestratorProcessor).toHaveBeenCalledWith(expect.objectContaining({ groupKey: 'action*', maxConcurrency: 100 }));
        expect(OrchestratorProcessor).toHaveBeenCalledWith(expect.objectContaining({ groupKey: 'on-event*', maxConcurrency: 50 }));

        // Verify webhook* was not created
        const webhookCall = (OrchestratorProcessor as any).mock.calls.find((call: any) => call[0].groupKey === 'webhook*');
        expect(webhookCall).toBeUndefined();
    });
});
