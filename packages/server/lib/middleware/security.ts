import { basePublicUrl, baseUrl } from '@nangohq/utils';
import type { RequestHandler } from 'express';
import helmet from 'helmet';

export function securityMiddlewares(): RequestHandler[] {
    const hostPublic = basePublicUrl;
    const hostApi = baseUrl;
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
                defaultSrc: ["'self'", hostPublic, hostApi],
                childSrc: "'self'",
                connectSrc: ["'self'", 'https://*.google-analytics.com', 'https://*.sentry.io', hostPublic, hostApi, 'https://*.posthog.com'],
                fontSrc: ["'self'", 'https://*.googleapis.com', 'https://*.gstatic.com'],
                frameSrc: ["'self'", 'https://accounts.google.com'],
                imgSrc: ["'self'", 'data:', hostPublic, hostApi, 'https://*.google-analytics.com', 'https://*.googleapis.com', 'https://*.posthog.com'],
                manifestSrc: "'self'",
                mediaSrc: "'self'",
                objectSrc: "'self'",
                scriptSrc: [
                    "'self'",
                    "'unsafe-eval'",
                    "'unsafe-inline'",
                    hostPublic,
                    hostApi,
                    'https://*.google-analytics.com',
                    'https://*.googleapis.com',
                    'https://apis.google.com',
                    'https://*.posthog.com'
                ],
                styleSrc: ['blob:', "'self'", "'unsafe-inline'", 'https://*.googleapis.com', hostPublic, hostApi],
                workerSrc: ['blob:', "'self'", hostPublic, hostApi, 'https://*.googleapis.com', 'https://*.posthog.com']
            }
        })
    ];
}
