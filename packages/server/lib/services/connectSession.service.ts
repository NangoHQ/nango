import type { Knex } from '@nangohq/database';
import * as keystore from '@nangohq/keystore';
import type { ConnectSession, DBEndUser, EndUser } from '@nangohq/types';
import { Err, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import { EndUserMapper } from '@nangohq/shared';
import type { SetOptional } from 'type-fest';

const CONNECT_SESSIONS_TABLE = 'connect_sessions';

interface DBConnectSession {
    readonly id: number;
    readonly end_user_id: number;
    readonly account_id: number;
    readonly environment_id: number;
    readonly connection_id: number | null;
    readonly created_at: Date;
    readonly updated_at: Date | null;
    readonly allowed_integrations: string[] | null;
    readonly integrations_config_defaults: Record<string, { connectionConfig: Record<string, unknown> }> | null;
}
type DbInsertConnectSession = Omit<DBConnectSession, 'id' | 'created_at' | 'updated_at'>;

const ConnectSessionMapper = {
    to: (session: ConnectSession): DBConnectSession => {
        return {
            id: session.id,
            end_user_id: session.endUserId,
            account_id: session.accountId,
            environment_id: session.environmentId,
            connection_id: session.connectionId,
            created_at: session.createdAt,
            updated_at: session.updatedAt,
            allowed_integrations: session.allowedIntegrations || null,
            integrations_config_defaults: session.integrationsConfigDefaults || null
        };
    },
    from: (dbSession: DBConnectSession): ConnectSession => {
        return {
            id: dbSession.id,
            endUserId: dbSession.end_user_id,
            accountId: dbSession.account_id,
            environmentId: dbSession.environment_id,
            connectionId: dbSession.connection_id,
            createdAt: dbSession.created_at,
            updatedAt: dbSession.updated_at,
            allowedIntegrations: dbSession.allowed_integrations || null,
            integrationsConfigDefaults: dbSession.integrations_config_defaults || null
        };
    }
};

type ConnectSessionErrorCode = 'not_found' | 'creation_failed';
export class ConnectSessionError extends Error {
    public code: ConnectSessionErrorCode;
    public payload?: Record<string, unknown>;
    constructor({ code, message, payload }: { code: ConnectSessionErrorCode; message: string; payload?: Record<string, unknown> }) {
        super(message);
        this.code = code;
        this.payload = payload || {};
    }
}

export interface ConnectSessionAndEndUser {
    connectSession: ConnectSession;
    endUser: EndUser;
}

export async function createConnectSession(
    db: Knex,
    {
        endUserId,
        accountId,
        environmentId,
        connectionId,
        allowedIntegrations,
        integrationsConfigDefaults
    }: SetOptional<
        Pick<ConnectSession, 'endUserId' | 'allowedIntegrations' | 'connectionId' | 'integrationsConfigDefaults' | 'accountId' | 'environmentId'>,
        'connectionId'
    >
): Promise<Result<ConnectSession, ConnectSessionError>> {
    const dbSession: DbInsertConnectSession = {
        end_user_id: endUserId,
        account_id: accountId,
        environment_id: environmentId,
        connection_id: connectionId || null,
        allowed_integrations: allowedIntegrations,
        integrations_config_defaults: integrationsConfigDefaults
    };
    const [session] = await db.insert<DBConnectSession>(dbSession).into(CONNECT_SESSIONS_TABLE).returning('*');
    if (!session) {
        return Err(
            new ConnectSessionError({
                code: 'creation_failed',
                message: 'Failed to create connect session',
                payload: { endUserId, allowedIntegrations, integrationsConfigDefaults }
            })
        );
    }
    return Ok(ConnectSessionMapper.from(session));
}

export async function getConnectSession(
    db: Knex,
    {
        id,
        accountId,
        environmentId
    }: {
        id: number;
        accountId: number;
        environmentId: number;
    }
): Promise<Result<ConnectSessionAndEndUser, ConnectSessionError>> {
    const session = await db
        .from<DBConnectSession>(CONNECT_SESSIONS_TABLE)
        .select<{ connect_session: DBConnectSession; end_user: DBEndUser }>(
            db.raw(`row_to_json(${CONNECT_SESSIONS_TABLE}.*) as connect_session`),
            db.raw('row_to_json(end_users.*) as end_user')
        )
        .join('end_users', 'end_users.id', `${CONNECT_SESSIONS_TABLE}.end_user_id`)
        .where({
            [`${CONNECT_SESSIONS_TABLE}.id`]: id,
            [`${CONNECT_SESSIONS_TABLE}.account_id`]: accountId,
            [`${CONNECT_SESSIONS_TABLE}.environment_id`]: environmentId
        })
        .first();
    if (!session) {
        return Err(new ConnectSessionError({ code: 'not_found', message: `Connect session '${id}' not found`, payload: { id, accountId, environmentId } }));
    }
    return Ok({ connectSession: ConnectSessionMapper.from(session.connect_session), endUser: EndUserMapper.from(session.end_user) });
}

export async function getConnectSessionByToken(db: Knex, token: string): Promise<Result<ConnectSessionAndEndUser, ConnectSessionError>> {
    const getSession = await keystore.getPrivateKey(db, token);
    if (getSession.isErr()) {
        return Err(new ConnectSessionError({ code: 'not_found', message: `Token not found`, payload: { token: `${token.substring(0, 32)}...` } }));
    }

    const privateKey = getSession.value;
    const session = await getConnectSession(db, { id: privateKey.entityId, accountId: privateKey.accountId, environmentId: privateKey.environmentId });
    if (session.isErr()) {
        return Err(session.error);
    }
    return Ok(session.value);
}

export async function deleteConnectSession(
    db: Knex,
    {
        id,
        accountId,
        environmentId
    }: {
        id: number;
        accountId: number;
        environmentId: number;
    }
): Promise<Result<void, ConnectSessionError>> {
    const deleted = await db<DBConnectSession>(CONNECT_SESSIONS_TABLE).where({ id, account_id: accountId, environment_id: environmentId }).delete();
    if (!deleted) {
        return Err(new ConnectSessionError({ code: 'not_found', message: `Connect session '${id}' not found`, payload: { id, accountId, environmentId } }));
    }
    return Ok(undefined);
}
