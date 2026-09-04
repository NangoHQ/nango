import * as z from 'zod';

import { environmentService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { envSchema } from '../../helpers/validation.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { GetPublicEnvironments } from '@nangohq/types';

const validationQuery = z.object({ name: envSchema.optional() }).strict();

export const getPublicEnvironments = asyncWrapper<GetPublicEnvironments>(async (req, res) => {
    const query = validationQuery.safeParse(req.query);
    if (!query.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(query.error) } });
        return;
    }

    const account = res.locals.account;
    if (!account) {
        res.status(500).send({ error: { code: 'server_error', message: 'Account context is required' } });
        return;
    }

    const environments = await environmentService.getEnvironmentsByAccountId(account.id, query.data.name);

    res.status(200).send({
        data: environments.map(({ id, uuid, name, is_production }) => ({ id, uuid, name, is_production }))
    });
});
