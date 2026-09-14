import * as z from 'zod';

import { baseUrl, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { getWorkOSClient } from '../../../../clients/workos.client.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { safeReturnTo } from '../returnTo.js';

import type { PostManagedSignup } from '@nangohq/types';

export interface ManagedAuthState {
    token?: string;
    returnTo?: string;
}

const validation = z
    .object({
        provider: z.enum(['GoogleOAuth']),
        token: z.string().uuid().optional(),
        returnTo: z.string().optional()
    })
    .strict();

export const postManagedSignup = asyncWrapper<PostManagedSignup>((req, res) => {
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

    const state: ManagedAuthState = {};
    if (body.token) {
        state.token = body.token;
    }
    if (body.returnTo) {
        const returnTo = safeReturnTo(body.returnTo);
        if (returnTo !== '/') {
            state.returnTo = returnTo;
        }
    }

    const workos = getWorkOSClient();
    const oAuthUrl = workos.userManagement.getAuthorizationUrl({
        clientId: process.env['WORKOS_CLIENT_ID'] || '',
        provider: body.provider,
        redirectUri: `${baseUrl}/api/v1/login/callback`,
        state: Object.keys(state).length > 0 ? Buffer.from(JSON.stringify(state)).toString('base64') : ''
    });

    res.send({ data: { url: oAuthUrl } });
});
