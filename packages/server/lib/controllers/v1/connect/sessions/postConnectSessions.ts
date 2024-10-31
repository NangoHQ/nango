import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import type { PostConnectSessions, PostInternalConnectSessions } from '@nangohq/types';
import { postConnectSessions } from '../../../connect/postSessions.js';
import { z } from 'zod';

const bodySchema = z
    .object({
        allowed_integrations: z.array(z.string()).optional()
    })
    .strict();

export const postInternalConnectSessions = asyncWrapper<PostInternalConnectSessions>((req, res, next) => {
    const valQuery = requireEmptyQuery(req, { withEnv: true });
    if (valQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(valQuery.error) } });
        return;
    }

    const valBody = bodySchema.safeParse(req.body);
    if (!valBody.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(valBody.error) } });
        return;
    }

    const { user } = res.locals;
    const body: PostInternalConnectSessions['Body'] = valBody.data;

    // req.body is never but we want to fake it on purpose
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    req.body = {
        allowed_integrations: body.allowed_integrations,
        // @ts-expect-error body does not accept end_user but we still want to set it
        end_user: { id: `nango_dashboard_${user.id}`, email: user.email, display_name: user.name }
    } satisfies PostConnectSessions['Body'];

    // @ts-expect-error on internal api we pass ?env= but it's not allowed in public api
    req.query = {};

    postConnectSessions(req as any, res, next);
});
