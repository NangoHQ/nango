import * as z from 'zod';

import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { envSchema } from '../../../helpers/validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { handlePostEnvironment } from '../../shared/environments/postEnvironment.js';

import type { PostEnvironment } from '@nangohq/types';

const validationBody = z
    .object({
        name: envSchema
    })
    .strict();

export const postEnvironment = asyncWrapper<PostEnvironment>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = validationBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const body: PostEnvironment['Body'] = valBody.data;

    await handlePostEnvironment({ res, accountId: res.locals.account.id, name: body.name });
});
