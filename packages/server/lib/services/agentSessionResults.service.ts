import { randomUUID } from 'node:crypto';

import tracer from 'dd-trace';
import * as z from 'zod/v4';

import { records, format as recordsFormatter } from '@nangohq/records';
import { agentSessionResultModel } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { envs } from '../env.js';
import { describeResult } from './agentSessionResultShape.js';

import type { AgentSession, AgentSessionResolvedConnection, DBPlan } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Span } from 'dd-trace';

// Stored results can each be megabytes, so batches stay small to keep every delete transaction short.
const DELETE_BATCH_SIZE = 100;

const STORED_RESULT_HINT =
    'The result is too large to return in full. `shape` outlines its structure as TypeScript and `sample` shows the first items with long strings clipped. Call nango_query_result with this result_id and JavaScript that reads `result` and returns only what you need.';

export interface StoredResultRef {
    integrationId: string;
    recordId: string;
}

export interface StoredToolResult {
    result_id: string;
    truncated: true;
    bytes: number;
    shape: string;
    sample: unknown;
    hint: string;
}

export interface UnstoredToolResult {
    data: unknown;
    notice: string;
}

/**
 * What the agent gets back for a tool result. Small results are returned unchanged. A large one is
 * stored under the session's model and replaced with a reference the agent can run code over. The
 * tool already ran, so a result that cannot be stored is still returned in full rather than as an
 * error the agent would read as "retry the tool".
 */
export async function toolResultForAgent({
    environmentId,
    plan,
    session,
    connection,
    toolName,
    data
}: {
    environmentId: number;
    plan: DBPlan | null;
    session: AgentSession;
    connection: AgentSessionResolvedConnection;
    toolName: string;
    data: unknown;
}): Promise<unknown> {
    const bytes = Buffer.byteLength(JSON.stringify(data ?? null), 'utf8');
    if (!session.metaTools.nangoQueryResult || bytes <= envs.AGENT_SESSION_RESULT_INLINE_MAX_BYTES) {
        return data;
    }

    if (bytes > envs.AGENT_SESSION_RESULT_STORED_MAX_BYTES) {
        return {
            data,
            notice: `This result is over the ${formatMegabytes(envs.AGENT_SESSION_RESULT_STORED_MAX_BYTES)} that can be stored, so it is returned in full.`
        } satisfies UnstoredToolResult;
    }

    const stored = await tracer.trace<Promise<Result<string>>>('server.agentSession.storeResult', async (span: Span) => {
        span.setTag('nango.agentSessionId', session.id).setTag('nango.actionName', toolName).setTag('nango.resultBytes', bytes);
        const result = await storeToolResult({ sessionId: session.id, environmentId, plan, connection, toolName, data });
        if (result.isErr()) {
            span.setTag('error', result.error);
        }
        return result;
    });
    if (stored.isErr()) {
        return data;
    }

    const { shape, sample } = describeResult(data);
    return { result_id: stored.value, truncated: true, bytes, shape, sample, hint: STORED_RESULT_HINT } satisfies StoredToolResult;
}

/** Opaque to the agent. The connection is resolved through the calling session, so an id from another session finds nothing. */
export function encodeResultId(ref: StoredResultRef): string {
    return Buffer.from(JSON.stringify([ref.integrationId, ref.recordId]), 'utf8').toString('base64url');
}

export function decodeResultId(resultId: string): StoredResultRef | null {
    try {
        const parsed = JSON.parse(Buffer.from(resultId, 'base64url').toString('utf8')) as unknown;
        const ref = z.tuple([z.string(), z.uuid()]).safeParse(parsed);
        if (ref.success) {
            return { integrationId: ref.data[0], recordId: ref.data[1] };
        }
    } catch {
        // not an id we issued
    }
    return null;
}

/**
 * Sessions have no cap on what they store, so results are deleted in batches that each commit on their own.
 * Returns `done: false` when the deadline stops it before everything is gone.
 */
export async function deleteSessionResults(
    session: Pick<AgentSession, 'id' | 'environmentId' | 'resolvedConnections'>,
    { deadline }: { deadline: Date }
): Promise<Result<{ done: boolean }>> {
    const model = agentSessionResultModel(session.id);

    for (const connection of Object.values(session.resolvedConnections)) {
        // Checked first because deleting routes the model, and routing records a store for every dataset it sees.
        const counts = await records.getCountsByModel({ connectionId: connection.internalConnectionId, environmentId: session.environmentId, models: [model] });
        if (counts.isErr()) {
            return Err(counts.error);
        }
        if (!counts.value[model]) {
            continue;
        }

        while (true) {
            if (Date.now() >= deadline.getTime()) {
                return Ok({ done: false });
            }

            const deleted = await records.deleteRecords({
                connectionId: connection.internalConnectionId,
                environmentId: session.environmentId,
                model,
                mode: 'hard',
                limit: DELETE_BATCH_SIZE,
                batchSize: DELETE_BATCH_SIZE,
                plan: null
            });
            if (deleted.isErr()) {
                return Err(deleted.error);
            }
            if (deleted.value.count < DELETE_BATCH_SIZE) {
                break;
            }
        }
    }

    return Ok({ done: true });
}

async function storeToolResult({
    sessionId,
    environmentId,
    plan,
    connection,
    toolName,
    data
}: {
    sessionId: string;
    environmentId: number;
    plan: DBPlan | null;
    connection: AgentSessionResolvedConnection;
    toolName: string;
    data: unknown;
}): Promise<Result<string>> {
    const recordId = randomUUID();
    const model = agentSessionResultModel(sessionId);

    const formatted = recordsFormatter.formatRecords({
        data: [{ id: recordId, tool: toolName, storedAt: new Date().toISOString(), data: (data ?? null) as never }],
        connectionId: connection.internalConnectionId,
        model,
        syncJobId: 0
    });
    if (formatted.isErr()) {
        return Err(formatted.error);
    }

    const upserted = await records.upsert({ records: formatted.value, connectionId: connection.internalConnectionId, environmentId, model, plan });
    if (upserted.isErr()) {
        return Err(upserted.error);
    }

    return Ok(encodeResultId({ integrationId: connection.integrationId, recordId }));
}

export function formatMegabytes(bytes: number): string {
    return `${Number((bytes / (1024 * 1024)).toFixed(2))} MB`;
}
