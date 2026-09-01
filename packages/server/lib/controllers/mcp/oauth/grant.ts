import db from '@nangohq/database';

import { ManagementMcpOAuthAdapter } from './adapter.js';

import type { DBPlan, DBTeam, DBUser } from '@nangohq/types';

const TABLE = '_nango_mcp_oauth_grants';

export interface ManagementMcpOAuthGrant {
    grant_id: string;
    user_id: number;
    account_id: number;
    client_id: string;
    resource: string;
    scopes: string[];
    status: 'pending' | 'active' | 'revoked';
    revoked_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export async function createPendingManagementMcpOAuthGrant(input: {
    grantId: string;
    userId: number;
    accountId: number;
    clientId: string;
    resource: string;
    scopes: string[];
}): Promise<void> {
    await db.knex<ManagementMcpOAuthGrant>(TABLE).insert({
        grant_id: input.grantId,
        user_id: input.userId,
        account_id: input.accountId,
        client_id: input.clientId,
        resource: input.resource,
        scopes: input.scopes,
        status: 'pending',
        revoked_at: null,
        created_at: new Date(),
        updated_at: new Date()
    });
}

export async function activateManagementMcpOAuthGrant(grantId: string): Promise<void> {
    const updated = await db
        .knex<ManagementMcpOAuthGrant>(TABLE)
        .where({ grant_id: grantId, status: 'pending' })
        .update({ status: 'active', updated_at: new Date() });
    if (updated !== 1) {
        throw new Error('Failed to activate management MCP OAuth grant');
    }
}

export async function revokeManagementMcpOAuthGrant(grantId: string): Promise<void> {
    await db.knex<ManagementMcpOAuthGrant>(TABLE).where({ grant_id: grantId }).update({ status: 'revoked', revoked_at: new Date(), updated_at: new Date() });
}

export type ManagementMcpOAuthGrantFilter = { grantId: string } | { userId: number } | { accountId: number } | { clientId: string };

export async function revokeManagementMcpOAuthGrants(filter: ManagementMcpOAuthGrantFilter, storageKey: string): Promise<number> {
    const query = db.knex<ManagementMcpOAuthGrant>(TABLE).select('grant_id').where({ status: 'active' }).whereNull('revoked_at');
    if ('grantId' in filter) {
        query.where({ grant_id: filter.grantId });
    } else if ('userId' in filter) {
        query.where({ user_id: filter.userId });
    } else if ('accountId' in filter) {
        query.where({ account_id: filter.accountId });
    } else {
        query.where({ client_id: filter.clientId });
    }

    const grants = await query;
    for (const { grant_id: grantId } of grants) {
        await Promise.all([
            new ManagementMcpOAuthAdapter('AccessToken', storageKey).revokeByGrantId(grantId),
            new ManagementMcpOAuthAdapter('AuthorizationCode', storageKey).revokeByGrantId(grantId),
            new ManagementMcpOAuthAdapter('RefreshToken', storageKey).revokeByGrantId(grantId)
        ]);
        await new ManagementMcpOAuthAdapter('Grant', storageKey).destroy(grantId);
        await revokeManagementMcpOAuthGrant(grantId);
    }
    return grants.length;
}

export async function deleteManagementMcpOAuthGrant(grantId: string): Promise<void> {
    await db.knex<ManagementMcpOAuthGrant>(TABLE).where({ grant_id: grantId }).delete();
}

export async function getActiveManagementMcpOAuthGrant(grantId: string): Promise<ManagementMcpOAuthGrant | null> {
    return (await db.knex<ManagementMcpOAuthGrant>(TABLE).where({ grant_id: grantId, status: 'active' }).whereNull('revoked_at').first()) ?? null;
}

export async function getManagementMcpOAuthGrantContext(grantId: string): Promise<{
    grant: ManagementMcpOAuthGrant;
    user: DBUser;
    account: DBTeam;
    plan: DBPlan | null;
} | null> {
    const row = await db.knex
        .select({
            grant: db.knex.raw('row_to_json(g.*)'),
            user: db.knex.raw('row_to_json(u.*)'),
            account: db.knex.raw('row_to_json(a.*)'),
            plan: db.knex.raw('row_to_json(p.*)')
        })
        .from({ g: TABLE })
        .join({ u: '_nango_users' }, 'u.id', 'g.user_id')
        .join({ a: '_nango_accounts' }, 'a.id', 'g.account_id')
        .leftJoin({ p: 'plans' }, 'p.account_id', 'g.account_id')
        .where({ 'g.grant_id': grantId, 'g.status': 'active', 'u.suspended': false })
        .whereNull('g.revoked_at')
        .whereRaw('u.account_id = g.account_id')
        .first<{
            grant: ManagementMcpOAuthGrant;
            user: DBUser;
            account: DBTeam;
            plan: DBPlan | null;
        }>();

    return row ?? null;
}

export async function deleteStalePendingManagementMcpOAuthGrants(): Promise<number> {
    return await db
        .knex<ManagementMcpOAuthGrant>(TABLE)
        .where({ status: 'pending' })
        .where('created_at', '<', new Date(Date.now() - 10 * 60 * 1000))
        .delete();
}
