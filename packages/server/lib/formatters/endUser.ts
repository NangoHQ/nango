import type { ApiEndUser, DBEndUser } from '@nangohq/types';

export function endUserToApi(endUser: DBEndUser | null): ApiEndUser | null {
    if (!endUser) {
        return null;
    }

    return {
        id: endUser.end_user_id,
        displayName: endUser.display_name || null,
        email: endUser.email,
        organization: endUser.organization_id ? { id: endUser.organization_id, displayName: endUser.organization_display_name || null } : null
    };
}
