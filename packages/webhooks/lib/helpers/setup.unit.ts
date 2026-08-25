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
    allowedSchemes: new Set(['http:', 'https:']),
    maxRedirects: 5
};

export function allowAllWebhookOutbound(): WebhookOutbound {
    return createWebhookOutbound({
        policy: permissivePolicy,
        agents: { httpAgent: new http.Agent({ keepAlive: true }), httpsAgent: new https.Agent({ keepAlive: true }) }
    });
}
