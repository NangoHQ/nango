import type { User } from '../../models';
import type { DiscourseUser } from '../types';

/**
 * Converts a DiscourseUser object to a slim User object.
 * Only includes essential properties mapped from DiscourseUser.
 * @param user The DiscourseUser object to convert.
 * @returns User object representing DiscourseUser user information.
 */
export function toUser(user: DiscourseUser): User {
    return {
        id: user.id,
        username: user.username,
        name: user.name,
        admin: user.admin
    };
}
