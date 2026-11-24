import { beforeAll, describe, expect, it } from 'vitest';

import db, { multipleMigrations } from '@nangohq/database';

import { seedAccountEnvAndUser } from '../../../seeders/global.seeder.js';
import { resolveFunctionByUuid } from '../lookup/service.js';
import { create, get, INLINE_FUNCTIONS_TABLE, maxInlineFunctionCodeLength } from './service.js';
import { isInlineFunctionUuid } from './uuid.js';

beforeAll(async () => {
    await multipleMigrations();
});

async function seedSession() {
    const { account, env } = await seedAccountEnvAndUser();
    const [session] = await db
        .knex('agent_sessions')
        .insert({
            account_id: account.id,
            environment_id: env.id,
            resolved_connections: {},
            compiled_toolset: {},
            meta_tools: {},
            expires_at: new Date(Date.now() + 60_000)
        })
        .returning<{ id: string }[]>('id');
    if (!session) {
        throw new Error('Failed to seed the agent session');
    }
    return { env, agentSessionId: session.id };
}

describe('inline functions', () => {
    it('stores the code of a session under a new inline uuid and reads it back', async () => {
        const { env, agentSessionId } = await seedSession();

        const created = (
            await create(db.knex, { environmentId: env.id, agentSessionId, code: 'return result.value;', description: 'Read the value' })
        ).unwrap();

        expect(isInlineFunctionUuid(created.uuid)).toBe(true);
        expect((await get(db.knex, { environmentId: env.id, uuid: created.uuid })).unwrap()).toStrictEqual(created);
    });

    it('resolves an inline uuid as a function only for callers that ask for inline functions', async () => {
        const { env, agentSessionId } = await seedSession();
        const created = (await create(db.knex, { environmentId: env.id, agentSessionId, code: 'return 1;', description: 'One' })).unwrap();

        expect((await resolveFunctionByUuid({ environmentId: env.id, functionUuid: created.uuid, includeInline: true })).unwrap()).toStrictEqual({
            kind: 'inline',
            uuid: created.uuid,
            name: 'inline',
            enabled: true,
            code: 'return 1;',
            description: 'One'
        });
        expect((await resolveFunctionByUuid({ environmentId: env.id, functionUuid: created.uuid })).unwrap()).toBeUndefined();
    });

    it('only reads the code from the environment that stored it', async () => {
        const { env, agentSessionId } = await seedSession();
        const { env: otherEnv } = await seedSession();
        const created = (await create(db.knex, { environmentId: env.id, agentSessionId, code: 'return 1;' })).unwrap();

        expect((await get(db.knex, { environmentId: otherEnv.id, uuid: created.uuid })).unwrap()).toBeUndefined();
    });

    it('does not read a uuid that is not inline', async () => {
        const { env } = await seedSession();

        expect((await get(db.knex, { environmentId: env.id, uuid: '11111111-1111-4111-8111-111111111111' })).unwrap()).toBeUndefined();
    });

    it.each([
        ['empty code', { code: '' }],
        ['code over the limit', { code: ' '.repeat(maxInlineFunctionCodeLength + 1) }],
        ['an empty description', { code: 'return 1;', description: '' }]
    ])('rejects %s', async (_name, input) => {
        const { env, agentSessionId } = await seedSession();

        const res = await create(db.knex, { environmentId: env.id, agentSessionId, ...input });

        expect(res.isErr()).toBe(true);
        expect(await db.knex(INLINE_FUNCTIONS_TABLE).where({ agent_session_id: agentSessionId })).toHaveLength(0);
    });

    it('deletes the code with its session', async () => {
        const { env, agentSessionId } = await seedSession();
        const created = (await create(db.knex, { environmentId: env.id, agentSessionId, code: 'return 1;' })).unwrap();

        await db.knex('agent_sessions').where({ id: agentSessionId }).delete();

        expect((await get(db.knex, { environmentId: env.id, uuid: created.uuid })).unwrap()).toBeUndefined();
    });
});
