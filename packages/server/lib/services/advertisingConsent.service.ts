import { randomBytes, randomUUID } from 'node:crypto';

import { consentOwnerHash, readAdvertisingConsent } from '@nangohq/shared';
import { isLocal } from '@nangohq/utils';

import { envs } from '../env.js';

import type { SignupConsentReference } from '@nangohq/types';
import type { Request } from 'express';

export const advertisingConsentCookie = isLocal ? 'nango_ad_consent_local' : '__Host-nango_ad_consent';

export function advertisingConsentConfig(): { origins: string[]; lifetimeMs: number } | null {
    if (!envs.ADVERTISING_CONSENT_ENABLED || !envs.ADVERTISING_CONSENT_LIFETIME_DAYS) return null;
    const origins = envs.ADVERTISING_CONSENT_ORIGINS.split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (
        !origins.length ||
        origins.some((origin) => {
            try {
                const url = new URL(origin);
                return url.origin !== origin || (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:' && url.hostname === 'localhost'));
            } catch {
                return true;
            }
        })
    )
        return null;
    return { origins, lifetimeMs: envs.ADVERTISING_CONSENT_LIFETIME_DAYS * 86400000 };
}

export function readConsentOwner(req: Request): string | undefined {
    const token: unknown = req.cookies?.[advertisingConsentCookie];
    return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}

export async function signupConsentFromRequest(req: Request): Promise<SignupConsentReference | undefined> {
    if (!advertisingConsentConfig()) return undefined;
    const owner = readConsentOwner(req);
    if (!owner) return undefined;
    try {
        const consent = await readAdvertisingConsent(consentOwnerHash(owner));
        if (consent && !consent.invalidated_at && consent.expires_at > new Date())
            return { id: consent.id, revision: consent.revision, signupId: randomUUID() };
    } catch {
        /* Optional tracking must never block signup. */
    }
    return undefined;
}

/** Bind Google's optional continuation to this server session, not to client-supplied consent. */
export async function prepareManagedSignupConsent(req: Request): Promise<string | undefined> {
    const reference = await signupConsentFromRequest(req);
    if (!reference) return undefined;
    const now = Date.now();
    const pending = Object.fromEntries(
        Object.entries(req.session.advertisingConsentContinuations ?? {})
            .filter(([, value]) => value.expiresAt > now)
            .slice(-3)
    );
    const nonce = randomBytes(32).toString('hex');
    pending[nonce] = { reference, expiresAt: now + 30 * 60 * 1000 };
    req.session.advertisingConsentContinuations = pending;
    try {
        await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(new Error('Consent continuation unavailable')) : resolve())));
        return nonce;
    } catch {
        delete pending[nonce];
        return undefined;
    }
}

export async function consumeManagedSignupConsent(req: Request, nonce: string | undefined): Promise<SignupConsentReference | undefined> {
    if (!nonce || !advertisingConsentConfig()) return undefined;
    const continuations = req.session.advertisingConsentContinuations;
    const pending = continuations?.[nonce];
    if (!pending || !continuations) return undefined;
    delete continuations[nonce];
    try {
        await new Promise<void>((resolve, reject) => req.session.save((err) => (err ? reject(new Error('Consent continuation unavailable')) : resolve())));
        if (pending.expiresAt > Date.now()) return pending.reference;
    } catch {
        /* No saved continuation means no permission to attach it. */
    }
    return undefined;
}
