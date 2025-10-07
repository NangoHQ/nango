import { z } from 'zod';

import { userService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { userToAPI } from '../../formatters/user.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { GetUsers } from '@nangohq/types';

const validationQuery = z.object({
    accountId: z.coerce.number()
});

export const getUsersProvider = asyncWrapper<GetUsers>(async (req, res) => {
    const valQuery = validationQuery.safeParse(req.query);
    if (!valQuery.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const users = await userService.getUsersByAccountId(valQuery.data.accountId);

    const usersFormatted = users.map(userToAPI);

    res.status(200).send({
        data: usersFormatted
    });
});
