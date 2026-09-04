import * as z from 'zod';

import { baseUrl, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { getWorkOSClient } from '../../../../clients/workos.client.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { createManagedAuthRequest, isSafePostLoginPath, saveSession } from './auth.js';

import type { PostManagedSignup } from '@nangohq/types';

const validation = z
    .object({
        provider: z.enum(['GoogleOAuth']),
        token: z.string().uuid().optional(),
        next: z.string().max(2048).refine(isSafePostLoginPath).optional()
    })
    .strict();

export const postManagedSignup = asyncWrapper<PostManagedSignup>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);

    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.body);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const body: PostManagedSignup['Body'] = val.data;
    const state = createManagedAuthRequest(req, { token: body.token, next: body.next });
    await saveSession(req);

    const workos = getWorkOSClient();
    const oAuthUrl = workos.userManagement.getAuthorizationUrl({
        clientId: process.env['WORKOS_CLIENT_ID'] || '',
        provider: body.provider,
        redirectUri: `${baseUrl}/api/v1/login/callback`,
        state
    });

    res.send({ data: { url: oAuthUrl } });
});
