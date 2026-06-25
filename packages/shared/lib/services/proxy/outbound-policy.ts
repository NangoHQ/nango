import { resolvePolicyForServer } from '@nangohq/egress';

import { envs } from '../../env.js';

import type { OutboundUrlPolicy } from '@nangohq/egress';

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
