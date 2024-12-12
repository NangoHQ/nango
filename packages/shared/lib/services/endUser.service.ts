import type { Knex } from '@nangohq/database';
import type { ConnectSessionInput, DBEndUser, DBEnvironment, DBInsertEndUser, DBTeam, EndUser, StoredConnection } from '@nangohq/types';
import { Err, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';

const END_USERS_TABLE = 'end_users';

export const EndUserMapper = {
    to: (endUser: EndUser): DBEndUser => {
        return {
            id: endUser.id,
            end_user_id: endUser.endUserId,
            account_id: endUser.accountId,
            environment_id: endUser.environmentId,
            email: endUser.email,
            display_name: endUser.displayName || null,
            organization_id: endUser.organization?.organizationId || null,
            organization_display_name: endUser.organization?.displayName || null,
            created_at: endUser.createdAt,
            updated_at: endUser.updatedAt
        };
    },
    from: (dbEndUser: DBEndUser): EndUser => {
        return {
            id: dbEndUser.id,
            endUserId: dbEndUser.end_user_id,
            accountId: dbEndUser.account_id,
            environmentId: dbEndUser.environment_id,
            email: dbEndUser.email,
            displayName: dbEndUser.display_name || null,
            organization: dbEndUser.organization_id
                ? {
                      organizationId: dbEndUser.organization_id,
                      displayName: dbEndUser.organization_display_name || null
                  }
                : null,
            createdAt: dbEndUser.created_at,
            updatedAt: dbEndUser.updated_at
        };
    }
};

type EndUserErrorCode = 'not_found' | 'creation_failed' | 'update_failed';
export class EndUserError extends Error {
    public code: EndUserErrorCode;
    public payload?: Record<string, unknown>;
    constructor({ code, message, payload }: { code: EndUserErrorCode; message: string; payload?: Record<string, unknown> }) {
        super(message);
        this.code = code;
        this.payload = payload || {};
    }
}

export async function createEndUser(
    db: Knex,
    {
        endUserId,
        email,
        displayName,
        organization,
        accountId,
        environmentId
    }: Pick<EndUser, 'endUserId' | 'email' | 'displayName' | 'organization' | 'accountId' | 'environmentId'>
): Promise<Result<EndUser, EndUserError>> {
    const dbEndUser: DBInsertEndUser = {
        end_user_id: endUserId,
        account_id: accountId,
        environment_id: environmentId,
        email,
        display_name: displayName || null,
        organization_id: organization?.organizationId || null,
        organization_display_name: organization?.displayName || null
    };
    const [endUser] = await db.insert<DBEndUser>(dbEndUser).into(END_USERS_TABLE).returning('*');
    if (!endUser) {
        return Err(
            new EndUserError({
                code: 'creation_failed',
                message: 'Failed to create end user',
                payload: { endUserId }
            })
        );
    }
    return Ok(EndUserMapper.from(endUser));
}

export async function getEndUser(
    db: Knex,
    props: { endUserId: string; accountId: number; environmentId: number } | { id: number; accountId: number; environmentId: number }
): Promise<Result<EndUser, EndUserError>> {
    const endUser = await db<DBEndUser>(END_USERS_TABLE)
        .where(
            'endUserId' in props
                ? { end_user_id: props.endUserId, environment_id: props.environmentId, account_id: props.accountId }
                : { id: props.id, environment_id: props.environmentId, account_id: props.accountId }
        )
        .first();
    if (!endUser) {
        return Err(
            new EndUserError({
                code: 'not_found',
                message: `End user not found`,
                payload: props
            })
        );
    }
    return Ok(EndUserMapper.from(endUser));
}

export async function updateEndUser(
    db: Knex,
    {
        endUserId,
        accountId,
        environmentId,
        email,
        displayName,
        organization
    }: Pick<EndUser, 'endUserId' | 'email' | 'displayName' | 'organization' | 'accountId' | 'environmentId'>
): Promise<Result<EndUser, EndUserError>> {
    const [updated] = await db<DBEndUser>(END_USERS_TABLE)
        .where({ end_user_id: endUserId, account_id: accountId, environment_id: environmentId })
        .update({
            email,
            display_name: displayName || null,
            organization_id: organization?.organizationId || null,
            organization_display_name: organization?.displayName || null,
            updated_at: new Date()
        })
        .returning('*');
    if (!updated) {
        return Err(
            new EndUserError({
                code: 'update_failed',
                message: `Failed update of end user '${endUserId}'`,
                payload: { endUserId, accountId, environmentId }
            })
        );
    }
    return Ok(EndUserMapper.from(updated));
}

export async function deleteEndUser(
    db: Knex,
    { endUserId, accountId, environmentId }: { endUserId: string; accountId: number; environmentId: number }
): Promise<Result<void, EndUserError>> {
    const deleted = await db<DBEndUser>(END_USERS_TABLE).where({ end_user_id: endUserId, account_id: accountId, environment_id: environmentId }).delete();
    if (!deleted) {
        return Err(new EndUserError({ code: 'not_found', message: `End user '${endUserId}' not found`, payload: { endUserId, accountId, environmentId } }));
    }
    return Ok(undefined);
}

export async function linkConnection(db: Knex, { endUserId, connection }: { endUserId: number; connection: Pick<StoredConnection, 'id'> }) {
    await db<StoredConnection>('_nango_connections').where({ id: connection.id! }).update({ end_user_id: endUserId });
}

export async function unlinkConnection(db: Knex, { connection }: { connection: Pick<StoredConnection, 'id'> }) {
    await db<StoredConnection>('_nango_connections').where({ id: connection.id! }).update({ end_user_id: null });
}

export async function getEndUserByConnectionId(db: Knex, props: { connectionId: number }): Promise<Result<EndUser, EndUserError>> {
    const endUser = await db(END_USERS_TABLE)
        .select<DBEndUser>(`${END_USERS_TABLE}.*`)
        .join('_nango_connections', '_nango_connections.end_user_id', `${END_USERS_TABLE}.id`)
        .where('_nango_connections.id', '=', props.connectionId)
        .first();
    if (!endUser) {
        return Err(new EndUserError({ code: 'not_found', message: `End user not found`, payload: props }));
    }

    return Ok(EndUserMapper.from(endUser));
}

export async function upsertEndUser(
    db: Knex,
    {
        account,
        environment,
        endUserPayload,
        organization
    }: { account: DBTeam; environment: DBEnvironment; endUserPayload: ConnectSessionInput['end_user']; organization?: ConnectSessionInput['organization'] }
): Promise<Result<EndUser, EndUserError>> {
    // Check if the endUser exists in the database
    const endUserRes = await getEndUser(db, {
        endUserId: endUserPayload.id,
        accountId: account.id,
        environmentId: environment.id
    });

    // --- Create end user if it doesn't exist yet
    if (endUserRes.isErr()) {
        if (endUserRes.error.code !== 'not_found') {
            return endUserRes;
        }

        const createdEndUser = await createEndUser(db, {
            endUserId: endUserPayload.id,
            email: endUserPayload.email || null,
            displayName: endUserPayload.display_name || null,
            organization: organization?.id
                ? {
                      organizationId: organization.id,
                      displayName: organization.display_name || null
                  }
                : null,
            accountId: account.id,
            environmentId: environment.id
        });
        if (createdEndUser.isErr()) {
            return createdEndUser;
        }

        return Ok(createdEndUser.value);
    }

    // --- Update
    const endUser = endUserRes.value;
    const shouldUpdate =
        endUser.email !== endUserPayload.email ||
        endUser.displayName !== endUserPayload.display_name ||
        endUser.organization?.organizationId !== organization?.id ||
        endUser.organization?.displayName !== organization?.display_name;
    if (!shouldUpdate) {
        return Ok(endUser);
    }

    const updatedEndUser = await updateEndUser(db, {
        endUserId: endUser.endUserId,
        accountId: account.id,
        environmentId: environment.id,
        email: endUserPayload.email || null,
        displayName: endUserPayload.display_name || null,
        organization: organization?.id
            ? {
                  organizationId: organization.id,
                  displayName: organization.display_name || null
              }
            : null
    });
    if (updatedEndUser.isErr()) {
        return updatedEndUser;
    }

    return Ok(updatedEndUser.value);
}
