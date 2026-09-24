import { errors as osErrors } from '@opensearch-project/opensearch';

import { policyMessages, policyOperations, retentionMinAge } from '../es/schema.js';
import { logger } from '../utils.js';

import type { Client as OpenSearchClient } from '@opensearch-project/opensearch';

/**
 * OpenSearch Index State Management policies mirroring our Elasticsearch ILM intent.
 * Target: OpenSearch 2.x with the ISM plugin enabled (default in OpenSearch distributions).
 *
 * Messages and operations policies both use a simple hot → delete flow, after `retentionMinAge`
 * (NANGO_LOGS_ES_RETENTION_DAYS, default 15d). Warm/shrink/readonly from Elasticsearch ILM are not
 * replicated here because ISM action shapes differ by OpenSearch version and often fail on managed
 * clusters; advanced tuning can be done via custom policies in-cluster.
 *
 * Unlike Elasticsearch's ILM PUT (a plain upsert), OpenSearch ISM requires the current
 * seq_no/primary_term to modify an existing policy, otherwise it 409s. So each policy is fetched
 * first: if it exists, the PUT carries its seq_no/primary_term to update it in place (picking up any
 * retention change on redeploy); if it doesn't, a plain create is issued. A 409 on the versioned PUT
 * means another instance updated (or created) it concurrently — its write wins, so we skip.
 */
export async function putIsmPolicies(client: OpenSearchClient): Promise<void> {
    const policies = [buildRetentionIsmPolicy(policyOperations.name), buildRetentionIsmPolicy(policyMessages.name)];
    for (const { id, body } of policies) {
        await putIsmPolicy(client, id, body);
    }
}

async function putIsmPolicy(client: OpenSearchClient, id: string, body: Record<string, unknown>): Promise<void> {
    const existing = await getIsmPolicyVersion(client, id);

    try {
        await client.transport.request({
            method: 'PUT',
            path: `/_plugins/_ism/policies/${encodeURIComponent(id)}`,
            ...(existing ? { querystring: { if_seq_no: existing.seqNo, if_primary_term: existing.primaryTerm } } : {}),
            body
        });
    } catch (err: unknown) {
        if (err instanceof osErrors.ResponseError && err.statusCode === 409) {
            logger.info(`ISM policy "${id}" was created or updated concurrently (409), skipping`);
            return;
        }
        throw err;
    }
}

async function getIsmPolicyVersion(client: OpenSearchClient, id: string): Promise<{ seqNo: number; primaryTerm: number } | null> {
    try {
        const res = await client.transport.request({
            method: 'GET',
            path: `/_plugins/_ism/policies/${encodeURIComponent(id)}`
        });
        const body = res.body as { _seq_no: number; _primary_term: number };
        return { seqNo: body['_seq_no'], primaryTerm: body['_primary_term'] };
    } catch (err: unknown) {
        if (err instanceof osErrors.ResponseError && err.statusCode === 404) {
            return null;
        }
        throw err;
    }
}

function buildRetentionIsmPolicy(id: string): { id: string; body: Record<string, unknown> } {
    return {
        id,
        body: {
            policy: {
                policy_id: id,
                description: `Nango logs retention (ISM): delete indices after ${retentionMinAge}`,
                default_state: 'hot',
                states: [
                    {
                        name: 'hot',
                        actions: [],
                        transitions: [
                            {
                                state_name: 'delete',
                                conditions: { min_index_age: retentionMinAge }
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
