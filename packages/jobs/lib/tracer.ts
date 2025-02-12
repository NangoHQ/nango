import tracer from 'dd-trace';

tracer.init({
    service: 'nango-jobs',
    samplingRules: [
        { service: 'jobs-net', sampleRate: 0.1, name: '*' },
        { service: 'nango-elasticsearch', sampleRate: 0.1, name: '*' },
        { service: 'nango-redis', sampleRate: 0.1, name: '*' }
    ]
});
tracer.use('pg', {
    service: (params: { database: string }) => `postgres-${params.database}`
});
tracer.use('express', {
    enabled: true
});
tracer.use('elasticsearch', {
    service: 'nango-elasticsearch'
});
tracer.use('net', {
    enabled: true,
    service: 'jobs-net'
});
tracer.use('dns', {
    enabled: false
});
