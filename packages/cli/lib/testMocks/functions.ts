import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, vi } from 'vitest';

import { BASE_VARIANT } from '@nangohq/runner-sdk';

import { NangoSyncMock } from './utils.js';

import type { RecordedTrigger, UnifiedMock } from '../services/response-collector.service.js';
import type { FunctionCapabilities, FunctionRequires, Metadata } from '@nangohq/types';

interface ReplayableFunction {
    type: 'function';
    capabilities: FunctionCapabilities;
    requires?: FunctionRequires | undefined;
    exec: (nango: never, trigger: never) => unknown;
}

async function loadFixture(dirname: string, name: string): Promise<UnifiedMock> {
    const integration = path.basename(path.dirname(dirname));
    for (const filename of [`${name}.test.json`, `${integration}-${name}.test.json`]) {
        try {
            return JSON.parse(await fs.readFile(path.join(dirname, filename), 'utf8')) as UnifiedMock;
        } catch (err) {
            if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) {
                throw err;
            }
        }
    }
    throw new Error(`Missing saved fixture for ${name}. Record it with nango dryrun --save-responses.`);
}

function restoreTrigger(fixture: UnifiedMock, name: string): RecordedTrigger {
    if (!fixture.trigger) {
        throw new Error(`Missing trigger in saved fixture for ${name}. Record it again with nango dryrun --save.`);
    }
    return fixture.trigger;
}

/** Replay a native function or tool against a fixture recorded by dryrun --save-responses. */
export async function replayFunction({
    dirname,
    name,
    definition,
    mocks
}: {
    dirname: string;
    name: string;
    definition: ReplayableFunction;
    mocks?: Record<string, unknown>;
}): Promise<unknown> {
    const fixture = await loadFixture(dirname, name);
    const mock = new NangoSyncMock({ dirname, name, Model: '' });
    const trigger = restoreTrigger(fixture, name);
    const unsupported = (method: string) =>
        vi.fn(() => Promise.reject(new Error(`${method} is not recorded in dryrun fixtures. Add an explicit mock to the test.`)));
    const sdk: Record<string, unknown> = {
        log: mock.log,
        setLogger: vi.fn(),
        getEnvironmentVariables: unsupported('getEnvironmentVariables')
    };

    if (definition.requires?.connection === false) {
        sdk['searchConnections'] = unsupported('searchConnections');
    } else {
        Object.assign(sdk, {
            getConnection: mock.getConnection,
            getToken: unsupported('getToken'),
            getIntegration: unsupported('getIntegration'),
            getVariant: () => fixture.variant ?? BASE_VARIANT
        });
    }

    if (definition.capabilities.usesOutbound) {
        Object.assign(sdk, {
            proxy: mock.proxy,
            get: mock.get,
            post: mock.post,
            put: mock.put,
            patch: mock.patch,
            delete: mock.delete,
            paginate: mock.paginate,
            uncontrolledFetch: unsupported('uncontrolledFetch')
        });
    }

    if (definition.capabilities.usesRecords) {
        Object.assign(sdk, {
            batchSave: mock.batchSave,
            batchDelete: mock.batchDelete,
            batchUpdate: unsupported('batchUpdate'),
            setMergingStrategy: vi.fn().mockResolvedValue(undefined),
            trackDeletesStart: mock.trackDeletesStart,
            trackDeletesEnd: mock.trackDeletesEnd
        });
    }

    if (definition.capabilities.usesCheckpoints) {
        if (fixture.checkpoint !== undefined) {
            await mock.saveCheckpoint(fixture.checkpoint);
        }
        Object.assign(sdk, {
            getCheckpoint: vi.fn(async () => (await mock.getCheckpoint()) ?? undefined),
            saveCheckpoint: mock.saveCheckpoint,
            clearCheckpoint: mock.clearCheckpoint
        });
    }

    if (definition.capabilities.usesMetadata) {
        let metadata = fixture.nango.getMetadata;
        const getMetadata = vi.fn(() => (metadata === undefined ? (mock.getMetadata() as Promise<Metadata>) : Promise.resolve(metadata)));
        Object.assign(sdk, {
            getMetadata,
            setMetadata: vi.fn((value: Metadata) => {
                metadata = value;
                return Promise.resolve();
            }),
            updateMetadata: vi.fn(async (value: Partial<Metadata>) => {
                metadata = { ...(await getMetadata()), ...value };
            })
        });
    }

    if (definition.capabilities.usesInvoke) {
        sdk['invoke'] = unsupported('invoke');
    }

    Object.assign(sdk, mocks);
    const output = await definition.exec(sdk as never, trigger as never);
    const json = (value: unknown): unknown => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
    expect(json(output)).toEqual(fixture.output);

    for (const [method, expected] of [
        [mock.batchSave, fixture.nango.batchSave],
        [mock.batchDelete, fixture.nango.batchDelete]
    ] as const) {
        const modelFullName = (model: unknown) =>
            fixture.variant && fixture.variant !== BASE_VARIANT ? `${String(model)}::${fixture.variant}` : String(model);
        const models = new Set([...Object.keys(expected ?? {}), ...method.mock.calls.map((call) => modelFullName(call[1]))]);
        for (const model of models) {
            const records = method.mock.calls.flatMap((call) => (modelFullName(call[1]) === model ? (call[0] as unknown[]) : []));
            expect(json(records), `${name}: records for ${model}`).toEqual(expected?.[model] ?? []);
        }
    }
    return output;
}
