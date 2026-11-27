import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { envs } from '../env.js';
import { decodeResultId, encodeResultId, formatMegabytes, storeResult, toolResultForAgent } from './agentSessionResults.service.js';

import type { AgentSession, AgentSessionResolvedConnection } from '@nangohq/types';

const mocks = vi.hoisted(() => ({
    upsert: vi.fn(),
    setTag: vi.fn(),
    warn: vi.fn(),
    getLog: vi.fn()
}));

vi.mock('@nangohq/logs', () => ({
    logContextGetter: { get: mocks.getLog }
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
    accountId: 7,
    metaTools: { nangoToolSearch: true, nangoExecute: true, nangoProxy: false, nangoCreateConnection: { enabled: false, tags: {} }, nangoQueryResult: true },
    resolvedConnections: { gmail: CONNECTION }
} as unknown as AgentSession;

const SMALL = { emails: [{ id: 'msg_1', subject: 'hi' }] };
const LARGE = { emails: Array.from({ length: 50 }, (_, i) => ({ id: `msg_${i}`, body: 'x'.repeat(500) })) };
const HUGE = { text: 'a'.repeat(envs.AGENT_SESSION_RESULT_STORED_MAX_BYTES) };

async function resultFor(data: unknown, session: AgentSession = SESSION): Promise<Record<string, unknown> | null> {
    return (await toolResultForAgent({
        environmentId: 1,
        plan: null,
        session,
        connection: CONNECTION,
        toolName: 'list_emails',
        data,
        logOperationId: 'op-1'
    })) as Record<string, unknown> | null;
}

function storedRecordId(): string | undefined {
    const [[{ records: storedRecords }]] = mocks.upsert.mock.calls as [[{ records: { id: string }[] }]];
    return storedRecords[0]?.id;
}

beforeEach(() => {
    mocks.upsert.mockReset().mockResolvedValue(Ok({ addedKeys: [], updatedKeys: [], deletedKeys: [], nonUniqueKeys: [] }));
    mocks.setTag.mockReset();
    mocks.warn.mockReset().mockResolvedValue(true);
    mocks.getLog.mockReset().mockReturnValue({ warn: mocks.warn });
});

describe('toolResultForAgent', () => {
    it.each([
        ['off', false],
        ['absent, as on a session created before it', undefined]
    ])('returns null and stores nothing when nango_query_result is %s', async (_, nangoQueryResult) => {
        const session = { ...SESSION, metaTools: { ...SESSION.metaTools, nangoQueryResult } } as AgentSession;

        await expect(resultFor(LARGE, session)).resolves.toBeNull();
        expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it('returns a small result in full with the id it is stored under', async () => {
        const result = await resultFor(SMALL);

        expect(result).toEqual({ result_id: expect.any(String), truncated: false, data: SMALL });
        await vi.waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
        expect(mocks.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                connectionId: 10,
                environmentId: 1,
                model: MODEL,
                records: [expect.objectContaining({ tool: 'list_emails', data: SMALL })]
            })
        );
        expect(decodeResultId(result?.['result_id'] as string)).toEqual({ integrationId: 'gmail', recordId: storedRecordId() });
    });

    it.each([
        ['at the inline limit in full', 0, false],
        ['one byte over it truncated', 1, true]
    ])('returns a result %s', async (_, extra, truncated) => {
        const data = { text: 'a'.repeat(envs.AGENT_SESSION_RESULT_INLINE_MAX_BYTES - '{"text":""}'.length + extra) };

        await expect(resultFor(data)).resolves.toMatchObject({ truncated });
    });

    it('returns a small result before it is stored', async () => {
        mocks.upsert.mockReturnValue(new Promise(() => {}));

        await expect(resultFor(SMALL)).resolves.toMatchObject({ truncated: false, data: SMALL });
    });

    it('reports a small result that fails to store on the tool run, and still returns its id', async () => {
        const error = new Error('records down');
        mocks.upsert.mockResolvedValue(Err(error));

        await expect(resultFor(SMALL)).resolves.toMatchObject({ result_id: expect.any(String), truncated: false, data: SMALL });
        await vi.waitFor(() => expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('Could not store the result'), { error }));
        expect(mocks.getLog).toHaveBeenCalledWith({ id: 'op-1', accountId: 7 });
        expect(mocks.setTag).toHaveBeenCalledWith('error', error);
    });

    it('stores a large result first and returns its shape and a sample in place of the data', async () => {
        const result = await resultFor(LARGE);

        expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ model: MODEL, records: [expect.objectContaining({ data: LARGE })] }));
        expect(decodeResultId(result?.['result_id'] as string)).toEqual({ integrationId: 'gmail', recordId: storedRecordId() });
        expect(result).toMatchObject({
            truncated: true,
            bytes: Buffer.byteLength(JSON.stringify(LARGE)),
            shape: expect.stringContaining('emails: {'),
            sample: { emails: [expect.anything(), expect.anything(), '… 48 more items'] },
            hint: expect.stringContaining('nango_query_result')
        });
        expect(result).not.toHaveProperty('data');
    });

    it.each([
        ['returns', (error: Error) => mocks.upsert.mockResolvedValue(Err(error))],
        ['throws', (error: Error) => mocks.upsert.mockRejectedValue(error)]
    ])('returns a large result in full with no id and reports it on the tool run when storing %s, since the tool already ran', async (_, fail) => {
        const error = new Error('records down');
        fail(error);

        await expect(resultFor(LARGE)).resolves.toEqual({ truncated: false, data: LARGE });
        expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('Could not store the result'), { error });
        expect(mocks.setTag).toHaveBeenCalledWith('error', error);
    });

    it('returns a result over what can be stored in full with a notice, and reports it on the tool run', async () => {
        await expect(resultFor(HUGE)).resolves.toEqual({
            truncated: false,
            data: HUGE,
            notice: expect.stringContaining(formatMegabytes(envs.AGENT_SESSION_RESULT_STORED_MAX_BYTES))
        });
        expect(mocks.upsert).not.toHaveBeenCalled();
        expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('over the'), { bytes: expect.any(Number) });
    });

    it('still returns the result when reporting a failed store on the tool run throws', async () => {
        mocks.upsert.mockResolvedValue(Err(new Error('records down')));
        mocks.getLog.mockImplementation(() => {
            throw new Error('logs down');
        });

        await expect(resultFor(LARGE)).resolves.toEqual({ truncated: false, data: LARGE });
    });

    it('reports nothing when the tool run has no log operation', async () => {
        mocks.upsert.mockResolvedValue(Err(new Error('records down')));

        await toolResultForAgent({
            environmentId: 1,
            plan: null,
            session: SESSION,
            connection: CONNECTION,
            toolName: 'list_emails',
            data: LARGE,
            logOperationId: undefined
        });

        expect(mocks.getLog).not.toHaveBeenCalled();
    });
});

describe('storeResult', () => {
    const store = async (data: unknown) =>
        await storeResult({ environmentId: 1, plan: null, session: SESSION, connection: CONNECTION, toolName: 'nango_proxy', data, logOperationId: 'op-1' });

    it('stores a result under the tool that returned it', async () => {
        await expect(store(LARGE)).resolves.toMatchObject({ kind: 'stored', result: { truncated: true } });
        expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ records: [expect.objectContaining({ tool: 'nango_proxy' })] }));
    });

    it('says when a result is over what can be stored, so the caller picks what to return', async () => {
        await expect(store(HUGE)).resolves.toEqual({ kind: 'over_stored_limit' });
        expect(mocks.upsert).not.toHaveBeenCalled();
        expect(mocks.warn).not.toHaveBeenCalled();
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
