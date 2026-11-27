import { randomUUID } from 'node:crypto';

import tracer from 'dd-trace';
import * as z from 'zod/v4';

import { logContextGetter } from '@nangohq/logs';
import { records, format as recordsFormatter } from '@nangohq/records';
import { agentSessionResultModel } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { envs } from '../env.js';
import { describeResult } from './agentSessionResultShape.js';

import type { AgentSession, AgentSessionResolvedConnection, DBPlan, MessageMeta } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Span } from 'dd-trace';

const STORED_RESULT_HINT =
    'The result is too large to return in full. `shape` outlines its structure as TypeScript and `sample` shows the first items with long strings clipped. Call nango_query_result with this result_id and JavaScript that reads `result` and returns only what you need.';

export interface StoredResultRef {
    integrationId: string;
    recordId: string;
}

export interface FullToolResult {
    /** Absent when the result is not stored. */
    result_id?: string;
    truncated: false;
    data: unknown;
    notice?: string;
}

export interface TruncatedToolResult {
    result_id: string;
    truncated: true;
    bytes: number;
    shape: string;
    sample: unknown;
    hint: string;
}

export type ToolResultForAgent = FullToolResult | TruncatedToolResult;

export type StoredResult = { kind: 'stored'; result: ToolResultForAgent } | { kind: 'over_stored_limit' };

export interface ResultToStore {
    environmentId: number;
    plan: DBPlan | null;
    session: AgentSession;
    connection: AgentSessionResolvedConnection;
    toolName: string;
    data: unknown;
    /** The tool run's log operation, where a result that cannot be stored is reported. */
    logOperationId: string | undefined;
}

/**
 * What the agent gets back for a tool result, or null when the session has no nango_query_result
 * and the caller returns the result unchanged. A result over what can be stored is returned in full
 * with a notice.
 */
export async function toolResultForAgent(params: ResultToStore): Promise<ToolResultForAgent | null> {
    if (!params.session.metaTools.nangoQueryResult) {
        return null;
    }

    const stored = await storeResult(params);
    if (stored.kind === 'stored') {
        return stored.result;
    }

    const limit = formatMegabytes(envs.AGENT_SESSION_RESULT_STORED_MAX_BYTES);
    warnOnToolRun(params, `The result is over the ${limit} that can be stored, so nango_query_result cannot read it`, {
        bytes: Buffer.byteLength(JSON.stringify(params.data ?? null), 'utf8')
    });
    return { truncated: false, data: params.data, notice: `This result is over the ${limit} that can be stored, so it is returned in full.` };
}

/**
 * Stores a tool result under the session's model and returns its envelope. A result that fits inline
 * is returned with its id right away and stored in the background, since the agent already has it in
 * full. A larger one is replaced by its shape and a sample, so it is stored first. The tool already
 * ran, so a result that fails to store is still returned in full rather than as an error the agent
 * would read as "retry the tool". Each caller decides what to return for one over the stored limit.
 */
export async function storeResult(params: ResultToStore): Promise<StoredResult> {
    const { data } = params;
    const bytes = Buffer.byteLength(JSON.stringify(data ?? null), 'utf8');
    if (bytes > envs.AGENT_SESSION_RESULT_STORED_MAX_BYTES) {
        return { kind: 'over_stored_limit' };
    }

    const recordId = randomUUID();
    const resultId = encodeResultId({ integrationId: params.connection.integrationId, recordId });

    if (bytes <= envs.AGENT_SESSION_RESULT_INLINE_MAX_BYTES) {
        void tracedStore({ ...params, recordId, bytes });
        return { kind: 'stored', result: { result_id: resultId, truncated: false, data } };
    }

    const stored = await tracedStore({ ...params, recordId, bytes });
    if (stored.isErr()) {
        return { kind: 'stored', result: { truncated: false, data } };
    }

    const { shape, sample } = describeResult(data);
    return { kind: 'stored', result: { result_id: resultId, truncated: true, bytes, shape, sample, hint: STORED_RESULT_HINT } };
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

/** Never rejects: a failure is tagged on the span and reported on the tool run's log operation. */
async function tracedStore(params: ResultToStore & { recordId: string; bytes: number }): Promise<Result<void>> {
    const { session, toolName, bytes } = params;
    return await tracer.trace<Promise<Result<void>>>('server.agentSession.storeResult', async (span: Span) => {
        span.setTag('nango.agentSessionId', session.id).setTag('nango.actionName', toolName).setTag('nango.resultBytes', bytes);
        const result = await insertResult(params).catch((err: unknown): Result<void> => Err(err instanceof Error ? err : new Error(String(err))));
        if (result.isErr()) {
            span.setTag('error', result.error);
            warnOnToolRun(params, 'Could not store the result, so nango_query_result cannot read it', { error: result.error });
        }
        return result;
    });
}

async function insertResult({
    environmentId,
    plan,
    session,
    connection,
    toolName,
    data,
    recordId
}: ResultToStore & { recordId: string }): Promise<Result<void>> {
    const model = agentSessionResultModel(session.id);

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

    return Ok(undefined);
}

/** Best effort, and never throws: a result can be stored in the background, where nothing awaits it. */
function warnOnToolRun({ logOperationId, session }: ResultToStore, message: string, meta: MessageMeta): void {
    if (!logOperationId) {
        return;
    }
    try {
        logContextGetter
            .get({ id: logOperationId, accountId: session.accountId })
            .warn(message, meta)
            .catch(() => undefined);
    } catch {
        // the tool run already returned its result
    }
}

export function formatMegabytes(bytes: number): string {
    return `${Number((bytes / (1024 * 1024)).toFixed(2))} MB`;
}
