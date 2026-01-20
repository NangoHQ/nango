import * as z from 'zod';

import { buildTagsFromEndUser } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { bodySchema as originalBodySchema, generateSession } from '../../../connect/postSessions.js';

import type { PostConnectSessions, PostInternalConnectSessions } from '@nangohq/types';

const bodySchema = z
    .object({
        allowed_integrations: originalBodySchema.shape.allowed_integrations,
        end_user: originalBodySchema.shape.end_user,
        organization: originalBodySchema.shape.organization,
        integrations_config_defaults: originalBodySchema.shape.integrations_config_defaults
    })
    .strict();

export const postInternalConnectSessions = asyncWrapper<PostInternalConnectSessions>(async (req, res) => {
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

    const body: PostInternalConnectSessions['Body'] = valBody.data;

    const endUserWithOrigin = { ...body.end_user, tags: { ...body.end_user.tags, origin: 'nango_dashboard' } };
    const endUserTags = buildTagsFromEndUser(endUserWithOrigin, body.organization);

    const emulatedBody = {
        allowed_integrations: body.allowed_integrations,
        end_user: endUserWithOrigin,
        organization: body.organization,
        integrations_config_defaults: body.integrations_config_defaults,
        tags: endUserTags
    } satisfies PostConnectSessions['Body'];

    await generateSession(res, emulatedBody);
});
