import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import {
    decodeResultId,
    encodeResultId,
    INLINE_RESULT_MAX_BYTES,
    MAX_STORED_BYTES_PER_SESSION,
    MAX_STORED_RESULT_BYTES,
    MAX_STORED_RESULTS_PER_SESSION,
    toolResultForAgent
} from './agentSessionResults.service.js';

import type { AgentSession, AgentSessionResolvedConnection } from '@nangohq/types';
import type * as NangoUtils from '@nangohq/utils';

const mocks = vi.hoisted(() => ({
    upsert: vi.fn(),
    getCountsByModel: vi.fn(),
    report: vi.fn()
}));

vi.mock('@nangohq/records', () => ({
    records: { upsert: mocks.upsert, getCountsByModel: mocks.getCountsByModel },
    format: { formatRecords: ({ data }: { data: unknown[] }) => Ok(data) }
}));
vi.mock('@nangohq/utils', async (importOriginal) => ({
    ...(await importOriginal<typeof NangoUtils>()),
    report: mocks.report
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
    metaTools: { nangoToolSearch: true, nangoExecute: true, nangoProxy: false, nangoCreateConnection: { enabled: false, tags: {} }, nangoRunCode: true },
    resolvedConnections: {
        gmail: CONNECTION,
        notion: { integrationId: 'notion', provider: 'notion', connectionId: 'notion-acme', internalConnectionId: 11, configId: 21 }
    }
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

function countsOf(count: number, sizeBytes: number) {
    return Ok({ [MODEL]: { model: MODEL, count, size_bytes: sizeBytes } });
}

beforeEach(() => {
    mocks.upsert.mockReset().mockResolvedValue(Ok({ addedKeys: [], updatedKeys: [], deletedKeys: [], nonUniqueKeys: [] }));
    mocks.getCountsByModel.mockReset().mockResolvedValue(Ok({}));
    mocks.report.mockReset();
});

describe('toolResultForAgent', () => {
    it('returns a result at the inline threshold unchanged and stores nothing', async () => {
        const data = { text: 'a'.repeat(INLINE_RESULT_MAX_BYTES - '{"text":""}'.length) };

        await expect(resultFor(data)).resolves.toBe(data);
        expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it.each([
        ['off', false],
        ['absent, as on a session created before it', undefined]
    ])('returns a large result unchanged when nango_run_code is %s', async (_, nangoRunCode) => {
        const session = { ...SESSION, metaTools: { ...SESSION.metaTools, nangoRunCode } } as AgentSession;

        await expect(resultFor(LARGE, session)).resolves.toBe(LARGE);
        expect(mocks.getCountsByModel).not.toHaveBeenCalled();
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
            hint: expect.stringContaining('nango_run_code')
        });
        expect(result).not.toHaveProperty('data');
    });

    it('counts what every connection of the session already stores', async () => {
        await resultFor(LARGE);

        expect(mocks.getCountsByModel.mock.calls.map(([params]) => params)).toEqual([
            { connectionId: 10, environmentId: 1, models: [MODEL] },
            { connectionId: 11, environmentId: 1, models: [MODEL] }
        ]);
    });

    it('returns the result in full with a notice once the session holds the most results it can', async () => {
        mocks.getCountsByModel.mockResolvedValueOnce(countsOf(MAX_STORED_RESULTS_PER_SESSION - 1, 0)).mockResolvedValueOnce(countsOf(1, 0));

        await expect(resultFor(LARGE)).resolves.toEqual({ data: LARGE, notice: expect.stringContaining(`${MAX_STORED_RESULTS_PER_SESSION} results`) });
        expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it('returns the result in full with a notice when it would take the session over its stored bytes', async () => {
        mocks.getCountsByModel.mockResolvedValueOnce(countsOf(1, MAX_STORED_BYTES_PER_SESSION - 100));

        await expect(resultFor(LARGE)).resolves.toEqual({ data: LARGE, notice: expect.stringContaining('200 MB') });
        expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it('returns the result in full with a notice when it is too large to store', async () => {
        const huge = { text: 'a'.repeat(MAX_STORED_RESULT_BYTES) };

        await expect(resultFor(huge)).resolves.toEqual({ data: huge, notice: expect.stringContaining('10 MB') });
        expect(mocks.getCountsByModel).not.toHaveBeenCalled();
        expect(mocks.upsert).not.toHaveBeenCalled();
    });

    it('returns the result in full and reports when storing fails, since the tool already ran', async () => {
        const error = new Error('records down');
        mocks.upsert.mockResolvedValue(Err(error));

        await expect(resultFor(LARGE)).resolves.toBe(LARGE);
        expect(mocks.report).toHaveBeenCalledWith(error);
    });

    it('returns the result in full and reports when the session usage cannot be read', async () => {
        const error = new Error('counts down');
        mocks.getCountsByModel.mockResolvedValue(Err(error));

        await expect(resultFor(LARGE)).resolves.toBe(LARGE);
        expect(mocks.report).toHaveBeenCalledWith(error);
        expect(mocks.upsert).not.toHaveBeenCalled();
    });
});

describe('result ids', () => {
    it('round trip', () => {
        const ref = { integrationId: 'gmail', recordId: '6f1c2b0e-0000-4000-8000-000000000001' };

        expect(decodeResultId(encodeResultId(ref))).toEqual(ref);
    });

    it.each(['', 'not-base64!', Buffer.from('{"a":1}').toString('base64url'), Buffer.from('["only-one"]').toString('base64url')])('reject %j', (resultId) => {
        expect(decodeResultId(resultId)).toBeNull();
    });
});
