import { z } from 'zod';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import type { PostEnvironment } from '@nangohq/types';
import { accountService, environmentService, externalWebhookService } from '@nangohq/shared';
import { envSchema } from '../../../helpers/validation.js';

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

    const account = await accountService.getAccountById(accountId);
    if (account?.is_capped) {
        res.status(400).send({ error: { code: 'feature_disabled', message: 'Creating environment is only available for paying customer' } });
        return;
    }

    const environments = await environmentService.getEnvironmentsByAccountId(accountId);
    if (environments.length >= 10) {
        res.status(400).send({ error: { code: 'resource_capped', message: "Can't create more environments" } });
        return;
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
        alwaysSendWebhook: true,
        sendAuthWebhook: true,
        sendRefreshFailedWebhook: true,
        sendSyncFailedWebhook: true
    });

    res.status(200).send({ data: { id: created.id, name: created.name } });
});
