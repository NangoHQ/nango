import crypto from 'node:crypto';

const EMAIL_ADDRESS_HASH_CONTEXT = 'nango.emailAddressHash.v1';

export function normalizeEmailAddress(emailAddress: string): string {
    return emailAddress.trim().toLowerCase();
}

/**
 * Pseudonymize an email address for storage/comparison.
 *
 * This is done to avoid storing raw email addresses.
 */
export function hashEmailAddress(emailAddress: string): string {
    const normalized = normalizeEmailAddress(emailAddress);
    const payload = `${EMAIL_ADDRESS_HASH_CONTEXT}:${normalized}`;
    return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}
