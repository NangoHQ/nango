import { AnalyticsTypes, acceptInvitation, analytics, getInvitation, userService } from '@nangohq/shared';
import { asyncWrapper } from '../../../utils/asyncWrapper.js';
import { isCloud, requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';
import { z } from 'zod';
import type { AcceptInvite } from '@nangohq/types';

const validation = z
    .object({
        id: z.string().uuid()
    })
    .strict();

export const acceptInvite = asyncWrapper<AcceptInvite>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req);
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const val = validation.safeParse(req.params);
    if (!val.success) {
        res.status(400).send({
            error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) }
        });
        return;
    }

    const { user } = res.locals;
    const data: AcceptInvite['Params'] = val.data;
    const invitation = await getInvitation(data.id);
    if (!invitation || invitation.email !== user.email) {
        res.status(400).send({ error: { code: 'not_found', message: 'Invitation does not exists or is expired' } });
        return;
    }

    await acceptInvitation(data.id);
    const updated = await userService.update({ id: user.id, account_id: invitation.account_id });
    if (!updated) {
        res.status(500).send({ error: { code: 'server_error', message: 'failed to update user team' } });
        return;
    }

    void analytics.track(AnalyticsTypes.ACCOUNT_JOINED, invitation.account_id, {}, isCloud ? { email: invitation.email } : {});

    // User is stored in session, so we need to update the DB
    // @ts-expect-error you got to love passport
    req.session.passport.user = updated;
    req.session.save((err) => {
        if (err) {
            res.status(500).send({ error: { code: 'server_error', message: 'failed to update session' } });
            return;
        }

        res.status(200).send({
            data: { success: true }
        });
    });
});
