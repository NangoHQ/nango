import type { DeleteConnectSession } from '@nangohq/types';
import db from '@nangohq/database';
import { asyncWrapper } from '../../utils/asyncWrapper.js';
import * as connectSessionService from '../../services/connectSession.service.js';
import { requireEmptyQuery, requireEmptyBody, zodErrorToHTTP } from '@nangohq/utils';

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

    const deleteSession = await connectSessionService.deleteConnectSession(db.knex, {
        id: res.locals.connectSession.id,
        accountId: res.locals.account.id,
        environmentId: res.locals.environment.id
    });

    if (deleteSession.isErr()) {
        res.status(400).send({
            error: {
                code: 'server_error',
                message: 'Failed to delete connect session',
                payload: {
                    id: res.locals.connectSession.id,
                    accountId: res.locals.account.id,
                    environmentId: res.locals.environment.id
                }
            }
        });
        return;
    }
    res.status(204).send();
});
