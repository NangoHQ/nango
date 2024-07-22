import { basePublicUrl } from '@nangohq/utils';
import type { Router } from 'express';
import helmet from 'helmet';

export function securityMiddleware(app: Router): void {
    const host = basePublicUrl;
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
                defaultSrc: ["'self'", host],
                childSrc: "'self'",
                connectSrc: ["'self'", 'https://*.google-analytics.com', 'https://*.sentry.io', host, 'https://*.posthog.com'],
                fontSrc: ["'self'", 'https://*.googleapis.com', 'https://*.gstatic.com'],
                frameSrc: ["'self'", 'https://accounts.google.com'],
                imgSrc: ["'self'", 'data:', host, 'https://*.google-analytics.com', 'https://*.googleapis.com', 'https://*.posthog.com'],
                manifestSrc: "'self'",
                mediaSrc: "'self'",
                objectSrc: "'self'",
                scriptSrc: [
                    "'self'",
                    "'unsafe-eval'",
                    "'unsafe-inline'",
                    host,
                    'https://*.google-analytics.com',
                    'https://*.googleapis.com',
                    'https://apis.google.com',
                    'https://*.posthog.com'
                ],
                styleSrc: ['blob:', "'self'", "'unsafe-inline'", 'https://*.googleapis.com', host],
                workerSrc: ['blob:', "'self'", host, 'https://*.googleapis.com', 'https://*.posthog.com']
            }
        })
    );
}
