import type { ApiEndpoint, ApiError } from '../api.js';

/** Browser-reported CMP state, not a server assertion that consent was obtained. */
export interface AdvertisingConsentChoice {
    preferences: boolean;
    statistics: boolean;
    marketing: boolean;
    method: 'explicit' | 'implied' | null;
    regulations: { gdprApplies: boolean | null; lgpdApplies: boolean | null; ccpaApplies: boolean | null };
    globalPrivacyControl: boolean;
}

export interface AdvertisingClickIds {
    gclid?: string | undefined;
    gbraid?: string | undefined;
    wbraid?: string | undefined;
    fbclid?: string | undefined;
    msclkid?: string | undefined;
}

/** Separate ad touches. Google identifiers from different visits are never merged. */
export interface SignupAdvertisingContext {
    google?: { ids: Pick<AdvertisingClickIds, 'gclid' | 'gbraid' | 'wbraid'>; observedAt: string; source: 'landing_query' };
    meta?: { fbclid: string; observedAt: string; source: 'landing_query' };
    microsoft?: { msclkid: string; observedAt: string; source: 'landing_query' };
}

export interface SignupAdvertisingPermission {
    context: SignupAdvertisingContext;
    signupAt: Date;
    consent: {
        choice: AdvertisingConsentChoice;
        revision: number;
        observedAt: Date;
        source: 'cookiebot';
        mappingVersion: 'cookiebot-regional-marketing-v2';
        basis: 'explicit' | 'regional_default';
        adStorage: 'granted';
        adUserData: 'granted';
        adPersonalization: 'granted';
    };
}

/** Internal only. Never accepted from signup request bodies or OAuth state. */
export interface SignupConsentReference {
    id: string;
    revision: number;
    signupId: string;
}

export type GetAdvertisingConsent = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/advertising-consent';
    Success: { data: { revision: number | null } };
}>;

export type PostAdvertisingConsent = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'POST';
    Path: '/api/v1/advertising-consent';
    Body: { choice: AdvertisingConsentChoice; expectedRevision: number | null; clickIds?: AdvertisingClickIds };
    Success: { data: { revision: number } };
    Error: ApiError<'conflict'>;
}>;
