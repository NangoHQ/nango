import tracer from 'dd-trace';

import { oauthTelemetryPath } from './oauth/telemetry.js';

tracer.init({
    service: 'nango',
    clientIpEnabled: true,
    clientIpHeader: 'x-forwarded-for',
    samplingRules: [
        { service: 'server-net', sampleRate: 0.01, name: '*' },
        { service: 'nango-elasticsearch', sampleRate: 0.1, name: '*' },
        { service: 'nango-redis', sampleRate: 0.1, name: '*' }
    ]
});
tracer.use('pg', {
    service: (params: { database: string }) => `postgres-${params.database}`
});
tracer.use('elasticsearch', {
    service: 'nango-elasticsearch'
});
tracer.use('express');
tracer.use('http', {
    headers: ['x-forwarded-for'],
    hooks: {
        request: (span, req) => {
            const path = req && 'url' in req && req.url ? oauthTelemetryPath(req.url) : undefined;
            if (!span || !path) return;
            span.setTag('http.url', path);
            span.setTag('http.query.string', '');
            span.setTag('http.target', path);
            span.setTag('resource.name', `${req?.method ?? 'HTTP'} ${path}`);
        }
    },
    blocklist: ['/health', '/favicon.ico', '/logo-dark.svg', '/logo-text.svg', /^\/static\//, /^\/images\//, '/manifest.json']
});
tracer.use('net', {
    enabled: true,
    service: 'server-net'
});
tracer.use('dns', {
    enabled: false
});
