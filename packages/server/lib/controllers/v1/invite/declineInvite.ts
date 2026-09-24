import * as z from 'zod';

import { declineInvitation, getInvitation, validateInvitation } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../utils/asyncWrapper.js';

import type { DeclineInvite } from '@nangohq/types';

const validation = z
    .object({
        id: z.string().uuid()
    })
    .strict();

export const declineInvite = asyncWrapper<DeclineInvite>(async (req, res) => {
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
    const data: DeclineInvite['Params'] = val.data;
    const invitation = validateInvitation(await getInvitation(data.id), user.email);
    if (invitation.isErr()) {
        res.status(400).send({ error: { code: invitation.error.code, message: invitation.error.message } });
        return;
    }

    const declined = await declineInvitation(data.id);
    if (!declined) {
        res.status(500).send({ error: { code: 'server_error', message: 'failed to decline invitation' } });
        return;
    }

    res.status(200).send({
        data: { success: true }
    });
});
