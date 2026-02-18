/* eslint-disable prettier/prettier */
import { Err, Ok, getLogger } from '@nangohq/utils';

const logger = getLogger('endUser.service');

import { TAG_KEY_MAX_LENGTH, TAG_MAX_COUNT, TAG_VALUE_MAX_LENGTH, connectionTagsKeySchema, connectionTagsSchema } from './tags/schema.js';

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
    InternalEndUser,
    Tags
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

/**
 * Build tags from endUser and organization fields for backward compatibility.
 * Existing users using endUser/organization fields will have their metadata
 * automatically populated as tags.
 *
 * Merge priority (lowest to highest):
 * 1. Auto-generated from end_user (end_user_id, end_user_email, end_user_display_name)
 * 2. Auto-generated from organization (organization_id, organization_display_name)
 * 3. end_user.tags (can override auto-generated tags)
 *
 */
export function buildTagsFromEndUser(
    endUser: ConnectSessionInput['end_user'] | null | undefined,
    organization: ConnectSessionInput['organization'] | null | undefined
): Tags {
    const MAX_LOG_KEYS = 200;

    const pushCapped = <T>(list: T[], item: T) => {
        if (list.length >= MAX_LOG_KEYS) {
            return;
        }
        list.push(item);
    };

    const issues: {
        truncated_key: { key: string; truncated_key: string; original_length: number }[];
        truncated_value: { key: string; original_length: number }[];
        invalid_key_format: { key: string; normalized_key: string; message: string }[];
        dropped_end_user_tags_due_to_max_count: string[];
        truncated_base_value: { key: string; original_length: number }[];
    } = {
        truncated_key: [],
        truncated_value: [],
        invalid_key_format: [],
        dropped_end_user_tags_due_to_max_count: [],
        truncated_base_value: []
    };

    const truncate = (value: string, maxLength: number): string => {
        return value.length > maxLength ? value.slice(0, maxLength) : value;
    };

    const setIfValidValue = (tags: Tags, key: string, value: unknown) => {
        if (typeof value !== 'string') {
            return;
        }

        if (value.length > TAG_VALUE_MAX_LENGTH) {
            pushCapped(issues.truncated_base_value, { key, original_length: value.length });
        }

        const truncated = truncate(value, TAG_VALUE_MAX_LENGTH);
        if (truncated.length === 0) {
            return;
        }

        tags[key] = truncated;
    };

    const baseTags: Tags = {};

    if (endUser) {
        setIfValidValue(baseTags, 'end_user_id', endUser.id);
        setIfValidValue(baseTags, 'end_user_email', endUser.email);
        setIfValidValue(baseTags, 'end_user_display_name', endUser.display_name);
    }

    if (organization) {
        setIfValidValue(baseTags, 'organization_id', organization.id);
        setIfValidValue(baseTags, 'organization_display_name', organization.display_name);
    }

    const endUserTags: Tags = {};
    const rawEndUserTagKeys: string[] = [];
    if (endUser?.tags) {
        for (const [rawKey, rawValue] of Object.entries(endUser.tags)) {
            pushCapped(rawEndUserTagKeys, rawKey);

            if (typeof rawValue !== 'string') {
                continue;
            }

            const lowerKey = rawKey.toLowerCase();
            const truncatedKey = truncate(lowerKey, TAG_KEY_MAX_LENGTH);
            if (lowerKey.length > TAG_KEY_MAX_LENGTH) {
                pushCapped(issues.truncated_key, { key: rawKey, truncated_key: truncatedKey, original_length: lowerKey.length });
            }

            const parseKeyResult = connectionTagsKeySchema.safeParse(truncatedKey);
            if (!parseKeyResult.success) {
                const message = parseKeyResult.error.issues[0]?.message ?? 'Invalid tag key';
                pushCapped(issues.invalid_key_format, { key: rawKey, normalized_key: truncatedKey, message });
                continue;
            }

            if (rawValue.length > TAG_VALUE_MAX_LENGTH) {
                pushCapped(issues.truncated_value, { key: rawKey, original_length: rawValue.length });
            }

            const truncatedValue = truncate(rawValue, TAG_VALUE_MAX_LENGTH);

            endUserTags[truncatedKey] = truncatedValue;
        }
    }

    let generatedTags: Tags = baseTags;
    const hasEndUserTags = Object.keys(endUserTags).length > 0;
    if (hasEndUserTags) {
        generatedTags = { ...baseTags, ...endUserTags };
        // If base + end_user.tags exceeds the max key count, drop end_user.tags entirely.
        if (Object.keys(generatedTags).length > TAG_MAX_COUNT) {
            for (const key of rawEndUserTagKeys) {
                pushCapped(issues.dropped_end_user_tags_due_to_max_count, key);
            }
            generatedTags = baseTags;
        }
    }

    if (Object.keys(generatedTags).length === 0) {
        return {};
    }

    const hasIssues =
        issues.truncated_key.length > 0 ||
        issues.truncated_value.length > 0 ||
        issues.invalid_key_format.length > 0 ||
        issues.dropped_end_user_tags_due_to_max_count.length > 0 ||
        issues.truncated_base_value.length > 0;

    if (hasIssues) {
        logger.warning('Adjusted tags to meet constraints, found issues', {
            end_user_id: endUser?.id,
            organization_id: organization?.id,
            issues_cap: MAX_LOG_KEYS,
            issues
        });
    };

    const result = connectionTagsSchema.safeParse(generatedTags);
    if (result.success) {
        return result.data;
    }

    const validationError = result.error.issues[0]?.message;

    // Best effort fallback: keep base tags if end_user.tags is somehow invalid.
    if (hasEndUserTags) {
        const baseResult = connectionTagsSchema.safeParse(baseTags);
        if (baseResult.success) {
            logger.warning(`Failed to normalize tags from end_user.tags, using base tags only: ${validationError}`);
            return baseResult.data;
        }
    }

    logger.warning(`Failed to normalize tags from endUser/organization: ${validationError}`);
    return {};
}
