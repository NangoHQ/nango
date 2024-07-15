import tracer from 'dd-trace';

tracer.init({
    service: 'nango'
});
tracer.use('pg', {
    service: (params: { database: string }) => `postgres-${params.database}`
});
tracer.use('elasticsearch', {
    service: 'nango-elasticsearch'
});
tracer.use('express');
tracer.use('http', {
    blocklist: ['/health', '/favicon.ico', '/logo-dark.svg', '/logo-text.svg', /^\/static\//, /^\/images\//, '/manifest.json']
});
tracer.use('net', {
    enabled: true,
    service: 'server-net'
});
tracer.use('dns', {
    enabled: false
});
