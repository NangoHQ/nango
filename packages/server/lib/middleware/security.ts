import { basePublicUrl, baseUrl } from '@nangohq/utils';
import type { Router } from 'express';
import helmet from 'helmet';

export function securityMiddleware(app: Router): void {
    const hostPublic = basePublicUrl;
    const hostApi = baseUrl;
    const reportOnly = process.env['CSP_REPORT_ONLY'];

    app.use(helmet.xssFilter());
    app.use(helmet.noSniff());
    app.use(helmet.ieNoOpen());
    app.use(helmet.frameguard({ action: 'sameorigin' }));
    app.use(helmet.dnsPrefetchControl());
    app.use(
        helmet.hsts({
            maxAge: 5184000
        })
    );

    app.use(
        // == "Content-Security-Policy"
        helmet.contentSecurityPolicy({
            reportOnly: reportOnly === 'true' || typeof reportOnly === 'undefined',
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
    );
}
