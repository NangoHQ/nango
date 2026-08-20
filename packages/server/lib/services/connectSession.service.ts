import db from '@nangohq/database';
import * as keystore from '@nangohq/keystore';
import { defaultOperationExpiration, endUserToMeta, logContextGetter } from '@nangohq/logs';
import { buildTagsFromEndUser, configService, connectionTagsSchema } from '@nangohq/shared';
import { buildConnectUiSessionLink, Err, Ok } from '@nangohq/utils';

import { connectionCreationStartCapCheck } from '../hooks/hooks.js';

import type { Knex } from '@nangohq/database';
import type {
    ConnectSession,
    ConnectSessionIntegrationConfigDefaults,
    ConnectSessionOverrides,
    DBEnvironment,
    DBPlan,
    DBTeam,
    InternalEndUser,
    Tags
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { SetOptional } from 'type-fest';

const CONNECT_SESSIONS_TABLE = 'connect_sessions';
const CONNECT_SESSION_TTL_MS = 30 * 60 * 1000;

export interface DBConnectSession {
    readonly id: number;
    readonly end_user_id: number | null;
    readonly account_id: number;
    readonly environment_id: number;
    readonly connection_id: number | null;
    readonly operation_id: string | null;
    readonly created_at: Date;
    readonly updated_at: Date | null;
    readonly allowed_integrations: string[] | null;
    readonly integrations_config_defaults: Record<string, ConnectSessionIntegrationConfigDefaults> | null;
    readonly overrides: Record<string, ConnectSessionOverrides> | null;
    readonly webhook_url_override: string | null;
    readonly end_user: InternalEndUser | null;
    readonly tags: Tags;
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
            operation_id: session.operationId || null,
            created_at: session.createdAt,
            updated_at: session.updatedAt,
            allowed_integrations: session.allowedIntegrations || null,
            integrations_config_defaults: session.integrationsConfigDefaults || null,
            overrides: session.overrides || null,
            webhook_url_override: session.webhookUrlOverride || null,
            end_user: session.endUser || null,
            tags: session.tags
        };
    },
    from: (dbSession: DBConnectSession): ConnectSession => {
        return {
            id: dbSession.id,
            endUserId: dbSession.end_user_id,
            accountId: dbSession.account_id,
            environmentId: dbSession.environment_id,
            connectionId: dbSession.connection_id,
            operationId: dbSession.operation_id || null,
            createdAt: dbSession.created_at,
            updatedAt: dbSession.updated_at,
            allowedIntegrations: dbSession.allowed_integrations || null,
            integrationsConfigDefaults: dbSession.integrations_config_defaults || null,
            overrides: dbSession.overrides || null,
            webhookUrlOverride: dbSession.webhook_url_override || null,
            endUser: dbSession.end_user || null,
            tags: dbSession.tags
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
}

export async function insertConnectSession(
    db: Knex,
    {
        endUserId,
        accountId,
        environmentId,
        connectionId,
        allowedIntegrations,
        integrationsConfigDefaults,
        operationId,
        overrides,
        webhookUrlOverride,
        endUser,
        tags
    }: SetOptional<
        Pick<
            ConnectSession,
            | 'allowedIntegrations'
            | 'connectionId'
            | 'integrationsConfigDefaults'
            | 'accountId'
            | 'environmentId'
            | 'operationId'
            | 'overrides'
            | 'webhookUrlOverride'
            | 'endUser'
            | 'endUserId'
            | 'tags'
        >,
        'connectionId'
    >
): Promise<Result<ConnectSession, ConnectSessionError>> {
    let normalizedTags: Tags = {};
    const result = connectionTagsSchema.safeParse(tags);
    if (!result.success) {
        return Err(
            new ConnectSessionError({
                code: 'creation_failed',
                message: result.error.issues[0]?.message ?? 'Invalid tags',
                payload: { tags }
            })
        );
    }
    normalizedTags = result.data;

    const dbSession: DbInsertConnectSession = {
        end_user_id: endUserId || null,
        account_id: accountId,
        environment_id: environmentId,
        connection_id: connectionId || null,
        allowed_integrations: allowedIntegrations,
        integrations_config_defaults: integrationsConfigDefaults,
        operation_id: operationId,
        overrides: overrides || null,
        webhook_url_override: webhookUrlOverride || null,
        end_user: endUser,
        tags: normalizedTags
    };

    const [session] = await db.insert<DBConnectSession>(dbSession).into(CONNECT_SESSIONS_TABLE).returning('*');
    if (!session) {
        return Err(
            new ConnectSessionError({
                code: 'creation_failed',
                message: 'Failed to create connect session',
                payload: { allowedIntegrations, integrationsConfigDefaults }
            })
        );
    }
    return Ok(ConnectSessionMapper.from(session));
}

export type CreateConnectSessionErrorCode =
    | 'resource_capped'
    | 'integration_not_found'
    | 'docs_connect_override_forbidden'
    | 'session_creation_failed'
    | 'token_creation_failed';

export type ConnectSessionIntegrationSource = 'allowedIntegrations' | 'integrationsConfigDefaults' | 'overrides';

export interface MissingConnectSessionIntegration {
    integrationId: string;
    source: ConnectSessionIntegrationSource;
    index?: number | undefined;
}

export class CreateConnectSessionError extends Error {
    public readonly code: CreateConnectSessionErrorCode;
    public readonly missingIntegrations?: MissingConnectSessionIntegration[] | undefined;

    constructor({
        code,
        message,
        cause,
        missingIntegrations
    }: {
        code: CreateConnectSessionErrorCode;
        message: string;
        cause?: unknown;
        missingIntegrations?: MissingConnectSessionIntegration[] | undefined;
    }) {
        super(message, { cause });
        this.name = 'CreateConnectSessionError';
        this.code = code;
        this.missingIntegrations = missingIntegrations;
    }
}

export interface CreateConnectSessionParams {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    endUser: InternalEndUser | null;
    tags?: Tags | undefined;
    allowedIntegrations?: string[] | undefined;
    integrationsConfigDefaults?: Record<string, ConnectSessionIntegrationConfigDefaults> | undefined;
    overrides?: Record<string, ConnectSessionOverrides> | undefined;
    webhookUrlOverride?: string | undefined;
}

export interface CreatedConnectSession {
    token: string;
    connectLink: string;
    expiresAt: Date;
}

class ConnectSessionTransactionError extends Error {
    constructor(public readonly serviceError: CreateConnectSessionError) {
        super(serviceError.message, { cause: serviceError });
    }
}

export async function createConnectSession(params: CreateConnectSessionParams): Promise<Result<CreatedConnectSession, CreateConnectSessionError>> {
    try {
        if (params.plan) {
            const cap = await connectionCreationStartCapCheck({ creationType: 'create', team: params.account, plan: params.plan });
            if (cap.capped) {
                return Err(
                    new CreateConnectSessionError({
                        code: 'resource_capped',
                        message: 'Reached maximum number of allowed connections. Upgrade your plan to get rid of connection limits.'
                    })
                );
            }
        }

        // Enforce that integrations in `integrationsConfigDefaults` and `overrides` exist
        const missingIntegrations = await findMissingIntegrations(params);
        if (missingIntegrations.length > 0) {
            return Err(
                new CreateConnectSessionError({
                    code: 'integration_not_found',
                    message: 'One or more integrations do not exist',
                    missingIntegrations
                })
            );
        }

        const isOverridingDocsConnectUrl = Object.values(params.overrides || {}).some((value) => value.docs_connect);
        if (isOverridingDocsConnectUrl && !params.plan?.can_override_docs_connect_url) {
            return Err(
                new CreateConnectSessionError({
                    code: 'docs_connect_override_forbidden',
                    message: 'You are not allowed to override the docs connect url'
                })
            );
        }

        const generatedTags = buildTagsFromInternalEndUser(params.endUser);
        const tags = { ...generatedTags, ...params.tags };
        const logCtx = await logContextGetter.create(
            {
                operation: { type: 'auth', action: 'create_connection' },
                meta: { connectSession: params.endUser ? endUserToMeta(params.endUser) : undefined },
                expiresAt: defaultOperationExpiration.auth()
            },
            { account: params.account, environment: params.environment }
        );

        return await db.knex.transaction(async (trx) => {
            // create connect session
            const session = await insertConnectSession(trx, {
                endUserId: null,
                accountId: params.account.id,
                environmentId: params.environment.id,
                allowedIntegrations: params.allowedIntegrations?.length ? params.allowedIntegrations : null,
                integrationsConfigDefaults: params.integrationsConfigDefaults || null,
                operationId: logCtx.id,
                overrides: params.overrides || null,
                webhookUrlOverride: params.webhookUrlOverride || null,
                endUser: params.endUser,
                tags
            });
            if (session.isErr()) {
                throw new ConnectSessionTransactionError(
                    new CreateConnectSessionError({
                        code: 'session_creation_failed',
                        message: 'Failed to create connect session',
                        cause: session.error
                    })
                );
            }

            // create a private key for the connect session
            const privateKey = await keystore.createPrivateKey(trx, {
                displayName: '',
                accountId: params.account.id,
                environmentId: params.environment.id,
                entityType: 'connect_session',
                entityId: session.value.id,
                ttlInMs: CONNECT_SESSION_TTL_MS
            });
            if (privateKey.isErr()) {
                throw new ConnectSessionTransactionError(
                    new CreateConnectSessionError({
                        code: 'token_creation_failed',
                        message: 'Failed to create session token',
                        cause: privateKey.error
                    })
                );
            }

            const [token, storedPrivateKey] = privateKey.value;
            if (!storedPrivateKey.expiresAt) {
                throw new ConnectSessionTransactionError(
                    new CreateConnectSessionError({ code: 'token_creation_failed', message: 'Failed to create session token' })
                );
            }

            return Ok({ token, connectLink: buildConnectUiSessionLink(token), expiresAt: storedPrivateKey.expiresAt });
        });
    } catch (err) {
        if (err instanceof ConnectSessionTransactionError) {
            return Err(err.serviceError);
        }
        return Err(new CreateConnectSessionError({ code: 'session_creation_failed', message: 'Failed to create connect session', cause: err }));
    }
}

async function findMissingIntegrations(params: CreateConnectSessionParams): Promise<MissingConnectSessionIntegration[]> {
    const references: MissingConnectSessionIntegration[] = [
        ...(params.allowedIntegrations || []).map((integrationId, index) => ({
            integrationId,
            source: 'allowedIntegrations' as const,
            index
        })),
        ...Object.keys(params.integrationsConfigDefaults || {}).map((integrationId) => ({
            integrationId,
            source: 'integrationsConfigDefaults' as const
        })),
        ...Object.keys(params.overrides || {}).map((integrationId) => ({ integrationId, source: 'overrides' as const }))
    ];
    if (references.length === 0) {
        return [];
    }

    const integrations = await configService.listProviderConfigs(db.knex, params.environment.id);
    const integrationIds = new Set(integrations.map((integration) => integration.unique_key));
    return references.filter(({ integrationId }) => !integrationIds.has(integrationId));
}

function buildTagsFromInternalEndUser(endUser: InternalEndUser | null): Tags {
    return buildTagsFromEndUser(
        endUser
            ? {
                  id: endUser.endUserId,
                  email: endUser.email || undefined,
                  display_name: endUser.displayName || undefined,
                  tags: endUser.tags || undefined
              }
            : null,
        endUser?.organization
            ? {
                  id: endUser.organization.organizationId,
                  display_name: endUser.organization.displayName || undefined
              }
            : null
    );
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
        .select<{ connect_session: DBConnectSession }>(db.raw(`row_to_json(${CONNECT_SESSIONS_TABLE}.*) as connect_session`))
        .where({
            id,
            account_id: accountId,
            environment_id: environmentId
        })
        .first();
    if (!session) {
        return Err(new ConnectSessionError({ code: 'not_found', message: `Connect session '${id}' not found`, payload: { id, accountId, environmentId } }));
    }
    return Ok({ connectSession: ConnectSessionMapper.from(session.connect_session) });
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

export async function deleteExpiredConnectSession(db: Knex, { limit, olderThan }: { limit: number; olderThan: number }): Promise<number> {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - olderThan);

    return await db
        .from<DBConnectSession>(CONNECT_SESSIONS_TABLE)
        .whereIn('id', function (sub) {
            sub.select('id').from<DBConnectSession>(CONNECT_SESSIONS_TABLE).where('created_at', '<=', dateThreshold.toISOString()).limit(limit);
        })
        .delete();
}
