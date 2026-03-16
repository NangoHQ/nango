import * as z from 'zod';

import { userService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { PatchTeamUser } from '@nangohq/types';

const VALID_ROLES = ['administrator', 'production_support', 'development_full_access'] as const;

const paramValidation = z
    .object({
        id: z.coerce.number()
    })
    .strict();

const bodyValidation = z
    .object({
        role: z.enum(VALID_ROLES)
    })
    .strict();

export const patchTeamUser = asyncWrapper<PatchTeamUser>(async (req, res) => {
    const emptyQuery = requireEmptyQuery(req, { withEnv: true });
    if (emptyQuery) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
        return;
    }

    const paramVal = paramValidation.safeParse(req.params);
    if (!paramVal.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(paramVal.error) } });
        return;
    }

    const bodyVal = bodyValidation.safeParse(req.body);
    if (!bodyVal.success) {
        res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(bodyVal.error) } });
        return;
    }

    const { account } = res.locals;
    const params: PatchTeamUser['Params'] = paramVal.data;
    const body: PatchTeamUser['Body'] = bodyVal.data;

    const user = await userService.getUserById(params.id);
    if (!user || user.account_id !== account.id) {
        res.status(400).send({ error: { code: 'user_not_found' } });
        return;
    }

    // Prevent demoting the last administrator
    if (user.role === 'administrator' && body.role !== 'administrator') {
        const admins = await userService.getUsersByAccountId(account.id);
        const adminCount = admins.filter((u) => u.role === 'administrator').length;
        if (adminCount <= 1) {
            res.status(400).send({ error: { code: 'forbidden_last_admin', message: 'Cannot change the role of the last administrator' } });
            return;
        }
    }

    const updated = await userService.update({ id: user.id, role: body.role });
    if (!updated) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to update user role' } });
        return;
    }

    res.status(200).send({
        data: { success: true }
    });
});
