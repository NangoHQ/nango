import * as z from 'zod';

import { isEnvironmentScopeSelector } from '@nangohq/authz';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapperWithEnvironment } from '../../../utils/asyncWrapper.js';
import { handleCreateApiKey } from '../../shared/environments/postApiKey.js';

import type { ApiKeyScope, CreateApiKey } from '@nangohq/types';

const validationBody = z
    .object({
        display_name: z.string().min(1).max(255),
        scopes: z
            .array(z.custom<ApiKeyScope>(isEnvironmentScopeSelector, { error: (issue) => `Unknown scope: ${String(issue.input)}` }))
            .nonempty('At least one scope is required when scopes are provided')
            .optional()
    })
    .strict();

export const createApiKey = asyncWrapperWithEnvironment<CreateApiKey>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const valBody = validationBody.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { environment, account } = res.locals;
    const { display_name: displayName, scopes } = valBody.data;

    await handleCreateApiKey({ res, accountId: account.id, environmentId: environment.id, displayName, scopes });
});
