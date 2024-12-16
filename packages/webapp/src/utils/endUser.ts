import type { ApiEndUser } from '@nangohq/types';

export function getConnectionDisplayName({ endUser, connectionId }: { endUser?: ApiEndUser | null; connectionId: string }): string {
    return endUser?.displayName || endUser?.email || connectionId;
}
