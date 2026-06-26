import { assertSafeOutboundUrl, getSafeHttpAgents, getSafeUndiciDispatcher, resolvePolicyForOAuth, resolvePolicyForServer } from '@nangohq/egress';

import { envs } from '../../env.js';

import type { OutboundUrlPolicy, ValidateOutboundUrlContext } from '@nangohq/egress';
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

export function getOAuthSafeUndiciDispatcher(connectOverrides?: buildConnector.BuildOptions): UndiciAgent {
    return getSafeUndiciDispatcher(getOAuthOutboundUrlPolicy(), connectOverrides);
}
