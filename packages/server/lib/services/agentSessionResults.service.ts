import { randomUUID } from 'node:crypto';

import { records, format as recordsFormatter } from '@nangohq/records';
import { agentSessionResultModel } from '@nangohq/shared';
import { Err, Ok, report } from '@nangohq/utils';

import { envs } from '../env.js';
import { describeResult } from './agentSessionResultShape.js';

import type { AgentSession, AgentSessionResolvedConnection, DBPlan } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const STORED_RESULT_HINT =
    'The result is too large to return in full. `shape` outlines its structure as TypeScript and `sample` shows the first items with long strings clipped. Call nango_run_code with this result_id and JavaScript that reads `data` and returns only what you need.';

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
    if (!session.metaTools.nangoRunCode || bytes <= envs.AGENT_SESSION_RESULT_INLINE_MAX_BYTES) {
        return data;
    }

    if (bytes > envs.AGENT_SESSION_RESULT_STORED_MAX_BYTES) {
        return {
            data,
            notice: `This result is over the ${formatMegabytes(envs.AGENT_SESSION_RESULT_STORED_MAX_BYTES)} that can be stored, so it is returned in full.`
        } satisfies UnstoredToolResult;
    }

    const stored = await storeToolResult({ sessionId: session.id, environmentId, plan, connection, toolName, data });
    if (stored.isErr()) {
        report(stored.error);
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
        if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === 'string' && typeof parsed[1] === 'string') {
            return { integrationId: parsed[0], recordId: parsed[1] };
        }
    } catch {
        // not an id we issued
    }
    return null;
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

function formatMegabytes(bytes: number): string {
    return `${Math.round(bytes / (1024 * 1024))} MB`;
}
