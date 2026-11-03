import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { dismiss, getProgress, isDismissed, recordConnectionCreated, recordToolCall, restart } from './agentGettingStarted.service.js';
import { PLAYGROUND_USER_TAG_KEY } from './agentPlaygroundTags.js';
import { AGENT_SESSION_TAG_KEY } from './agentSessionConnections.service.js';

import type { AgentSession, DBTeam } from '@nangohq/types';

const agentSession = { metaTools: { nangoCreateConnection: { enabled: true, tags: { end_user_id: 'user-1' } } } } as unknown as AgentSession;
const playgroundSession = {
    metaTools: { nangoCreateConnection: { enabled: true, tags: { [PLAYGROUND_USER_TAG_KEY]: 'user-uuid' } } }
} as unknown as AgentSession;

describe('agentGettingStarted service', () => {
    let account: DBTeam;

    beforeAll(async () => {
        await multipleMigrations();
    });

    beforeEach(async () => {
        const seed = await seeders.seedAccountEnvAndUser();
        account = seed.account;
    });

    it('starts empty for a new account', async () => {
        expect(await getProgress(db.knex, account.id)).toStrictEqual({
            first_agent_connection_at: null,
            first_tool_call_at: null,
            dismissed_at: null
        });
        expect(await isDismissed(db.knex, account.id)).toBe(false);
    });

    describe('recordConnectionCreated', () => {
        it('stamps a connection created by an agent session', async () => {
            await recordConnectionCreated({ accountId: account.id, tags: { [AGENT_SESSION_TAG_KEY]: 'session-id' } });

            const state = await getProgress(db.knex, account.id);
            expect(state.first_agent_connection_at).not.toBeNull();
        });

        it('ignores connections not created by an agent session', async () => {
            await recordConnectionCreated({ accountId: account.id, tags: { end_user_id: 'user-1' } });

            expect((await getProgress(db.knex, account.id)).first_agent_connection_at).toBeNull();
        });

        it('ignores connections created from the Playground', async () => {
            await recordConnectionCreated({
                accountId: account.id,
                tags: { [AGENT_SESSION_TAG_KEY]: 'session-id', [PLAYGROUND_USER_TAG_KEY]: 'user-uuid' }
            });

            expect((await getProgress(db.knex, account.id)).first_agent_connection_at).toBeNull();
        });

        it('keeps the first timestamp', async () => {
            await recordConnectionCreated({ accountId: account.id, tags: { [AGENT_SESSION_TAG_KEY]: 'session-id' } });
            const first = (await getProgress(db.knex, account.id)).first_agent_connection_at;

            await recordConnectionCreated({ accountId: account.id, tags: { [AGENT_SESSION_TAG_KEY]: 'other-session-id' } });

            expect((await getProgress(db.knex, account.id)).first_agent_connection_at).toBe(first);
        });
    });

    describe('recordToolCall', () => {
        it('stamps a successful tool call', async () => {
            await recordToolCall({ accountId: account.id, session: agentSession, succeeded: true });

            expect((await getProgress(db.knex, account.id)).first_tool_call_at).not.toBeNull();
        });

        it('ignores failed tool calls', async () => {
            await recordToolCall({ accountId: account.id, session: agentSession, succeeded: false });

            expect((await getProgress(db.knex, account.id)).first_tool_call_at).toBeNull();
        });

        it('ignores Playground tool calls', async () => {
            await recordToolCall({ accountId: account.id, session: playgroundSession, succeeded: true });

            expect((await getProgress(db.knex, account.id)).first_tool_call_at).toBeNull();
        });
    });

    it('restart clears the progress but keeps the dismissal', async () => {
        await recordConnectionCreated({ accountId: account.id, tags: { [AGENT_SESSION_TAG_KEY]: 'session-id' } });
        await recordToolCall({ accountId: account.id, session: agentSession, succeeded: true });
        await dismiss(db.knex, account.id);

        await restart(db.knex, account.id);

        const state = await getProgress(db.knex, account.id);
        expect(state.first_agent_connection_at).toBeNull();
        expect(state.first_tool_call_at).toBeNull();
        expect(state.dismissed_at).not.toBeNull();
        expect(await isDismissed(db.knex, account.id)).toBe(true);
    });

    it('stamps again after a restart', async () => {
        await recordToolCall({ accountId: account.id, session: agentSession, succeeded: true });
        await restart(db.knex, account.id);

        await recordToolCall({ accountId: account.id, session: agentSession, succeeded: true });

        expect((await getProgress(db.knex, account.id)).first_tool_call_at).not.toBeNull();
    });
});
