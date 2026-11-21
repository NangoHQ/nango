import db from '@nangohq/database';
import { requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import * as agentGettingStartedService from '../../../services/agentGettingStarted.service.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PostAgentGettingStartedDismiss } from '@nangohq/types';

export const postAgentGettingStartedDismiss = asyncWrapper<PostAgentGettingStartedDismiss>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const emptyBody = requireEmptyBody(req);
    if (emptyBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
        return;
    }

    const { account } = res.locals;

    await agentGettingStartedService.dismiss(db.knex, account.id);

    res.status(200).send({ data: await agentGettingStartedService.getStatus(db.knex, account.id) });
});
