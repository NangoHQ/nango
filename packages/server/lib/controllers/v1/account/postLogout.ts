import { report, requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { PostLogout } from '@nangohq/types';

export const postLogout = asyncWrapper<PostLogout>((req, res) => {
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

    req.session.destroy((err) => {
        if (err) {
            report(err);
            res.status(500).send({ error: { code: 'server_error', message: 'Failed to destroy session' } });
            return;
        }

        res.status(200).send();
    });
});
