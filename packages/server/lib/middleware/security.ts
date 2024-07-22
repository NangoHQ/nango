import type { Router } from 'express';
import helmet from 'helmet';

export function securityMiddleware(app: Router): void {
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
            reportOnly: false,
            directives: {
                defaultSrc: ["'self'", '*.nango.dev'],
                childSrc: "'self'",
                connectSrc: ["'self'", 'https://*.google-analytics.com', 'https://sentry.io', 'https://*.nango.dev', 'https://*.posthog.com'],
                fontSrc: ["'self'", 'https://*.googleapis.com', 'https://*.gstatic.com'],
                frameSrc: ["'self'", 'https://accounts.google.com'],
                imgSrc: ["'self'", 'data:', 'https://*.nango.dev', 'https://*.google-analytics.com', 'https://*.googleapis.com', 'https://*.posthog.com'],
                manifestSrc: "'self'",
                mediaSrc: "'self'",
                objectSrc: "'self'",
                scriptSrc: [
                    "'self'",
                    "'unsafe-eval'",
                    "'unsafe-inline'",
                    'https://*.nango.dev',
                    'https://*.google-analytics.com',
                    'https://*.googleapis.com',
                    'https://apis.google.com',
                    'https://*.posthog.com'
                ],
                styleSrc: ['blob:', "'self'", "'unsafe-inline'", 'https://*.googleapis.com', 'https://*.nango.dev'],
                workerSrc: ['blob:', "'self'", 'https://*.nango.dev', 'https://*.googleapis.com', 'https://*.posthog.com']
            }
        })
    );
}
