import * as z from 'zod';

import { acceptInvitation, getInvitation, userService, validateInvitation } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

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
    const invitation = validateInvitation(await getInvitation(data.id), user.email);
    if (invitation.isErr()) {
        res.status(400).send({ error: { code: invitation.error.code, message: invitation.error.message } });
        return;
    }

    await acceptInvitation(data.id);
    const updated = await userService.update({ id: user.id, account_id: invitation.value.account_id, role: invitation.value.role });
    if (!updated) {
        res.status(500).send({ error: { code: 'server_error', message: 'failed to update user team' } });
        return;
    }

    // User is stored in session, so we need to update the DB
    const passportSession = (req.session as typeof req.session & { passport: { user: typeof updated } }).passport;
    passportSession.user = updated;
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
