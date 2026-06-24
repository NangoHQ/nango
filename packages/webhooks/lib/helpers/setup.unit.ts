import http from 'node:http';
import https from 'node:https';

import { createWebhookOutbound } from '../utils.js';

import type { WebhookOutbound } from '../utils.js';
import type { OutboundUrlPolicy } from '@nangohq/egress';

const permissivePolicy: OutboundUrlPolicy = {
    mode: 'permissive',
    denylist: new Set(),
    allowlist: [],
    blockPrivateIps: false,
    blockLinkLocal: false,
    resolveDns: false,
    allowedSchemes: new Set(['http:', 'https:']),
    maxRedirects: 5
};

/**
 * Outbound transport for `deliver` tests that hit a loopback test server. The real env-derived policy +
 * DNS-pinning agents always block loopback, so these tests pass this permissive transport (plain
 * keep-alive agents, no resolved-address validation) to `deliver` via its `outbound` arg.
 */
export function allowAllWebhookOutbound(): WebhookOutbound {
    return createWebhookOutbound({
        policy: permissivePolicy,
        agents: { httpAgent: new http.Agent({ keepAlive: true }), httpsAgent: new https.Agent({ keepAlive: true }) }
    });
}
