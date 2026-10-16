import db from '@nangohq/database';
import { getSignupAdvertisingPermission } from '@nangohq/shared';

import { conversionEventId, isProductionSignup } from './worker.js';

export interface EligibilityRequest {
    accountId: number;
    creatorId: number;
    platform: 'meta' | 'chatgpt';
}

/** Read-only snapshot, not a delivery reservation. Every delivery attempt must check again.
 * Authenticates the stored signup relationship, not the original browser's CMP or click claims.
 */
export async function getConversionEligibility(input: EligibilityRequest, startAt: Date) {
    if (!Number.isFinite(startAt.getTime())) return { eligible: false as const };
    const signup = await db
        .knex('signup_advertising_consents')
        .where({ account_id: input.accountId, creator_user_id: input.creatorId })
        .select('account_id')
        .first<{ account_id: number }>()
        .timeout(2000, { cancel: true });
    if (!signup) return { eligible: false as const };

    // Never use event properties as consent, click context, or the account creation time.
    const permission = await getSignupAdvertisingPermission(input.accountId);
    if (!permission || permission.signupAt < startAt || !isProductionSignup(permission)) return { eligible: false as const };
    const touch = permission.context[input.platform];
    const { sourceUrl, userAgent } = permission.context.browser ?? {};
    if (!touch || !sourceUrl || !userAgent) return { eligible: false as const };
    const observedAt = Date.parse(touch.observedAt);
    if (!Number.isFinite(observedAt) || observedAt > permission.signupAt.getTime() || Date.now() - observedAt >= 90 * 86_400_000) {
        return { eligible: false as const };
    }
    return {
        eligible: true as const,
        platform: input.platform,
        eventId: conversionEventId(input.accountId),
        signupAt: permission.signupAt.toISOString(),
        sourceUrl,
        userAgent,
        touch,
        consentRevision: permission.consent.revision
    };
}
