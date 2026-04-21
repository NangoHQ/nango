import { policyMessages, policyOperations } from '../es/schema.js';

import type { Client as OpenSearchClient } from '@opensearch-project/opensearch';

/**
 * OpenSearch Index State Management policies mirroring our Elasticsearch ILM intent.
 * Target: OpenSearch 2.x with the ISM plugin enabled (default in OpenSearch distributions).
 *
 * Messages and operations policies both use a simple hot → delete (15d) flow. Warm/shrink/readonly
 * from Elasticsearch ILM are not replicated here because ISM action shapes differ by OpenSearch
 * version and often fail on managed clusters; advanced tuning can be done via custom policies in-cluster.
 */
export async function putIsmPolicies(client: OpenSearchClient): Promise<void> {
    const policies = [buildRetentionIsmPolicy(policyOperations.name), buildRetentionIsmPolicy(policyMessages.name)];
    for (const { id, body } of policies) {
        await client.transport.request({
            method: 'PUT',
            path: `/_plugins/_ism/policies/${encodeURIComponent(id)}`,
            body
        });
    }
}

function buildRetentionIsmPolicy(id: string): { id: string; body: Record<string, unknown> } {
    return {
        id,
        body: {
            policy: {
                policy_id: id,
                description: 'Nango logs retention (ISM): delete indices after 15d',
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
