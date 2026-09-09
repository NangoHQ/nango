import * as z from 'zod';

import { environmentService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../utils/asyncWrapper.js';
import { handleCreateApiKey } from '../shared/environments/postApiKey.js';

import type { PostPublicApiKey } from '@nangohq/types';

const validationBody = z
    .object({
        display_name: z.string().min(1).max(255)
    })
    .strict();

const validationParams = z.object({ environmentUuid: z.uuid() }).strict();

export const postPublicEnvironmentApiKey = asyncWrapper<PostPublicApiKey>(async (req, res) => {
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

    const valParams = validationParams.safeParse(req.params);
    if (!valParams.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(valParams.error) } });
        return;
    }

    const { environmentUuid } = valParams.data;
    const { display_name: displayName } = valBody.data;

    const account = res.locals.account;
    if (!account) {
        res.status(500).send({ error: { code: 'server_error', message: 'Account context is required' } });
        return;
    }

    const environment = await environmentService.getByUuidWithoutSecrets(environmentUuid, account.id);
    if (!environment) {
        res.status(404).send({ error: { code: 'not_found', message: 'Environment not found' } });
        return;
    }

    await handleCreateApiKey({ res, accountId: account.id, environmentId: environment.id, displayName, scopes: ['environment:*'] });
});
