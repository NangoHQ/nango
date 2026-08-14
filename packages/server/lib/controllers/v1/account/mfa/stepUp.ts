import * as z from 'zod';

import { mfaService } from '@nangohq/shared';

import { isMFAEnabled } from './login.js';

import type { DBUser, MFACredential } from '@nangohq/types';
import type { Knex } from 'knex';

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
 * Whether this user owes a second factor. Consumes nothing and needs no transaction, so callers can
 * turn away a request with no credential before spending anything expensive on it.
 */
export async function isStepUpRequired(user: DBUser): Promise<boolean> {
    return (await isMFAEnabled(user)) && (await mfaService.hasActiveFactor(user.id));
}

/**
 * Second factor for a sensitive action the user is already part way through, rather than for a login.
 * Returns 'not_required' when the user has nothing enrolled, so callers stay usable for everyone else.
 *
 * Call this inside the transaction that performs the action and pass `trx`. A one-time credential is
 * spent here, so it has to roll back with the action rather than outlive a failed one.
 */
export async function verifyStepUpMfa(user: DBUser, credential: MFACredential | undefined, trx: Knex): Promise<StepUpOutcome> {
    // Re-checked here rather than trusted from an earlier isStepUpRequired call, so enrolling a
    // factor mid-request cannot slip a write past the gate.
    if (!(await isStepUpRequired(user))) {
        return 'not_required';
    }

    if (!credential) {
        return 'required';
    }

    const verified = (
        credential.type === 'recoveryCode'
            ? await mfaService.consumeRecoveryCode(user.id, credential.recoveryCode, trx)
            : await mfaService.verifyTotp(user.id, credential.code, trx)
    ).unwrap();

    return verified ? 'verified' : 'invalid';
}
