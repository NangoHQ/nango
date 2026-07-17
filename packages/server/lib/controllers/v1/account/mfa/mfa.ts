import * as z from 'zod';

import { getFlags } from '@nangohq/feature-flags';
import { MFAError, mfaService } from '@nangohq/shared';
import { requireEmptyQuery, zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapper } from '../../../../utils/asyncWrapper.js';

import type { RequestLocals } from '../../../../utils/express.js';
import type { DeleteMFA, GetMFAStatus, PostMFAActivation, PostMFAEnrollment, PostMFARecoveryCodes } from '@nangohq/types';
import type { Request, Response } from 'express';

const codeValidation = z
    .object({
        code: z.string().regex(/^\d{6}$/)
    })
    .strict();

function validateQuery(req: Request, res: Response): boolean {
    const emptyQuery = requireEmptyQuery(req, { withEnv: false });
    if (!emptyQuery) {
        return true;
    }

    res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(emptyQuery.error) } });
    return false;
}

function validateCode(req: Request, res: Response): string | null {
    const val = codeValidation.safeParse(req.body);
    if (val.success) {
        return val.data.code;
    }

    res.status(400).send({ error: { code: 'invalid_body', errors: zodErrorToHTTP(val.error) } });
    return null;
}

function getAuthenticatedUser<T>(res: Response<T, Required<RequestLocals>>) {
    const user = res.locals['user'];
    if (!user) {
        throw new Error('MFA endpoint requires an authenticated user');
    }
    return user;
}

async function isMFAEnabled<T>(res: Response<T, Required<RequestLocals>>): Promise<boolean> {
    return await getFlags().isMFAEnabled(res.locals['account'].uuid);
}

function rejectDisabledFeature<T>(res: Response<T, Required<RequestLocals>>) {
    res.status(400).send({ error: { code: 'feature_disabled' } } as T);
}

export const getMFAStatus = asyncWrapper<GetMFAStatus>(async (req, res) => {
    if (!validateQuery(req, res)) {
        return;
    }
    if (!(await isMFAEnabled(res))) {
        rejectDisabledFeature(res);
        return;
    }

    const user = getAuthenticatedUser(res);
    res.status(200).send({ data: { enabled: await mfaService.hasActiveFactor(user.id) } });
});

export const postMFAEnrollment = asyncWrapper<PostMFAEnrollment>(async (req, res) => {
    if (!validateQuery(req, res)) {
        return;
    }
    if (!(await isMFAEnabled(res))) {
        rejectDisabledFeature(res);
        return;
    }

    const user = getAuthenticatedUser(res);
    const enrollment = await mfaService.startEnrollment(user.id, user.email);
    if (enrollment.isErr()) {
        if (enrollment.error instanceof MFAError && enrollment.error.code === 'already_enabled') {
            res.status(400).send({ error: { code: 'mfa_already_enabled' } });
            return;
        }
        throw enrollment.error;
    }
    res.status(200).send({ data: enrollment.value });
});

export const postMFAActivation = asyncWrapper<PostMFAActivation>(async (req, res) => {
    if (!validateQuery(req, res)) {
        return;
    }
    if (!(await isMFAEnabled(res))) {
        rejectDisabledFeature(res);
        return;
    }

    const code = validateCode(req, res);
    if (!code) {
        return;
    }

    const user = getAuthenticatedUser(res);
    const activation = await mfaService.activateEnrollment(user.id, code);
    if (activation.isErr()) {
        if (activation.error instanceof MFAError && activation.error.code === 'enrollment_not_found') {
            res.status(400).send({ error: { code: 'mfa_enrollment_not_found' } });
            return;
        }
        if (activation.error instanceof MFAError && activation.error.code === 'invalid_code') {
            res.status(400).send({ error: { code: 'invalid_mfa_code' } });
            return;
        }
        throw activation.error;
    }
    res.status(200).send({ data: activation.value });
});

export const postMFARecoveryCodes = asyncWrapper<PostMFARecoveryCodes>(async (req, res) => {
    if (!validateQuery(req, res)) {
        return;
    }
    if (!(await isMFAEnabled(res))) {
        rejectDisabledFeature(res);
        return;
    }

    const code = validateCode(req, res);
    if (!code) {
        return;
    }

    const user = getAuthenticatedUser(res);
    if (!(await mfaService.hasActiveFactor(user.id))) {
        res.status(400).send({ error: { code: 'mfa_not_enabled' } });
        return;
    }
    const verified = await mfaService.verifyTotp(user.id, code);
    if (verified.isErr()) {
        throw verified.error;
    }
    if (!verified.value) {
        res.status(400).send({ error: { code: 'invalid_mfa_code' } });
        return;
    }

    const recoveryCodes = await mfaService.regenerateRecoveryCodes(user.id);
    if (recoveryCodes.isErr()) {
        throw recoveryCodes.error;
    }
    res.status(200).send({ data: { recoveryCodes: recoveryCodes.value } });
});

export const deleteMFA = asyncWrapper<DeleteMFA>(async (req, res) => {
    if (!validateQuery(req, res)) {
        return;
    }
    if (!(await isMFAEnabled(res))) {
        rejectDisabledFeature(res);
        return;
    }

    const code = validateCode(req, res);
    if (!code) {
        return;
    }

    const user = getAuthenticatedUser(res);
    if (!(await mfaService.hasActiveFactor(user.id))) {
        res.status(400).send({ error: { code: 'mfa_not_enabled' } });
        return;
    }
    const verified = await mfaService.verifyTotp(user.id, code);
    if (verified.isErr()) {
        throw verified.error;
    }
    if (!verified.value) {
        res.status(400).send({ error: { code: 'invalid_mfa_code' } });
        return;
    }

    const disabled = await mfaService.disable(user.id);
    if (disabled.isErr()) {
        throw disabled.error;
    }
    res.status(200).send({ success: true });
});
