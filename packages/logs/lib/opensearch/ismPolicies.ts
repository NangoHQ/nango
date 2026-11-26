import { errors as osErrors } from '@opensearch-project/opensearch';

import { indexMessages, indexOperations, policyMessages, policyOperations, retentionMinAge } from '../es/schema.js';
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
 *
 * ISM only attaches a policy to new indices through the policy's ism_template, the
 * index.plugins.index_state_management.policy_id index setting is ignored. ism_template doesn't apply to
 * indices that already exist, so the policy is also added to them explicitly.
 */
export async function putIsmPolicies(client: OpenSearchClient): Promise<void> {
    const policies = [
        buildRetentionIsmPolicy(policyOperations.name, `${indexOperations.index}.*`),
        buildRetentionIsmPolicy(policyMessages.name, `${indexMessages.index}.*`)
    ];
    for (const { id, indexPattern, body } of policies) {
        await putIsmPolicy(client, id, body);
        await addIsmPolicyToExistingIndices(client, id, indexPattern);
    }
}

async function addIsmPolicyToExistingIndices(client: OpenSearchClient, id: string, indexPattern: string): Promise<void> {
    try {
        // Indices that already have a policy are reported as failed and left untouched
        const res = await client.transport.request({
            method: 'POST',
            path: `/_plugins/_ism/add/${encodeURIComponent(indexPattern)}`,
            body: { policy_id: id }
        });
        const body = res.body as { updated_indices?: number };
        if (body.updated_indices) {
            logger.info(`ISM policy "${id}" added to ${body.updated_indices} existing indices`);
        }
    } catch (err: unknown) {
        if (err instanceof osErrors.ResponseError && err.statusCode === 404) {
            // no index matches the pattern yet
            return;
        }
        // Not fatal: new indices are still picked up by the ism_template,
        // only the existing ones stay unmanaged (e.g. missing ISM managedindex permission)
        logger.warning(`Failed to add ISM policy "${id}" to existing indices "${indexPattern}": ${err instanceof Error ? err.message : String(err)}`);
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

function buildRetentionIsmPolicy(id: string, indexPattern: string): { id: string; indexPattern: string; body: Record<string, unknown> } {
    return {
        id,
        indexPattern,
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
                ],
                ism_template: [{ index_patterns: [indexPattern], priority: 100 }]
            }
        }
    };
}
