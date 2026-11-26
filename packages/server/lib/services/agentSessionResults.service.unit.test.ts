import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { envs } from '../env.js';
import { decodeResultId, encodeResultId, formatMegabytes, storeLargeResult, toolResultForAgent } from './agentSessionResults.service.js';

import type { AgentSession, AgentSessionResolvedConnection } from '@nangohq/types';

const mocks = vi.hoisted(() => ({
    upsert: vi.fn(),
    setTag: vi.fn()
}));

vi.mock('dd-trace', () => {
    const span = {
        setTag(...args: unknown[]) {
            mocks.setTag(...args);
            return span;
        }
    };
    return { default: { trace: (_name: string, fn: (s: typeof span) => unknown) => fn(span) } };
});

vi.mock('@nangohq/records', () => ({
    records: { upsert: mocks.upsert },
    format: { formatRecords: ({ data }: { data: unknown[] }) => Ok(data) }
}));

const MODEL = '_nango_agent_session_session-1';

const CONNECTION: AgentSessionResolvedConnection = {
    integrationId: 'gmail',
    provider: 'google-mail',
    connectionId: 'gmail-acme',
    internalConnectionId: 10,
    configId: 20
};

const SESSION = {
    id: 'session-1',
    metaTools: { nangoToolSearch: true, nangoExecute: true, nangoProxy: false, nangoCreateConnection: { enabled: false, tags: {} }, nangoQueryResult: true },
    resolvedConnections: { gmail: CONNECTION }
} as unknown as AgentSession;

const LARGE = { emails: Array.from({ length: 50 }, (_, i) => ({ id: `msg_${i}`, body: 'x'.repeat(500) })) };

async function resultFor(data: unknown, session: AgentSession = SESSION): Promise<unknown> {
    return await toolResultForAgent({
        environmentId: 1,
        plan: null,
        session,
        connection: CONNECTION,
        toolName: 'list_emails',
        data
    });
}

beforeEach(() => {
    mocks.upsert.mockReset().mockResolvedValue(Ok({ addedKeys: [], updatedKeys: [], deletedKeys: [], nonUniqueKeys: [] }));
    mocks.setTag.mockReset();
});

describe('toolResultForAgent', () => {
    it('returns a result at the inline threshold unchanged and stores nothing', async () => {
        const data = { text: 'a'.repeat(envs.AGENT_SESSION_RESULT_INLINE_MAX_BYTES - '{"text":""}'.length) };

        await expect(resultFor(data)).resolves.toBe(data);
        expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it.each([
        ['off', false],
        ['absent, as on a session created before it', undefined]
    ])('returns a large result unchanged when nango_query_result is %s', async (_, nangoQueryResult) => {
        const session = { ...SESSION, metaTools: { ...SESSION.metaTools, nangoQueryResult } } as AgentSession;

        await expect(resultFor(LARGE, session)).resolves.toBe(LARGE);
        expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it('stores a large result under the session model and returns a reference with its shape and a sample', async () => {
        const result = (await resultFor(LARGE)) as Record<string, unknown>;

        expect(mocks.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                connectionId: 10,
                environmentId: 1,
                model: MODEL,
                records: [expect.objectContaining({ tool: 'list_emails', data: LARGE })]
            })
        );
        const [[{ records: storedRecords }]] = mocks.upsert.mock.calls as [[{ records: { id: string }[] }]];
        const storedId = storedRecords[0]?.id;
        expect(decodeResultId(result['result_id'] as string)).toEqual({ integrationId: 'gmail', recordId: storedId });
        expect(result).toMatchObject({
            truncated: true,
            bytes: Buffer.byteLength(JSON.stringify(LARGE)),
            shape: expect.stringContaining('emails: {'),
            sample: { emails: [expect.anything(), expect.anything(), '… 48 more items'] },
            hint: expect.stringContaining('nango_query_result')
        });
        expect(result).not.toHaveProperty('data');
    });

    it('returns the result in full with a notice when it is too large to store', async () => {
        const huge = { text: 'a'.repeat(envs.AGENT_SESSION_RESULT_STORED_MAX_BYTES) };

        await expect(resultFor(huge)).resolves.toEqual({
            data: huge,
            notice: expect.stringContaining(formatMegabytes(envs.AGENT_SESSION_RESULT_STORED_MAX_BYTES))
        });
        expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it('returns the result in full and tags the span with the error when storing fails, since the tool already ran', async () => {
        const error = new Error('records down');
        mocks.upsert.mockResolvedValue(Err(error));

        await expect(resultFor(LARGE)).resolves.toBe(LARGE);
        expect(mocks.setTag).toHaveBeenCalledWith('error', error);
    });
});

describe('storeLargeResult', () => {
    const store = async (data: unknown) =>
        await storeLargeResult({ environmentId: 1, plan: null, session: SESSION, connection: CONNECTION, toolName: 'nango_proxy', data });

    it('leaves a small result inline', async () => {
        await expect(store({ ok: true })).resolves.toEqual({ kind: 'inline' });
    });

    it('stores a large result under the tool that returned it', async () => {
        await expect(store(LARGE)).resolves.toMatchObject({ kind: 'stored', result: { truncated: true } });
        expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ records: [expect.objectContaining({ tool: 'nango_proxy' })] }));
    });

    it('says when a result is over what can be stored, so the caller picks what to return', async () => {
        await expect(store({ text: 'a'.repeat(envs.AGENT_SESSION_RESULT_STORED_MAX_BYTES) })).resolves.toEqual({ kind: 'over_stored_limit' });
        expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it('says storing failed when the records store throws', async () => {
        mocks.upsert.mockRejectedValue(new Error('connection reset'));

        await expect(store(LARGE)).resolves.toEqual({ kind: 'store_failed' });
    });

    it('says when storing failed', async () => {
        mocks.upsert.mockResolvedValue(Err(new Error('records down')));

        await expect(store(LARGE)).resolves.toEqual({ kind: 'store_failed' });
    });
});

describe('formatMegabytes', () => {
    it.each([
        [2 * 1024 * 1024, '2 MB'],
        [2.5 * 1024 * 1024, '2.5 MB'],
        [512 * 1024, '0.5 MB']
    ])('formats %d bytes as %s', (bytes, expected) => {
        expect(formatMegabytes(bytes)).toBe(expected);
    });
});

describe('result ids', () => {
    it('round trip', () => {
        const ref = { integrationId: 'gmail', recordId: '6f1c2b0e-0000-4000-8000-000000000001' };

        expect(decodeResultId(encodeResultId(ref))).toEqual(ref);
    });

    it.each([
        '',
        'not-base64!',
        Buffer.from('{"a":1}').toString('base64url'),
        Buffer.from('["only-one"]').toString('base64url'),
        Buffer.from('["gmail","not-a-uuid"]').toString('base64url')
    ])('reject %j', (resultId) => {
        expect(decodeResultId(resultId)).toBeNull();
    });
});
