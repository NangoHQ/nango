import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { nanoid } from '@nangohq/utils';

import { envs } from '../env.js';
import { getFormattedOperation } from '../models/helpers.js';
import { createOperation, getOperation, updateOperation } from '../models/operations.js';
import { putIsmPolicies } from '../opensearch/ismPolicies.js';
import { client, logsStorage } from '../storage/client.js';
import { deleteIndex, migrateMapping } from './helpers.js';
import { indexOperations, policyMessages, policyOperations, retentionMinAge } from './schema.js';

interface IsmPolicyBody {
    policy: { states: { name: string; transitions?: { conditions: { min_index_age: string } }[] }[] };
}

async function getIsmPolicy(raw: OpenSearchClient, id: string): Promise<IsmPolicyBody & { _seq_no: number; _primary_term: number }> {
    const res = await raw.transport.request({ method: 'GET', path: `/_plugins/_ism/policies/${id}` });
    return res.body as IsmPolicyBody & { _seq_no: number; _primary_term: number };
}

function minIndexAgeOf(body: IsmPolicyBody): string | undefined {
    return body.policy.states.find((s) => s.transitions && s.transitions.length > 0)?.transitions?.[0]?.conditions.min_index_age;
}

// This file is sequential
describe('mapping', () => {
    const today = new Date().toISOString().split('T')[0];
    let fullIndexName: string;
    beforeAll(async () => {
        indexOperations.index = `index-operations-${nanoid()}`.toLocaleLowerCase();
        fullIndexName = `${indexOperations.index}.${today}`;

        // Delete before otherwise it's hard to debug
        await deleteIndex({ prefix: 'index-operations' });
    });

    it('should not have an index before migration', async () => {
        await expect(client.indices.getMapping({ index: fullIndexName })).rejects.toThrow();
    });

    it('should migrate', async () => {
        await migrateMapping();
    });

    it('should have create index and alias', async () => {
        await client.indices.getMapping({ index: indexOperations.index });

        await client.indices.getMapping({ index: fullIndexName });
    });

    it('should create one index automatically on operation', async () => {
        const today = new Date();
        // Log to automatically create an index
        const id = nanoid();
        await createOperation(getFormattedOperation({ id, operation: { type: 'action', action: 'run' }, createdAt: today.toISOString() }));
        await updateOperation({ id, data: { state: 'failed', createdAt: today.toISOString() } });

        // Should have created a today index
        const mapping = await client.indices.getMapping({ index: fullIndexName });
        expect(mapping[fullIndexName]).toMatchSnapshot(`${envs.NANGO_LOGS_PROVIDER}-mapping`);

        const settings = await client.indices.getSettings({ index: fullIndexName });
        expect(settings[fullIndexName]?.settings?.index?.['analysis']).toMatchSnapshot(`${envs.NANGO_LOGS_PROVIDER}-analysis`);
        expect(settings[fullIndexName]?.settings?.index?.['sort']).toMatchSnapshot(`${envs.NANGO_LOGS_PROVIDER}-sort`);
        if (envs.NANGO_LOGS_PROVIDER === 'elasticsearch') {
            expect(settings[fullIndexName]?.settings?.index?.['lifecycle']).toMatchSnapshot(`${envs.NANGO_LOGS_PROVIDER}-lifecycle`);
        } else {
            const idx = settings[fullIndexName]?.settings?.index as { plugins?: { index_state_management?: { policy_id?: string } } } | undefined;
            expect(idx?.plugins?.index_state_management?.policy_id).toBe(policyOperations.name);
        }
    });

    it('should create yesterday index automatically', async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayIndexName = `${indexOperations.index}.${yesterday.toISOString().split('T')[0]}`;

        // Log to automatically create an index
        const id = nanoid();
        await createOperation(getFormattedOperation({ id, operation: { type: 'action', action: 'run' }, createdAt: yesterday.toISOString() }));
        await updateOperation({ id, data: { state: 'failed', createdAt: yesterday.toISOString() } });

        // Should have created a yesterday index
        await client.indices.getMapping({ index: yesterdayIndexName });
        const doc = await getOperation({ id });
        expect(doc.state).toBe('failed');
    });
});

describe('retention policy', () => {
    let raw: OpenSearchClient | ElasticsearchClient;

    beforeAll(() => {
        const node = envs.NANGO_LOGS_ES_URL || 'http://localhost:9200';
        const auth = { username: envs.NANGO_LOGS_ES_USER!, password: envs.NANGO_LOGS_ES_PWD! };
        raw = envs.NANGO_LOGS_PROVIDER === 'opensearch' ? new OpenSearchClient({ node, auth }) : new ElasticsearchClient({ node, auth });
    });

    afterAll(async () => {
        await raw.close();
    });

    it('sets the real min_age/min_index_age to NANGO_LOGS_ES_RETENTION_DAYS after migration', async () => {
        await migrateMapping();

        if (envs.NANGO_LOGS_PROVIDER === 'opensearch') {
            const policy = await getIsmPolicy(raw as OpenSearchClient, policyOperations.name);
            expect(minIndexAgeOf(policy)).toBe(retentionMinAge);
        } else {
            const res = await (raw as ElasticsearchClient).ilm.getLifecycle({ name: policyOperations.name });
            expect(res[policyOperations.name]?.policy?.phases.delete?.min_age).toBe(retentionMinAge);
        }
    });

    it.skipIf(envs.NANGO_LOGS_PROVIDER !== 'opensearch')('updates an existing ISM policy in place instead of silently leaving it stale', async () => {
        const openSearchRaw = raw as OpenSearchClient;
        await putIsmPolicies(openSearchRaw);

        try {
            const existing = await getIsmPolicy(openSearchRaw, policyOperations.name);
            const staleBody = {
                policy: {
                    policy_id: policyOperations.name,
                    description: 'stale policy seeded directly by the test, bypassing our code',
                    default_state: 'hot',
                    states: [
                        { name: 'hot', actions: [], transitions: [{ state_name: 'delete', conditions: { min_index_age: '999d' } }] },
                        { name: 'delete', actions: [{ delete: {} }] }
                    ]
                }
            };
            await openSearchRaw.transport.request({
                method: 'PUT',
                path: `/_plugins/_ism/policies/${policyOperations.name}`,
                querystring: { if_seq_no: existing._seq_no, if_primary_term: existing._primary_term },
                body: staleBody
            });
            const seeded = await getIsmPolicy(openSearchRaw, policyOperations.name);
            expect(minIndexAgeOf(seeded)).toBe('999d');

            await putIsmPolicies(openSearchRaw);

            const after = await getIsmPolicy(openSearchRaw, policyOperations.name);
            expect(minIndexAgeOf(after)).toBe(retentionMinAge);
        } finally {
            await putIsmPolicies(openSearchRaw);
        }
    });

    it.skipIf(envs.NANGO_LOGS_PROVIDER !== 'elasticsearch')('updates an existing ILM policy in place on redeploy', async () => {
        const esRaw = raw as ElasticsearchClient;

        try {
            await esRaw.ilm.putLifecycle({
                name: policyMessages.name,
                policy: { phases: { hot: { min_age: '0ms', actions: {} }, delete: { min_age: '999d', actions: { delete: {} } } } }
            });
            const seeded = await esRaw.ilm.getLifecycle({ name: policyMessages.name });
            expect(seeded[policyMessages.name]?.policy?.phases.delete?.min_age).toBe('999d');

            await logsStorage.setupPolicies({ messagesPolicy: policyMessages, operationsPolicy: policyOperations });

            const after = await esRaw.ilm.getLifecycle({ name: policyMessages.name });
            expect(after[policyMessages.name]?.policy?.phases.delete?.min_age).toBe(retentionMinAge);
        } finally {
            await logsStorage.setupPolicies({ messagesPolicy: policyMessages, operationsPolicy: policyOperations });
        }
    });
});
