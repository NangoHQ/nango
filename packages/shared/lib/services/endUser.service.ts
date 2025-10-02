/* eslint-disable prettier/prettier */
import { Err, Ok } from '@nangohq/utils';

import type { Knex } from '@nangohq/database';
import type {
    ConnectSession,
    ConnectSessionInput,
    DBConnection,
    DBEndUser,
    DBEnvironment,
    DBInsertEndUser,
    DBTeam,
    EndUser,
    InternalEndUser
} from '@nangohq/types';
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
            tags: endUser.tags || null,
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
            tags: dbEndUser.tags || null,
            createdAt: dbEndUser.created_at,
            updatedAt: dbEndUser.updated_at
        };
    },
    apiToEndUser: (endUser: ConnectSessionInput['end_user'], organization?: ConnectSessionInput['organization'] | null): InternalEndUser => {
        return {
            endUserId: endUser.id,
            email: endUser.email || null,
            displayName: endUser.display_name || null,
            tags: endUser.tags || null,
            organization: organization
                ? {
                      organizationId: organization.id,
                      displayName: organization.display_name || null
                  }
                : null
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
        environmentId,
        tags
    }: Pick<EndUser, 'endUserId' | 'email' | 'displayName' | 'organization' | 'accountId' | 'environmentId' | 'tags'>
): Promise<Result<EndUser, EndUserError>> {
    const dbEndUser: DBInsertEndUser = {
        end_user_id: endUserId,
        account_id: accountId,
        environment_id: environmentId,
        email,
        display_name: displayName || null,
        organization_id: organization?.organizationId || null,
        organization_display_name: organization?.displayName || null,
        tags
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
    props: { id: number; accountId: number; environmentId: number },
    { forUpdate = false }: { forUpdate?: boolean } = {}
): Promise<Result<EndUser, EndUserError>> {
    const query = db.from<DBEndUser>(END_USERS_TABLE).select('*').where({
        id: props.id,
        environment_id: props.environmentId,
        account_id: props.accountId
    });
    if (forUpdate) {
        query.forUpdate();
    }
    const endUser = await query.first();

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
        id,
        accountId,
        environmentId,
        endUserId,
        email,
        displayName,
        organization,
        tags
    }: Pick<EndUser, 'id' | 'endUserId' | 'email' | 'displayName' | 'organization' | 'accountId' | 'environmentId' | 'tags'>
): Promise<Result<EndUser, EndUserError>> {
    const [updated] = await db<DBEndUser>(END_USERS_TABLE)
        .where({ id, account_id: accountId, environment_id: environmentId })
        .update({
            end_user_id: endUserId,
            email,
            display_name: displayName || null,
            organization_id: organization?.organizationId || null,
            organization_display_name: organization?.displayName || null,
            tags: tags || null,
            updated_at: new Date()
        })
        .returning('*');
    if (!updated) {
        return Err(
            new EndUserError({
                code: 'update_failed',
                message: `Failed update of end user '${id}'`,
                payload: { id, accountId, environmentId }
            })
        );
    }
    return Ok(EndUserMapper.from(updated));
}

export async function linkConnection(db: Knex, { endUserId, connection }: { endUserId: number; connection: Pick<DBConnection, 'id'> }) {
    await db<DBConnection>('_nango_connections').where({ id: connection.id }).update({ end_user_id: endUserId });
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
        connection,
        endUser
    }: {
        account: DBTeam;
        environment: DBEnvironment;
        connection: Pick<DBConnection, 'end_user_id'>;
        endUser: InternalEndUser;
    }
): Promise<Result<EndUser, EndUserError>> {
    if (!connection.end_user_id) {
        const createdEndUser = await createEndUser(db, { accountId: account.id, environmentId: environment.id, ...endUser });
        if (createdEndUser.isErr()) {
            return createdEndUser;
        }

        return Ok(createdEndUser.value);
    }

    return await getAndUpdateIfModifiedEndUser(db, {
        id: connection.end_user_id,
        account,
        environment,
        endUser
    });
}

async function getAndUpdateIfModifiedEndUser(
    db: Knex,
    {
        id,
        account,
        environment,
        endUser
    }: {
        id: number;
        account: DBTeam;
        environment: DBEnvironment;
        endUser: InternalEndUser;
        connection?: number;
    }
): Promise<Result<EndUser, EndUserError>> {
    // Check if the endUser exists in the database
    const endUserRes = await getEndUser(db, { id, accountId: account.id, environmentId: environment.id }, { forUpdate: true });
    if (endUserRes.isErr()) {
        return endUserRes;
    }

    const previousEndUser = endUserRes.value;
    const shouldUpdate =
        endUser.endUserId !== previousEndUser.endUserId ||
        endUser.email !== previousEndUser.email ||
        endUser.displayName !== previousEndUser.displayName ||
        endUser.organization?.organizationId !== previousEndUser.organization?.organizationId ||
        endUser.organization?.displayName !== previousEndUser.organization?.displayName ||
        JSON.stringify(endUser.tags) !== JSON.stringify(previousEndUser.tags);
    if (!shouldUpdate) {
        return Ok(endUserRes.value);
    }

    const updatedEndUser = await updateEndUser(db, {
        ...endUser,
        id: previousEndUser.id,
        accountId: account.id,
        environmentId: environment.id
    });
    if (updatedEndUser.isErr()) {
        return updatedEndUser;
    }

    return Ok(updatedEndUser.value);
}

export async function syncEndUserToConnection(
    db: Knex,
    {
        connectSession,
        connection,
        account,
        environment
    }: { connectSession: ConnectSession; connection: DBConnection; account: DBTeam; environment: DBEnvironment }
): Promise<Result<boolean, EndUserError>> {
    if (!connectSession.endUser) {
        return Ok(false);
    }

    const upsertRes = await upsertEndUser(db, {
        account,
        environment,
        connection,
        endUser: connectSession.endUser
    });
    if (upsertRes.isErr()) {
        return Err(upsertRes.error);
    }

    await linkConnection(db, { endUserId: upsertRes.value.id, connection });
    return Ok(true);
}
