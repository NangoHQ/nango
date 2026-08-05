import { getLogger, requireEmptyBody, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { requestAccountInvitation } from '../../../../services/accountInvitationRequest.service.js';
import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { clearPendingAccountDiscovery, getPendingAccountDiscovery } from './accountDiscoverySession.js';

import type { AccountInvitationRequestError } from '../../../../services/accountInvitationRequest.service.js';
import type { PostOnboardingRequestInvite } from '@nangohq/types';
import type { Response } from 'express';

const logger = getLogger('Server.PostOnboardingRequestInvite');

const sendRequestInviteError = (res: Response<PostOnboardingRequestInvite['Reply']>, error: AccountInvitationRequestError) => {
    logger.error(error.message, error.context);

    switch (error.code) {
        case 'email_delivery_failed':
            res.status(503).send({ error: { code: 'email_delivery_failed' } });
            break;

        case 'account_not_found':
        case 'no_administrators':
            res.status(404).send({ error: { code: 'not_found' } });
            break;

        default:
            ((exhaustiveCheck: never) => {
                throw new Error(`Unhandled request account invitation error code: ${exhaustiveCheck}`);
            })(error.code);
    }
};

export const postOnboardingRequestInvite = asyncWrapper<PostOnboardingRequestInvite>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: false });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const emptyBody = requireEmptyBody(req);
    if (emptyBody) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(emptyBody.error) } });
        return;
    }

    const { user } = res.locals;
    const discovery = await getPendingAccountDiscovery(req, user.id);
    if (!discovery?.recommendation || !user.email_verified) {
        logger.error("Pending account discovery marker not found in session or email not verified, can't send invite requests.", {
            emailVerified: user.email_verified
        });
        res.status(404).send({ error: { code: 'not_found' } });
        return;
    }

    const result = await requestAccountInvitation({ user, accountId: discovery.recommendation.accountId });
    if (result.isErr()) {
        sendRequestInviteError(res, result.error);
        return;
    }

    await clearPendingAccountDiscovery(req).catch((err) =>
        logger.warning('Failed to clear account discovery onboarding session', { error: err, userId: user.id })
    );

    res.status(200).send({ data: { success: true } });
});
