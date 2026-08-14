import helmet from 'helmet';

import { basePublicUrl, baseUrl, connectUrl, connectUrlAsDocumentBase, dashboardApiUrl } from '@nangohq/utils';

import type { RequestHandler } from 'express';

// CSP path matching: no trailing slash = exact match (URL older SDKs load), with = prefix match (assets/routes).
const connectUrlCspSources = [...new Set([connectUrl, connectUrlAsDocumentBase().toString()])];

function websocketOrigin(url: string): string {
    const parsed = new URL(url);
    parsed.protocol = url.startsWith('https') ? 'wss' : 'ws';
    return parsed.href;
}

export function securityMiddlewares(): RequestHandler[] {
    const hostPublic = basePublicUrl;
    const hostApi = baseUrl;
    const hostWs = websocketOrigin(hostApi);
    // `/` means same-origin dashboard fetches; `'self'` already covers that.
    // An absolute dashboard host may differ from the public API one (Set dedups when they match).
    const apiCspSources = dashboardApiUrl === '/' ? [hostApi] : [...new Set([hostApi, dashboardApiUrl])];
    const apiWsCspSources = dashboardApiUrl === '/' ? [hostWs] : [...new Set([hostWs, websocketOrigin(dashboardApiUrl)])];
    const reportOnly = process.env['CSP_REPORT_ONLY'];

    return [
        helmet.xssFilter(),
        helmet.noSniff(),
        helmet.ieNoOpen(),
        helmet.frameguard({ action: 'sameorigin' }),
        helmet.dnsPrefetchControl(),
        helmet.hsts({
            maxAge: 5184000
        }),
        // == "Content-Security-Policy"
        helmet.contentSecurityPolicy({
            reportOnly: reportOnly !== 'false',
            directives: {
                defaultSrc: ["'self'", hostPublic, ...apiCspSources, ...connectUrlCspSources],
                childSrc: "'self'",
                connectSrc: [
                    "'self'",
                    'https://*.google-analytics.com',
                    'https://*.sentry.io',
                    hostPublic,
                    ...apiCspSources,
                    ...apiWsCspSources,
                    ...connectUrlCspSources,
                    'https://*.posthog.com',
                    'https://*.stripe.com',
                    'https://*.plain.com',
                    'wss://*.plain.com',
                    'https://raw.githubusercontent.com'
                ],
                fontSrc: ["'self'", 'data:', 'https://*.googleapis.com', 'https://*.gstatic.com', 'https://*.cdn-plain.com'],
                frameSrc: [
                    "'self'",
                    'https://accounts.google.com',
                    hostPublic,
                    hostApi,
                    ...connectUrlCspSources,
                    'https://www.youtube.com',
                    'https://*.stripe.com'
                ],
                imgSrc: [
                    "'self'",
                    'data:',
                    'blob:',
                    hostPublic,
                    hostApi,
                    'https://*.google-analytics.com',
                    'https://*.googleapis.com',
                    'https://*.posthog.com',
                    'https://img.logo.dev',
                    'https://*.ytimg.com',
                    'https://*.plain.com'
                ],
                manifestSrc: "'self'",
                mediaSrc: "'self'",
                objectSrc: "'self'",
                scriptSrc: [
                    "'self'",
                    "'unsafe-eval'",
                    "'unsafe-inline'",
                    hostPublic,
                    hostApi,
                    'https://*.stripe.com',
                    'https://*.google-analytics.com',
                    'https://*.googleapis.com',
                    'https://apis.google.com',
                    'https://*.posthog.com',
                    'https://www.youtube.com',
                    'https://*.cdn-plain.com'
                ],
                styleSrc: ['blob:', "'self'", "'unsafe-inline'", 'https://*.googleapis.com', hostPublic, hostApi],
                workerSrc: ['blob:', "'self'", hostPublic, hostApi, 'https://*.googleapis.com', 'https://*.posthog.com']
            }
        })
    ];
}
