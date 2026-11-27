import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { records } from '@nangohq/records';
import { inlineFunctionService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { envs } from '../../../../env.js';
import { decodeResultId, encodeResultId } from '../../../../services/agentSessionResults.service.js';
import { PublicMcpError } from '../../../mcp/utils.js';
import { queryResultTool } from './queryResult.js';

import type { AgentSessionMcpContext } from '../sessionTool.js';
import type { UpsertSummary } from '@nangohq/records';
import type { AgentSession, AgentSessionResolvedConnection, DBEnvironment, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { MockInstance } from 'vitest';

const invokeFunction = vi.hoisted(() => vi.fn());

vi.mock('@nangohq/logs', async (importOriginal) => {
    const logCtx = { id: 'log-1', operation: {}, attachSpan: vi.fn(), error: vi.fn(), failed: vi.fn(), success: vi.fn() };
    return {
        ...(await importOriginal<object>()),
        OtlpSpan: vi.fn(),
        logContextGetter: { create: vi.fn().mockResolvedValue(logCtx), get: vi.fn().mockReturnValue({ warn: vi.fn().mockResolvedValue(true) }) }
    };
});

vi.mock('../../../../utils/utils.js', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getOrchestrator: () => ({ invokeFunction })
}));

const CONNECTION: AgentSessionResolvedConnection = {
    integrationId: 'gmail',
    provider: 'google-mail',
    connectionId: 'gmail-acme',
    internalConnectionId: 10,
    configId: 20
};

const RESULT_ID = encodeResultId({ integrationId: 'gmail', recordId: '6f1c2b0e-0000-4000-8000-000000000001' });

function context(): AgentSessionMcpContext {
    const session = {
        id: 'session-1',
        environmentId: 1,
        accountId: 1,
        resolvedConnections: { gmail: CONNECTION },
        compiledToolset: { gmail: { provider: 'google-mail', pinned: [], searchable: [] } },
        metaTools: { nangoToolSearch: true, nangoExecute: true, nangoProxy: false, nangoCreateConnection: { enabled: false, tags: {} }, nangoQueryResult: true }
    } as unknown as AgentSession;

    return { account: { id: 1 } as DBTeam, environment: { id: 1 } as DBEnvironment, plan: null, session, callable: new Map() };
}

async function query(): Promise<Result<unknown>> {
    return await queryResultTool.handler({ result_id: RESULT_ID, code: 'return result;', goal: 'count emails', intent: 'the result was stored' }, context());
}

function codeOf(result: Result<unknown>): string | undefined {
    if (result.isOk()) {
        expect.fail(`Expected an error, got ${JSON.stringify(result.value)}`);
    }
    return result.error instanceof PublicMcpError ? result.error.code : undefined;
}

let upsert: MockInstance<typeof records.upsert>;

beforeEach(() => {
    upsert = vi.spyOn(records, 'upsert').mockResolvedValue(Ok({} as UpsertSummary));
    vi.spyOn(inlineFunctionService, 'create').mockResolvedValue(Ok({ uuid: 'inline-1' } as never));
    invokeFunction.mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('nango_query_result', () => {
    it('returns a small output in full with a new result_id, so the agent can query it in turn', async () => {
        invokeFunction.mockResolvedValue(Ok({ data: { count: 3 } }));

        const result = (await query()).unwrap() as { result_id: string };

        expect(result).toEqual({ result_id: expect.any(String), truncated: false, data: { count: 3 } });
        expect(result.result_id).not.toBe(RESULT_ID);
        await vi.waitFor(() => expect(upsert).toHaveBeenCalled());
    });

    it('stores a large output as a new result on the same connection, so the agent can query it in turn', async () => {
        const output = Array.from({ length: 50 }, (_, i) => ({ id: `msg_${i}`, body: 'x'.repeat(500) }));
        invokeFunction.mockResolvedValue(Ok({ data: output }));

        const result = (await query()).unwrap() as { result_id: string };

        expect(result).toMatchObject({ truncated: true, shape: expect.any(String), hint: expect.stringContaining('nango_query_result') });
        expect(result.result_id).not.toBe(RESULT_ID);
        expect(decodeResultId(result.result_id)).toMatchObject({ integrationId: 'gmail' });
        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 10, model: '_nango_agent_session_session-1' }));
    });

    it('rejects an output over what can be stored', async () => {
        invokeFunction.mockResolvedValue(Ok({ data: 'a'.repeat(envs.AGENT_SESSION_RESULT_STORED_MAX_BYTES) }));

        const result = await query();

        expect(codeOf(result)).toBe('output_too_large');
        expect(upsert).not.toHaveBeenCalled();
    });

    it('returns a large output in full when it cannot be stored, since the code already ran', async () => {
        const output = 'a'.repeat(envs.AGENT_SESSION_RESULT_INLINE_MAX_BYTES * 2);
        invokeFunction.mockResolvedValue(Ok({ data: output }));
        upsert.mockResolvedValue(Err(new Error('records down')));

        expect((await query()).unwrap()).toEqual({ truncated: false, data: output });
    });
});
