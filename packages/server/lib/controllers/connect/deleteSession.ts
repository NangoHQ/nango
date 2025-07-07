import db from '@nangohq/database';
import { requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import * as connectSessionService from '../../services/connectSession.service.js';
import { asyncWrapper } from '../../utils/asyncWrapper.js';

import type { DeleteConnectSession } from '@nangohq/types';

export const deleteConnectSession = asyncWrapper<DeleteConnectSession>(async (req, res) => {
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

    const { connectSession, account, environment } = res.locals;

    const deleteSession = await connectSessionService.deleteConnectSession(db.knex, {
        id: connectSession.id,
        accountId: account.id,
        environmentId: environment.id
    });

    if (deleteSession.isErr()) {
        res.status(400).send({
            error: {
                code: 'server_error',
                message: 'Failed to delete connect session',
                payload: {
                    id: connectSession.id,
                    accountId: account.id,
                    environmentId: environment.id
                }
            }
        });
        return;
    }
    res.status(204).send();
});
