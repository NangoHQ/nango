import db from '@nangohq/database';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import * as agentGettingStartedService from '../../../services/agentGettingStarted.service.js';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { GetAgentGettingStarted } from '@nangohq/types';

export const getAgentGettingStarted = asyncWrapper<GetAgentGettingStarted>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const { account } = res.locals;

    res.status(200).send({ data: await agentGettingStartedService.getStatus(db.knex, account.id) });
});
