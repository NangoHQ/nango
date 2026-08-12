import { z } from 'zod';

export const INVITE_PREFILL_PARAM = 'invite_email';

export const inviteRowSchema = z.object({
    email: z.string().email('Please enter a valid email address'),
    role: z.enum(['administrator', 'production_support', 'development_full_access'] as const)
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
// 255 mirrors the server's cap in postInvite.
export function parseInvitePrefillEmail(raw: string | null): string {
    const trimmed = raw?.trim() ?? '';
    if (!trimmed || trimmed.length > 255) {
        return '';
    }
    return inviteRowSchema.shape.email.safeParse(trimmed).success ? trimmed : '';
}
