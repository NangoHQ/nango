import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { productTracking } from '@nangohq/shared';

import { stepCostUsd, sumTurnUsage, trackPlaygroundTurn, trackStarterIntegrationSetup } from './agentPlaygroundUsage.service.js';

import type { PlaygroundStep } from './agentPlaygroundUsage.service.js';
import type { DBEnvironment, DBTeam, DBUser } from '@nangohq/types';

type Capture = (payload: { event: string; distinctId: string; properties: Record<string, unknown>; groups?: Record<string, string> }) => void;

const capture = vi.fn<Capture>();
const realClient = productTracking.client;

function step({
    modelId = 'gpt-6-luna',
    input = 0,
    cacheRead = 0,
    cacheWrite = 0,
    output = 0,
    reasoning = 0
}: {
    modelId?: string;
    input?: number;
    cacheRead?: number;
    cacheWrite?: number;
    output?: number;
    reasoning?: number;
}): PlaygroundStep {
    return {
        model: { modelId },
        usage: {
            inputTokens: input,
            inputTokenDetails: { noCacheTokens: input - cacheRead - cacheWrite, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite },
            outputTokens: output,
            outputTokenDetails: { textTokens: output - reasoning, reasoningTokens: reasoning },
            totalTokens: input + output
        }
    };
}

beforeEach(() => {
    capture.mockClear();
    productTracking.client = { capture, groupIdentify: vi.fn() } as unknown as typeof productTracking.client;
});

afterEach(() => {
    productTracking.client = realClient;
});

describe('stepCostUsd', () => {
    it('prices each token category at its own rate', () => {
        const cost = stepCostUsd(step({ input: 100_000, cacheRead: 20_000, cacheWrite: 10_000, output: 100_000 }));

        expect(cost).toBeCloseTo((70_000 * 0.1 + 20_000 * 0.01 + 10_000 * 0.125 + 100_000 * 0.5) / 1_000_000, 10);
    });

    it('prices a request above 272k input tokens at the long-context rates', () => {
        const cost = stepCostUsd(step({ input: 300_000, output: 1_000 }));

        expect(cost).toBeCloseTo(300_000 * 0.2e-6 + 1_000 * 0.75e-6, 10);
    });

    it('prices a dated snapshot like its model', () => {
        expect(stepCostUsd(step({ modelId: 'gpt-6-luna-2026-09-22', input: 1_000 }))).toBe(stepCostUsd(step({ input: 1_000 })));
    });

    it('has no price for an unknown model', () => {
        expect(stepCostUsd(step({ modelId: 'gpt-unknown', input: 10 }))).toBeNull();
    });
});

describe('sumTurnUsage', () => {
    it('adds up tokens and cost across steps', () => {
        const usage = sumTurnUsage([step({ input: 1_000, cacheRead: 400, output: 50 }), step({ input: 2_000, cacheRead: 1_000, output: 100, reasoning: 20 })]);

        expect(usage).toMatchObject({
            model: 'gpt-6-luna',
            steps: 2,
            inputTokens: 3_000,
            cacheReadTokens: 1_400,
            cacheWriteTokens: 0,
            outputTokens: 150,
            reasoningTokens: 20
        });
        expect(usage.costUsd).toBeCloseTo((1_600 * 0.1 + 1_400 * 0.01 + 150 * 0.5) / 1_000_000, 12);
    });

    it('keeps the tokens but drops the cost when one step has no price', () => {
        const usage = sumTurnUsage([step({ input: 1_000 }), step({ modelId: 'gpt-unknown', input: 1_000 })]);

        expect(usage.inputTokens).toBe(2_000);
        expect(usage.costUsd).toBeNull();
    });

    it('costs nothing when no step finished', () => {
        expect(sumTurnUsage([])).toMatchObject({ model: undefined, steps: 0, inputTokens: 0, costUsd: 0 });
    });
});

describe('trackPlaygroundTurn', () => {
    it('sends one event with the turn usage, attributed to the account', () => {
        trackPlaygroundTurn({
            ctx: {
                account: { id: 42 } as DBTeam,
                environment: { id: 7, is_production: false } as DBEnvironment,
                plan: null,
                user: { id: 3 } as DBUser
            },
            sessionId: 'session-1',
            chatId: 'chat-1',
            turn: { isFirstTurn: true },
            outcome: 'aborted',
            steps: [step({ input: 1_000, output: 10 })]
        });

        expect(capture).toHaveBeenCalledTimes(1);
        const [payload] = capture.mock.calls[0] ?? [];
        if (!payload) {
            throw new Error('No event captured');
        }
        expect(payload.event).toBe('playground:agent_turn_complete');
        expect(payload.distinctId).toBe('3');
        expect(payload.groups).toStrictEqual({ company: '42' });
        expect(payload.properties).toMatchObject({
            agent_session_id: 'session-1',
            chat_id: 'chat-1',
            is_first_turn: true,
            environment_id: 7,
            is_production: false,
            is_success: true,
            is_stopped: true,
            model: 'gpt-6-luna',
            step_count: 1,
            input_tokens: 1_000,
            output_tokens: 10
        });
        expect(payload.properties['cost_usd']).toBeCloseTo((1_000 * 0.1 + 10 * 0.5) / 1_000_000, 12);
    });

    it('marks a failed turn and leaves out a cost it cannot price', () => {
        trackPlaygroundTurn({
            ctx: { account: { id: 42 } as DBTeam, environment: { id: 7 } as DBEnvironment, plan: null, user: { id: 3 } as DBUser },
            sessionId: 'session-1',
            turn: { isFirstTurn: false },
            outcome: 'error',
            steps: [step({ modelId: 'gpt-unknown', input: 1_000 })]
        });

        const [payload] = capture.mock.calls[0] ?? [];
        expect(payload?.properties).toMatchObject({
            is_first_turn: false,
            is_success: false,
            error_code: 'model_error',
            is_stopped: false,
            input_tokens: 1_000
        });
        expect(payload?.properties).not.toHaveProperty('cost_usd');
    });

    it('names the provider failure behind a failed turn', () => {
        trackPlaygroundTurn({
            ctx: { account: { id: 42 } as DBTeam, environment: { id: 7 } as DBEnvironment, plan: null, user: { id: 3 } as DBUser },
            sessionId: 'session-1',
            turn: { isFirstTurn: false },
            outcome: 'error',
            steps: [],
            errorCategory: 'quota'
        });

        const [payload] = capture.mock.calls[0] ?? [];
        expect(payload?.properties).toMatchObject({ is_success: false, error_code: 'model_error', error_category: 'quota' });
    });
});

describe('trackStarterIntegrationSetup', () => {
    const ctx = { account: { id: 42 } as DBTeam, environment: { id: 7 } as DBEnvironment, plan: null, user: { id: 3 } as DBUser };

    it('counts a reused integration as a success', () => {
        trackStarterIntegrationSetup(ctx, { provider: 'google-calendar', integrationId: 'my-calendar', outcome: 'existing' });

        const [payload] = capture.mock.calls[0] ?? [];
        expect(payload?.event).toBe('playground:integration_create');
        expect(payload?.properties).toMatchObject({ provider: 'google-calendar', is_success: true, is_existing: true });
        expect(payload?.properties).not.toHaveProperty('error_code');
    });

    it('names why the integration could not be set up', () => {
        trackStarterIntegrationSetup(ctx, { provider: 'hubspot', integrationId: 'my-hubspot', outcome: 'missing_credentials' });

        const [payload] = capture.mock.calls[0] ?? [];
        expect(payload?.properties).toMatchObject({ provider: 'hubspot', is_success: false, error_code: 'missing_credentials', is_existing: true });
    });

    it('counts a new integration as a playground integration create', () => {
        trackStarterIntegrationSetup(ctx, { provider: 'github', integrationId: 'pg-github', outcome: 'created' });

        expect(capture.mock.calls.map(([payload]) => payload.event)).toEqual(['playground:integration_create', 'integrations:integration_create']);
        expect(capture.mock.calls[1]?.[0].properties).toMatchObject({ provider: 'github', is_playground: true });
    });

    it('sends no integration create for a reused integration', () => {
        trackStarterIntegrationSetup(ctx, { provider: 'google-calendar', integrationId: 'my-calendar', outcome: 'existing' });

        expect(capture.mock.calls.map(([payload]) => payload.event)).toEqual(['playground:integration_create']);
    });
});
