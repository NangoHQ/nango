import { envs } from '../env.js';
import { policyMessages, policyOperations } from '../es/schema.js';

import type { Client as OpenSearchClient } from '@opensearch-project/opensearch';

/**
 * OpenSearch Index State Management policies mirroring our Elasticsearch ILM intent.
 * Target: OpenSearch 2.x with the ISM plugin enabled (default in OpenSearch distributions).
 */
export async function putIsmPolicies(client: OpenSearchClient): Promise<void> {
    const policies = [buildOperationsIsmPolicy(), buildMessagesIsmPolicy()];
    for (const { id, body } of policies) {
        await client.transport.request({
            method: 'PUT',
            path: `/_plugins/_ism/policies/${encodeURIComponent(id)}`,
            body
        });
    }
}

function buildOperationsIsmPolicy(): { id: string; body: Record<string, unknown> } {
    const id = policyOperations.name;
    return {
        id,
        body: {
            policy: {
                policy_id: id,
                description: 'Nango logs operations retention (ISM)',
                default_state: 'hot',
                states: [
                    {
                        name: 'hot',
                        actions: [],
                        transitions: [
                            {
                                state_name: 'delete',
                                conditions: { min_index_age: '15d' }
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

function buildMessagesIsmPolicy(): { id: string; body: Record<string, unknown> } {
    const id = policyMessages.name;
    const warmAfter = envs.NANGO_LOGS_ES_WARM_MIN_AGE;
    return {
        id,
        body: {
            policy: {
                policy_id: id,
                description: 'Nango logs messages retention (ISM)',
                default_state: 'hot',
                states: [
                    {
                        name: 'hot',
                        actions: [],
                        transitions: [
                            {
                                state_name: 'warm',
                                conditions: { min_index_age: warmAfter }
                            }
                        ]
                    },
                    {
                        name: 'warm',
                        actions: [
                            {
                                retry: { count: 3, backoff: 'exponential', delay: '1m' },
                                shrink: { number_of_shards: 1 }
                            },
                            { read_only: {} }
                        ],
                        transitions: [
                            {
                                state_name: 'delete',
                                conditions: { min_index_age: '15d' }
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
