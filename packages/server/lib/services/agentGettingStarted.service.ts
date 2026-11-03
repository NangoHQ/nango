import db from '@nangohq/database';
import { report } from '@nangohq/utils';

import { isPlaygroundSession, PLAYGROUND_USER_TAG_KEY } from './agentPlaygroundTags.js';
import { AGENT_SESSION_TAG_KEY } from './agentSessionConnections.service.js';

import type { Knex } from '@nangohq/database';
import type { AgentSession, ApiAgentGettingStarted, DBAccountGettingStarted, Tags } from '@nangohq/types';

const TABLE = 'account_getting_started';

type StampedColumn = 'first_agent_connection_at' | 'first_tool_call_at' | 'dismissed_at';

export async function getProgress(trx: Knex, accountId: number): Promise<ApiAgentGettingStarted> {
    const row = await trx<DBAccountGettingStarted>(TABLE).where({ account_id: accountId }).first();

    return {
        first_agent_connection_at: row?.first_agent_connection_at?.toISOString() ?? null,
        first_tool_call_at: row?.first_tool_call_at?.toISOString() ?? null,
        dismissed_at: row?.dismissed_at?.toISOString() ?? null
    };
}

export async function isDismissed(trx: Knex, accountId: number): Promise<boolean> {
    const row = await trx<DBAccountGettingStarted>(TABLE).select('dismissed_at').where({ account_id: accountId }).first();
    return Boolean(row?.dismissed_at);
}

export async function dismiss(trx: Knex, accountId: number): Promise<void> {
    await stampOnce(trx, accountId, 'dismissed_at');
}

/**
 * Clears the agent's progress for the whole account.
 */
export async function restart(trx: Knex, accountId: number): Promise<void> {
    await trx<DBAccountGettingStarted>(TABLE)
        .where({ account_id: accountId })
        .update({ first_agent_connection_at: null, first_tool_call_at: null, updated_at: new Date() });
}

export async function recordConnectionCreated({ accountId, tags }: { accountId: number; tags: Tags }): Promise<void> {
    if (!tags[AGENT_SESSION_TAG_KEY] || tags[PLAYGROUND_USER_TAG_KEY]) {
        return;
    }

    try {
        await stampOnce(db.knex, accountId, 'first_agent_connection_at');
    } catch (err) {
        report(new Error('getting_started_record_agent_connection_failed', { cause: err }), { accountId });
    }
}

export async function recordToolCall({
    accountId,
    session,
    succeeded
}: {
    accountId: number;
    session: Pick<AgentSession, 'metaTools'>;
    succeeded: boolean;
}): Promise<void> {
    if (!succeeded || isPlaygroundSession(session)) {
        return;
    }

    try {
        await stampOnce(db.knex, accountId, 'first_tool_call_at');
    } catch (err) {
        report(new Error('getting_started_record_agent_tool_call_failed', { cause: err }), { accountId });
    }
}

async function stampOnce(trx: Knex, accountId: number, column: StampedColumn): Promise<void> {
    await trx(TABLE)
        .insert({ account_id: accountId, [column]: trx.fn.now() })
        .onConflict('account_id')
        .merge({ [column]: trx.fn.now(), updated_at: trx.fn.now() })
        .whereNull(`${TABLE}.${column}`);
}
