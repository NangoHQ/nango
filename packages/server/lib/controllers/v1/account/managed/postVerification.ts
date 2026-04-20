import * as z from 'zod';

import { getLogger, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import {
    finalizeManagedAuthentication,
    getManagedAuthEmailVerificationFromError,
    getManagedAuthRequestMetadata,
    setManagedAuthEmailVerification
} from './auth.js';
import { getWorkOSClient } from '../../../../clients/workos.client.js';
import { envs } from '../../../../env.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { PostManagedEmailVerification } from '@nangohq/types';

const logger = getLogger('Server.AuthManagedVerification');

const validation = z
    .object({
        code: z.string().trim().min(1).max(255)
    })
    .strict();

const invalidVerificationCodeMessage = 'The verification code is invalid or has expired. Please try signing in with Google again.';
const invalidVerificationCodes = new Set(['verification_code_expired', 'verification_code_invalid']);

export const postManagedEmailVerification = asyncWrapper<PostManagedEmailVerification>(async (req, res) => {
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

    const verification = req.session.managedAuthEmailVerification;
    if (!verification) {
        res.status(404).send({
            error: { code: 'not_found', message: 'No pending WorkOS email verification was found. Please try signing in with Google again.' }
        });
        return;
    }

    const workos = getWorkOSClient();
    let authResponse: Awaited<ReturnType<typeof workos.userManagement.authenticateWithEmailVerification>>;

    try {
        authResponse = await workos.userManagement.authenticateWithEmailVerification({
            clientId: envs.WORKOS_CLIENT_ID || '',
            code: val.data.code,
            pendingAuthenticationToken: verification.pendingAuthenticationToken,
            ...getManagedAuthRequestMetadata(req)
        });
    } catch (err) {
        const workosErr = err as {
            rawData?: {
                code?: string;
            };
        };
        const updatedVerification = getManagedAuthEmailVerificationFromError(err);

        if (updatedVerification) {
            await setManagedAuthEmailVerification(req, updatedVerification, verification.state);
        } else if (!workosErr.rawData?.code || !invalidVerificationCodes.has(workosErr.rawData.code)) {
            throw err;
        }

        logger.warn('Failed to authenticate WorkOS email verification code', {
            code: workosErr.rawData?.code
        });
        res.status(400).send({
            error: {
                code: 'invalid_verification_code',
                message: invalidVerificationCodeMessage
            }
        });
        return;
    }

    await finalizeManagedAuthentication({
        req,
        res,
        authorizedUser: authResponse.user,
        organizationId: authResponse.organizationId,
        workos,
        state: verification.state,
        responseMode: 'json'
    });
});
