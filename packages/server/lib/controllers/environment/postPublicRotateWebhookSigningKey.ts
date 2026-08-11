import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapperWithEnvironment } from '../../utils/asyncWrapper.js';
import { handleRotateWebhookSigningKey } from '../shared/environment/rotateWebhookSigningKey.js';

import type { PostPublicRotateWebhookSigningKey } from '@nangohq/types';

export const postPublicRotateWebhookSigningKey = asyncWrapperWithEnvironment<PostPublicRotateWebhookSigningKey>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    await handleRotateWebhookSigningKey({ res, environmentId: res.locals.environment.id });
});
