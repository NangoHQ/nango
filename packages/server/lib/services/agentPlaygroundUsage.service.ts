import { productTracking } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';

import type { DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';
import type { LanguageModelUsage } from 'ai';

const logger = getLogger('AgentPlayground');

interface Rates {
    input: number;
    cacheRead: number;
    cacheWrite: number;
    output: number;
    // A request above `inputTokens` is billed at the multiplied rates for all of its tokens.
    longContext?: { inputTokens: number; inputMultiplier: number; outputMultiplier: number };
}

const USD_PER_MILLION_TOKENS: Record<string, Rates> = {
    'gpt-6-luna': {
        input: 0.1,
        cacheRead: 0.01,
        cacheWrite: 0.125,
        output: 0.5,
        longContext: { inputTokens: 272_000, inputMultiplier: 2, outputMultiplier: 1.5 }
    },
    mock: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
};

export interface PlaygroundStep {
    model: { modelId: string };
    usage: LanguageModelUsage;
}

export interface PlaygroundTurnUsage {
    model: string | undefined;
    steps: number;
    inputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    costUsd: number | null;
}

export type PlaygroundTurnOutcome = 'complete' | 'aborted' | 'error';

export function stepCostUsd({ model, usage }: PlaygroundStep): number | null {
    const rates = USD_PER_MILLION_TOKENS[model.modelId];
    if (!rates) {
        return null;
    }

    const input = usage.inputTokens ?? 0;
    const cacheRead = usage.inputTokenDetails.cacheReadTokens ?? 0;
    const cacheWrite = usage.inputTokenDetails.cacheWriteTokens ?? 0;
    const noCache = usage.inputTokenDetails.noCacheTokens ?? input - cacheRead - cacheWrite;
    const longContext = rates.longContext && input > rates.longContext.inputTokens ? rates.longContext : undefined;
    const inputMultiplier = longContext?.inputMultiplier ?? 1;
    const outputMultiplier = longContext?.outputMultiplier ?? 1;

    const perMillion =
        (noCache * rates.input + cacheRead * rates.cacheRead + cacheWrite * rates.cacheWrite) * inputMultiplier +
        (usage.outputTokens ?? 0) * rates.output * outputMultiplier;
    return perMillion / 1_000_000;
}

// Priced per step: the long-context rate applies to each model request on its own.
export function sumTurnUsage(steps: PlaygroundStep[]): PlaygroundTurnUsage {
    const total: PlaygroundTurnUsage = {
        model: steps[0]?.model.modelId,
        steps: steps.length,
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        costUsd: 0
    };
    for (const step of steps) {
        total.inputTokens += step.usage.inputTokens ?? 0;
        total.cacheReadTokens += step.usage.inputTokenDetails.cacheReadTokens ?? 0;
        total.cacheWriteTokens += step.usage.inputTokenDetails.cacheWriteTokens ?? 0;
        total.outputTokens += step.usage.outputTokens ?? 0;
        total.reasoningTokens += step.usage.outputTokenDetails.reasoningTokens ?? 0;
        const cost = stepCostUsd(step);
        total.costUsd = cost === null || total.costUsd === null ? null : total.costUsd + cost;
    }
    return total;
}

export function trackPlaygroundTurn({
    ctx,
    sessionId,
    outcome,
    steps
}: {
    ctx: { account: DBTeam; environment: DBEnvironment; plan: DBPlan | null; user: DBUser };
    sessionId: string;
    outcome: PlaygroundTurnOutcome;
    steps: PlaygroundStep[];
}): void {
    const usage = sumTurnUsage(steps);
    if (usage.costUsd === null) {
        logger.error(`Agent Playground has no price for model ${usage.model}, so the turn is tracked without a cost`);
    }

    productTracking.track({
        name: 'playground:agent_turn_complete',
        team: ctx.account,
        environment: ctx.environment,
        user: ctx.user,
        plan: ctx.plan,
        eventProperties: {
            agent_session_id: sessionId,
            environment_id: ctx.environment.id,
            is_success: outcome !== 'error',
            ...(outcome === 'error' ? { error_code: 'model_error' } : {}),
            is_stopped: outcome === 'aborted',
            ...(usage.model ? { model: usage.model } : {}),
            step_count: usage.steps,
            input_tokens: usage.inputTokens,
            cache_read_tokens: usage.cacheReadTokens,
            cache_write_tokens: usage.cacheWriteTokens,
            output_tokens: usage.outputTokens,
            reasoning_tokens: usage.reasoningTokens,
            ...(usage.costUsd === null ? {} : { cost_usd: usage.costUsd })
        }
    });
}
