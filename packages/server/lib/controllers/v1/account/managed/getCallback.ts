import tracer from 'dd-trace';
import * as z from 'zod';

import { basePublicUrl, getLogger } from '@nangohq/utils';

import { finalizeManagedAuthentication, getManagedAuthEmailVerificationFromError, setManagedAuthEmailVerification } from './auth.js';
import { getWorkOSClient } from '../../../../clients/workos.client.js';
import { envs } from '../../../../env.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { GetManagedCallback } from '@nangohq/types';

const logger = getLogger('Server.AuthManaged');

const validation = z
    .object({
        code: z.string().min(1).max(255),
        state: z.string().optional()
    })
    .strict();

export const getManagedCallback = asyncWrapper<GetManagedCallback>(async (req, res) => {
    const val = validation.safeParse(req.query);
    if (!val.success) {
        logger.error('Invalid payload received from WorkOS');
        res.redirect(`${basePublicUrl}/signin?error=sso_session_expired`);
        return;
    }

    const query: GetManagedCallback['Querystring'] = val.data;
    const workos = getWorkOSClient();

    // Check the request against WorkOS
    let authorizedUser;
    let organizationId;
    try {
        const authResponse = await workos.userManagement.authenticateWithCode({
            clientId: envs.WORKOS_CLIENT_ID || '',
            code: query.code
        });
        authorizedUser = authResponse.user;
        organizationId = authResponse.organizationId;
    } catch (err) {
        const isInvalidGrant = err instanceof Error && (err as { error?: string }).error === 'invalid_grant';
        if (isInvalidGrant) {
            res.redirect(`${basePublicUrl}/signin?error=sso_session_expired`);
            return;
        }

        const verification = getManagedAuthEmailVerificationFromError(err);
        if (verification) {
            const span = tracer.scope().active();
            if (span) {
                span.setTag('workos.flow', 'email_verification');
            }
            await setManagedAuthEmailVerification(req, verification, query.state);
            res.redirect(`${basePublicUrl}/signin/verify`);
            return;
        }

        const workosErr = err as {
            rawData?: {
                code?: string;
                message?: string;
                pending_authentication_token?: string;
                email?: string;
                email_verification_id?: string;
            };
            requestID?: string;
        };
        const span = tracer.scope().active();
        if (span) {
            if (workosErr.requestID) {
                span.setTag('workos.request_id', workosErr.requestID);
            }
            if (workosErr.rawData) {
                span.setTag('workos.error_code', workosErr.rawData.code);
                span.setTag('workos.error_message', workosErr.rawData.message);
            }
        }

        throw err;
    }

    await finalizeManagedAuthentication({
        req,
        res,
        authorizedUser,
        organizationId,
        workos,
        state: query.state,
        responseMode: 'redirect'
    });
});
