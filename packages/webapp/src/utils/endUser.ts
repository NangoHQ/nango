import type { ApiEndUser, Tags } from '@nangohq/types';

export function getConnectionDisplayName({
    endUser,
    connectionId,
    connectionTags
}: {
    endUser?: ApiEndUser | null;
    connectionId: string;
    connectionTags?: Tags;
}): string {
    return connectionTags?.end_user_display_name || endUser?.display_name || endUser?.email || connectionId;
}

// The playground only uses connections tagged with the signed-in user's email.
export function isOwnTestConnection(connectionTags: Tags | undefined, userEmail: string | undefined): boolean {
    return Boolean(userEmail) && connectionTags?.['end_user_email'] === userEmail;
}

export function getEndUserEmail(endUser: ApiEndUser | null | undefined, connectionTags?: Tags): string | null {
    return connectionTags?.end_user_email || endUser?.email || null;
}
