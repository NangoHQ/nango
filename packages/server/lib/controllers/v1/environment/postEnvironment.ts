import { z } from 'zod';

import db from '@nangohq/database';
import { environmentService, externalWebhookService, getPlan } from '@nangohq/shared';
import { flagHasPlan, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { envSchema } from '../../../helpers/validation.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

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

    const accountId = res.locals.user.account_id;
    const environments = await environmentService.getEnvironmentsByAccountId(accountId);

    if (flagHasPlan) {
        const planRes = await getPlan(db.knex, { accountId });
        if (planRes.isErr()) {
            res.status(500).send({ error: { code: 'server_error', message: 'Unable to get plan' } });
            return;
        }

        const plan = planRes.value;
        if (plan && environments.length >= plan.environments_max) {
            res.status(400).send({
                error: {
                    code: 'resource_capped',
                    message: plan.name === 'free' ? 'Creating environment is only available for paying customer' : "Can't create more environments. "
                }
            });
            return;
        }
    }

    const exists = environments.some((env) => env.name === body.name);
    if (exists) {
        res.status(409).send({ error: { code: 'conflict', message: 'Environment already exists' } });
        return;
    }

    const created = await environmentService.createEnvironment(accountId, body.name);
    if (!created) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to create environment' } });
        return;
    }

    await externalWebhookService.update(created.id, {
        on_auth_creation: true,
        on_auth_refresh_error: true,
        on_sync_completion_always: true,
        on_sync_error: true
    });

    res.status(200).send({ data: { id: created.id, name: created.name } });
});
