import * as z from 'zod';

import { userService } from '@nangohq/shared';
import { requireEmptyQuery, roles, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';
import { hasRbac } from '../../../../utils/rbac.js';

import type { PatchTeamUser } from '@nangohq/types';

const paramValidation = z
    .object({
        id: z.coerce.number()
    })
    .strict();

const bodyValidation = z
    .object({
        role: z.enum(roles)
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

    const { account, user: me, plan } = res.locals;
    const params: PatchTeamUser['Params'] = paramVal.data;
    const body: PatchTeamUser['Body'] = bodyVal.data;

    const hasRbacRes = await hasRbac({ accountId: account.id, plan });
    if (hasRbacRes.isErr()) {
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to check RBAC' } });
        return;
    }

    if (!hasRbacRes.value && body.role !== 'administrator') {
        res.status(403).send({ error: { code: 'feature_disabled', message: 'Role-based access control requires a Growth plan or above' } });
        return;
    }

    const user = await userService.getUserById(params.id);
    if (!user || user.account_id !== account.id) {
        res.status(400).send({ error: { code: 'user_not_found' } });
        return;
    }

    // Prevent self-demotion — since only admins can change roles,
    // blocking self-change guarantees at least one admin remains.
    if (user.id === me.id) {
        res.status(400).send({ error: { code: 'forbidden_self_demotion', message: 'You cannot change your own role' } });
        return;
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
