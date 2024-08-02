import type { AsanaUser, User } from '../../models';

export function toUser(user: AsanaUser): User {
    return {
        id: user.gid,
        name: user.name,
        email: user.email || null,
        avatar_url: user.photo ? user.photo.image_128x128 : null,
        created_at: null,
        modified_at: null
    };
}
