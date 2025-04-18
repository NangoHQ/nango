import type { ApiUser, DBUser } from '@nangohq/types';

export function userToAPI(user: Pick<DBUser, 'id' | 'account_id' | 'email' | 'name' | 'uuid'>): ApiUser {
    return {
        id: user.id,
        accountId: user.account_id,
        email: user.email,
        name: user.name,
        uuid: user.uuid
    };
}
