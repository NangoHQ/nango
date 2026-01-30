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

export function getEndUserEmail(endUser: ApiEndUser | null | undefined, connectionTags?: Tags): string | null {
    return connectionTags?.end_user_email || endUser?.email || null;
}
