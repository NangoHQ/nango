import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapperWithEnvironment } from '../../../utils/asyncWrapper.js';
import { handleRotateWebhookSigningKey } from '../../shared/environment/rotateWebhookSigningKey.js';

import type { PostRotateWebhookSigningKey } from '@nangohq/types';

export const postRotateWebhookSigningKey = asyncWrapperWithEnvironment<PostRotateWebhookSigningKey>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    await handleRotateWebhookSigningKey({ res, environmentId: res.locals.environment.id });
});
