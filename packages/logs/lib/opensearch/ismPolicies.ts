import { errors as osErrors } from '@opensearch-project/opensearch';

import { envs } from '../env.js';
import { policyMessages, policyOperations } from '../es/schema.js';
import { logger } from '../utils.js';

import type { Client as OpenSearchClient } from '@opensearch-project/opensearch';

/**
 * OpenSearch Index State Management policies mirroring our Elasticsearch ILM intent.
 * Target: OpenSearch 2.x with the ISM plugin enabled (default in OpenSearch distributions).
 *
 * Messages and operations policies both use a simple hot → delete flow. Warm/shrink/readonly
 * from Elasticsearch ILM are not replicated here because ISM action shapes differ by OpenSearch
 * version and often fail on managed clusters; advanced tuning can be done via custom policies in-cluster.
 *
 * PUT returns 409 when the policy document already exists (e.g. restart or rolling deploy). That is
 * treated as success; use the ISM API with seq_no/primary_term if you need to change an existing policy.
 */
export async function putIsmPolicies(client: OpenSearchClient): Promise<void> {
    const policies = [buildRetentionIsmPolicy(policyOperations.name), buildRetentionIsmPolicy(policyMessages.name)];
    for (const { id, body } of policies) {
        try {
            await client.transport.request({
                method: 'PUT',
                path: `/_plugins/_ism/policies/${encodeURIComponent(id)}`,
                body
            });
        } catch (err: unknown) {
            if (err instanceof osErrors.ResponseError) {
                if (err.statusCode === 409) {
                    logger.info(`ISM policy "${id}" already exists (409), skipping create`);
                    continue;
                }
            }
            throw err;
        }
    }
}

function buildRetentionIsmPolicy(id: string): { id: string; body: Record<string, unknown> } {
    return {
        id,
        body: {
            policy: {
                policy_id: id,
                description: `Nango logs retention (ISM): delete indices after ${envs.NANGO_LOGS_ES_RETENTION_PERIOD}`,
                default_state: 'hot',
                states: [
                    {
                        name: 'hot',
                        actions: [],
                        transitions: [
                            {
                                state_name: 'delete',
                                conditions: { min_index_age: envs.NANGO_LOGS_ES_RETENTION_PERIOD }
                            }
                        ]
                    },
                    {
                        name: 'delete',
                        actions: [{ delete: {} }]
                    }
                ]
            }
        }
    };
}
