import helmet from 'helmet';

import { basePublicUrl, baseUrl, connectUrlAsDocumentBase } from '@nangohq/utils';

import type { RequestHandler } from 'express';

// CSP path matching is exact without a trailing slash ("/nango/connect" would not match
// "/nango/connect/assets/…"), so use the trailing-slash-normalized form as a prefix source.
const connectUrlCspSource = connectUrlAsDocumentBase().toString();

export function securityMiddlewares(): RequestHandler[] {
    const hostPublic = basePublicUrl;
    const hostApi = baseUrl;
    const hostWs = new URL(hostApi);
    hostWs.protocol = hostApi.startsWith('https') ? 'wss' : 'ws';
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
                defaultSrc: ["'self'", hostPublic, hostApi, connectUrlCspSource],
                childSrc: "'self'",
                connectSrc: [
                    "'self'",
                    'https://*.google-analytics.com',
                    'https://*.sentry.io',
                    hostPublic,
                    hostApi,
                    hostWs.href,
                    connectUrlCspSource,
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
                    connectUrlCspSource,
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
