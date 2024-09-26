import type knex from 'knex';
import type { LinkedProfile } from '@nangohq/types';
import { Err, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';

const LINKED_PROFILES_TABLE = 'linked_profiles';

interface DBLinkedProfile {
    readonly id: number;
    readonly profile_id: string;
    readonly account_id: number;
    readonly environment_id: number;
    readonly email: string;
    readonly display_name?: string | null;
    readonly organization_id?: string | null;
    readonly organization_display_name?: string | null;
    readonly created_at: Date;
    readonly updated_at: Date | null;
}
type DbInsertLinkedProfile = Omit<DBLinkedProfile, 'id' | 'created_at' | 'updated_at'>;

const LinkedProfileMapper = {
    to: (profile: LinkedProfile): DBLinkedProfile => {
        return {
            id: profile.id,
            profile_id: profile.profileId,
            account_id: profile.accountId,
            environment_id: profile.environmentId,
            email: profile.email,
            display_name: profile.displayName || null,
            organization_id: profile.organization?.id || null,
            organization_display_name: profile.organization?.displayName || null,
            created_at: profile.createdAt,
            updated_at: profile.updatedAt
        };
    },
    from: (dbProfile: DBLinkedProfile): LinkedProfile => {
        return {
            id: dbProfile.id,
            profileId: dbProfile.profile_id,
            accountId: dbProfile.account_id,
            environmentId: dbProfile.environment_id,
            email: dbProfile.email,
            displayName: dbProfile.display_name || null,
            organization: dbProfile.organization_id
                ? {
                      id: dbProfile.organization_id,
                      displayName: dbProfile.organization_display_name || null
                  }
                : null,
            createdAt: dbProfile.created_at,
            updatedAt: dbProfile.updated_at
        };
    }
};

type LinkedProfileErrorCode = 'not_found' | 'creation_failed' | 'update_failed';
export class LinkedProfileError extends Error {
    public code: LinkedProfileErrorCode;
    public payload?: Record<string, unknown>;
    constructor({ code, message, payload }: { code: LinkedProfileErrorCode; message: string; payload?: Record<string, unknown> }) {
        super(message);
        this.code = code;
        this.payload = payload || {};
    }
}

export async function createLinkedProfile(
    db: knex.Knex,
    {
        profileId,
        email,
        displayName,
        organization,
        accountId,
        environmentId
    }: Pick<LinkedProfile, 'profileId' | 'email' | 'displayName' | 'organization' | 'accountId' | 'environmentId'>
): Promise<Result<LinkedProfile, LinkedProfileError>> {
    const dbProfile: DbInsertLinkedProfile = {
        profile_id: profileId,
        account_id: accountId,
        environment_id: environmentId,
        email,
        display_name: displayName || null,
        organization_id: organization?.id || null,
        organization_display_name: organization?.displayName || null
    };
    const [profile] = await db.insert<DBLinkedProfile>(dbProfile).into(LINKED_PROFILES_TABLE).returning('*');
    if (!profile) {
        return Err(
            new LinkedProfileError({
                code: 'creation_failed',
                message: 'Failed to create linked profile',
                payload: { profileId }
            })
        );
    }
    return Ok(LinkedProfileMapper.from(profile));
}

export async function getLinkedProfile(
    db: knex.Knex,
    { profileId, accountId, environmentId }: { profileId: string; accountId: number; environmentId: number }
): Promise<Result<LinkedProfile, LinkedProfileError>> {
    const profile = await db<DBLinkedProfile>(LINKED_PROFILES_TABLE)
        .where({ profile_id: profileId, account_id: accountId, environment_id: environmentId })
        .first();
    if (!profile) {
        return Err(
            new LinkedProfileError({
                code: 'not_found',
                message: `Linked profile not found`,
                payload: {
                    profileId,
                    accountId,
                    environmentId
                }
            })
        );
    }
    return Ok(LinkedProfileMapper.from(profile));
}

export async function updateLinkedProfile(
    db: knex.Knex,
    {
        profileId,
        accountId,
        environmentId,
        email,
        displayName,
        organization
    }: Pick<LinkedProfile, 'profileId' | 'email' | 'displayName' | 'organization' | 'accountId' | 'environmentId'>
): Promise<Result<LinkedProfile, LinkedProfileError>> {
    const [updated] = await db<DBLinkedProfile>(LINKED_PROFILES_TABLE)
        .where({ profile_id: profileId, account_id: accountId, environment_id: environmentId })
        .update({
            email,
            display_name: displayName || null,
            organization_id: organization?.id || null,
            organization_display_name: organization?.displayName || null,
            updated_at: new Date()
        })
        .returning('*');
    if (!updated) {
        return Err(
            new LinkedProfileError({
                code: 'update_failed',
                message: `Failed update of linked profile '${profileId}'`,
                payload: { profileId, accountId, environmentId }
            })
        );
    }
    return Ok(LinkedProfileMapper.from(updated));
}

export async function deleteLinkedProfile(
    db: knex.Knex,
    { profileId, accountId, environmentId }: { profileId: string; accountId: number; environmentId: number }
): Promise<Result<void, LinkedProfileError>> {
    const deleted = await db<DBLinkedProfile>(LINKED_PROFILES_TABLE)
        .where({ profile_id: profileId, account_id: accountId, environment_id: environmentId })
        .delete();
    if (!deleted) {
        return Err(
            new LinkedProfileError({ code: 'not_found', message: `Linked profile '${profileId}' not found`, payload: { profileId, accountId, environmentId } })
        );
    }
    return Ok(undefined);
}
