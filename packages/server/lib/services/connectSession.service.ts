import type knex from 'knex';
import * as keystore from '@nangohq/keystore';
import type { ConnectSession } from '@nangohq/types';
import { Err, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';

const CONNECT_SESSIONS_TABLE = 'connect_sessions';

interface DBConnectSession {
    readonly id: number;
    readonly end_user_id: number;
    readonly account_id: number;
    readonly environment_id: number;
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

export async function createConnectSession(
    db: knex.Knex,
    {
        endUserId,
        accountId,
        environmentId,
        allowedIntegrations,
        integrationsConfigDefaults
    }: Pick<ConnectSession, 'endUserId' | 'allowedIntegrations' | 'integrationsConfigDefaults' | 'accountId' | 'environmentId'>
): Promise<Result<ConnectSession, ConnectSessionError>> {
    const dbSession: DbInsertConnectSession = {
        end_user_id: endUserId,
        account_id: accountId,
        environment_id: environmentId,
        allowed_integrations: allowedIntegrations || null,
        integrations_config_defaults: integrationsConfigDefaults || null
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
    db: knex.Knex,
    {
        id,
        accountId,
        environmentId
    }: {
        id: number;
        accountId: number;
        environmentId: number;
    }
): Promise<Result<ConnectSession, ConnectSessionError>> {
    const session = await db<DBConnectSession>(CONNECT_SESSIONS_TABLE).where({ id, account_id: accountId, environment_id: environmentId }).first();
    if (!session) {
        return Err(new ConnectSessionError({ code: 'not_found', message: `Connect session '${id}' not found`, payload: { id, accountId, environmentId } }));
    }
    return Ok(ConnectSessionMapper.from(session));
}

export async function getConnectSessionByToken(db: knex.Knex, token: string): Promise<Result<ConnectSession, ConnectSessionError>> {
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
    db: knex.Knex,
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
