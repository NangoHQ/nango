import type { NangoSync, User } from '../../models';
import type { DiscourseUser } from '../types';
import paginate from '../helpers/paginate.js';
import type { PaginationParams } from '../helpers/paginate';
import { toUser } from '../mappers/toUser.js';

/**
 * Fetches user data from an API and saves it in batch.
 *
 * This function uses the `paginate` helper to fetch active users from the specified API endpoint in a paginated manner.
 * It maps the raw user data to a `User` format using the `toUser` mapper function and then saves the mapped data
 * using the `nango.batchSave` method.
 * For detailed endpoint documentation, refer to:
 * https://docs.discourse.org/#tag/Admin/operation/adminListUsers
 *
 * @param nango The NangoSync instance used for making API calls and saving data.
 * @returns A promise that resolves when the data has been successfully fetched and saved.
 */
export default async function fetchData(nango: NangoSync): Promise<void> {
    const config: PaginationParams = {
        endpoint: '/admin/users/list/active',
        params: {
            order: 'created',
            asc: 'true',
            stats: true // Additional parameters for the API request can be added in here
        }
    };

    for await (const users of paginate<DiscourseUser>(nango, config)) {
        await nango.batchSave<User>(users.map(toUser), 'User');
    }
}
