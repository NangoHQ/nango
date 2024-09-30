import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { PostConnectSessions, PostInternalConnectSessions } from '@nangohq/types';
import { postConnectSessions } from '../../../connect/postSessions.js';

export const postInternalConnectSessions = asyncWrapper<PostInternalConnectSessions>((req, res, next) => {
    const valQuery = requireEmptyQuery(req, { withEnv: true });
    if (valQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const valBody = requireEmptyBody(req);
    if (valBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { user } = res.locals;

    // @ts-expect-error req.body is never but we want to fake it on purpose
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    req.body = {
        end_user: { id: `nango_${user.id}`, email: user.email, display_name: user.name }
    } satisfies PostConnectSessions['Body'];

    // @ts-expect-error yes I know
    req.query = {};

    postConnectSessions(req as any, res, next);
});
