import {
    absoluteUrlFromRedirectRequestOptions,
    assertSafeOutboundUrl,
    createRedirectValidator,
    getSafeHttpAgents,
    getSafeUndiciDispatcher,
    resolvePolicyForOAuth,
    resolvePolicyForServer
} from '@nangohq/egress';

import { envs } from '../../env.js';

import type { OutboundUrlPolicy, ValidateOutboundUrlContext } from '@nangohq/egress';
import type { AxiosRequestConfig } from 'axios';
import type http from 'node:http';
import type https from 'node:https';
import type { buildConnector, Agent as UndiciAgent } from 'undici';

export {
    OutboundUrlError,
    findOutboundUrlError,
    resolvePolicyForServer,
    resolvePolicyForRunner,
    resolvePolicyForRunnerSync,
    getRunnerPolicyFromEnv,
    resolvePolicyForOAuth,
    isOutboundUrlAllowed,
    validateOutboundUrlSync,
    assertSafeOutboundUrlSync
} from '@nangohq/egress';
export type { OutboundUrlPolicy, OutboundUrlPolicyMode, OutboundUrlPolicyRaw } from '@nangohq/egress';

let memoizedServerPolicy: OutboundUrlPolicy | null = null;

export function getServerOutboundUrlPolicy(): OutboundUrlPolicy {
    if (memoizedServerPolicy) {
        return memoizedServerPolicy;
    }
    memoizedServerPolicy = resolvePolicyForServer({
        proxyBaseUrlOverrideDenylist: envs.NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST,
        outboundUrlPolicy: envs.NANGO_OUTBOUND_URL_POLICY
    });
    return memoizedServerPolicy;
}

export function resetServerOutboundUrlPolicyForTests(): void {
    memoizedServerPolicy = null;
}

let memoizedOAuthPolicy: OutboundUrlPolicy | null = null;

export function getOAuthOutboundUrlPolicy(): OutboundUrlPolicy {
    if (memoizedOAuthPolicy) {
        return memoizedOAuthPolicy;
    }
    memoizedOAuthPolicy = resolvePolicyForOAuth({
        proxyBaseUrlOverrideDenylist: envs.NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST,
        outboundUrlPolicy: envs.NANGO_OUTBOUND_URL_POLICY,
        outboundUrlPolicyOAuth: envs.NANGO_OUTBOUND_URL_POLICY_OAUTH
    });
    return memoizedOAuthPolicy;
}

export function resetOAuthOutboundUrlPolicyForTests(): void {
    memoizedOAuthPolicy = null;
}

export async function assertSafeOAuthUrl(url: string, ctx?: ValidateOutboundUrlContext): Promise<URL> {
    return assertSafeOutboundUrl(url, getOAuthOutboundUrlPolicy(), { context: 'oauth', ...ctx });
}

export function getOAuthSafeHttpAgents(): { httpAgent: http.Agent; httpsAgent: https.Agent } {
    return getSafeHttpAgents(getOAuthOutboundUrlPolicy());
}

/** Headers that may be retained on OAuth token redirects; everything else is treated as credential material. */
const SAFE_OAUTH_REDIRECT_HEADERS = new Set(['accept', 'accept-encoding', 'content-type', 'user-agent']);

function isSameOriginOAuthRedirect(redirectOptions: Record<string, unknown>, requestDetails: { url?: string } | undefined): boolean {
    if (!requestDetails?.url) {
        return false;
    }
    const absolute = absoluteUrlFromRedirectRequestOptions(redirectOptions);
    if (!absolute) {
        return false;
    }
    try {
        return new URL(requestDetails.url).origin === new URL(absolute).origin;
    } catch {
        return false;
    }
}

function stripUnsafeOAuthRedirectHeaders(headers: Record<string, unknown> | undefined): void {
    if (!headers) {
        return;
    }
    for (const key of Object.keys(headers)) {
        if (!SAFE_OAUTH_REDIRECT_HEADERS.has(key.toLowerCase())) {
            delete headers[key];
        }
    }
}

/**
 * Axios request options for OAuth token egress: pinned agents, policy maxRedirects,
 * and sync validation of each redirect hop (IP literals / denied hosts).
 * DNS rebinding on redirect hostnames is still caught by the safe agent lookup.
 *
 * Credential header forwarding is opt-in for the proxy and never enabled here. follow-redirects
 * only strips Authorization/Cookie; this also drops caller-defined API-key headers on cross-origin hops.
 */
export function getOAuthAxiosRequestConfig(): Pick<AxiosRequestConfig, 'httpAgent' | 'httpsAgent' | 'maxRedirects' | 'beforeRedirect'> {
    const policy = getOAuthOutboundUrlPolicy();
    const agents = getSafeHttpAgents(policy);
    const redirectValidator = createRedirectValidator(policy);

    return {
        httpAgent: agents.httpAgent,
        httpsAgent: agents.httpsAgent,
        maxRedirects: policy.maxRedirects,
        beforeRedirect: (options, _responseDetails, requestDetails) => {
            const absolute = absoluteUrlFromRedirectRequestOptions(options);
            // Block redirect hops to blocked IP literals / denied hosts; hostname rebinding is caught by the safe agent.
            if (absolute) {
                redirectValidator(absolute);
            }
            if (!isSameOriginOAuthRedirect(options, requestDetails)) {
                stripUnsafeOAuthRedirectHeaders(options['headers'] as Record<string, unknown> | undefined);
            }
        }
    };
}

export function getOAuthSafeUndiciDispatcher(connectOverrides?: buildConnector.BuildOptions): UndiciAgent {
    return getSafeUndiciDispatcher(getOAuthOutboundUrlPolicy(), connectOverrides);
}
