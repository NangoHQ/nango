import { z } from 'zod';

import type { Role } from '@nangohq/types';

export const INVITE_PREFILL_PARAM = 'invite_email';

// `satisfies` anchors these to Role, so renaming or dropping one fails the build instead of
// silently diverging from the API. Same pattern as `roles` in @nangohq/utils, which the
// invite endpoint validates against.
const roleValues = ['administrator', 'production_support', 'development_full_access'] as const satisfies readonly Role[];

export const inviteRowSchema = z.object({
    // max(255) mirrors the invite endpoint, so an over-long address fails here instead of as a 400.
    email: z.string().max(255).email('Please enter a valid email address'),
    role: z.enum(roleValues)
});

export const inviteSchema = z.object({ invites: z.array(inviteRowSchema).min(1) }).superRefine(({ invites }, ctx) => {
    // Reject duplicate emails (case-insensitive) so one address isn't invited twice / raced across role requests.
    const seen = new Set<string>();
    invites.forEach((row, index) => {
        const email = row.email.trim().toLowerCase();
        if (!email) {
            return; // empty rows are handled by the per-row email() check
        }
        if (seen.has(email)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'This email is already in the list', path: ['invites', index, 'email'] });
        } else {
            seen.add(email);
        }
    });
});

export type InviteFormData = z.infer<typeof inviteSchema>;

export const emptyRow = (): InviteFormData['invites'][number] => ({ email: '', role: 'administrator' });

// The email comes from a link in a notification email, so treat it as untrusted. The form uses
// mode: 'onTouched', so an invalid value would sit there looking fine and only fail on submit.
// Validating against the row schema keeps the rules (format, length) in one place.
export function parseInvitePrefillEmail(raw: string | null): string {
    const trimmed = raw?.trim() ?? '';
    return trimmed && inviteRowSchema.shape.email.safeParse(trimmed).success ? trimmed : '';
}
