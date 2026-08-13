import * as z from 'zod';

import { mfaService } from '@nangohq/shared';

import { isMFAEnabled } from './login.js';

import type { DBUser, MFACredential } from '@nangohq/types';

export const mfaCredentialSchema = z.discriminatedUnion('type', [
    z
        .object({
            type: z.literal('code'),
            code: z.string().regex(/^\d{6}$/)
        })
        .strict(),
    z
        .object({
            type: z.literal('recoveryCode'),
            recoveryCode: z.string().min(1).max(255)
        })
        .strict()
]);

export type StepUpOutcome = 'not_required' | 'verified' | 'required' | 'invalid';

/**
 * Second factor for a sensitive action the user is already part way through, rather than for a login.
 * Returns 'not_required' when the user has nothing enrolled, so callers stay usable for everyone else.
 */
export async function verifyStepUpMfa(user: DBUser, credential: MFACredential | undefined): Promise<StepUpOutcome> {
    if (!(await isMFAEnabled(user)) || !(await mfaService.hasActiveFactor(user.id))) {
        return 'not_required';
    }

    if (!credential) {
        return 'required';
    }

    const verified = (
        credential.type === 'recoveryCode'
            ? await mfaService.consumeRecoveryCode(user.id, credential.recoveryCode)
            : await mfaService.verifyTotp(user.id, credential.code)
    ).unwrap();

    return verified ? 'verified' : 'invalid';
}
