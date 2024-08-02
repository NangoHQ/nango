import type { ApiInvitation, DBInvitation } from '@nangohq/types';

export function invitationToApi({ token, ...rest }: DBInvitation): ApiInvitation {
    return {
        ...rest,
        created_at: rest.created_at.toISOString(),
        updated_at: rest.updated_at.toISOString()
    };
}
