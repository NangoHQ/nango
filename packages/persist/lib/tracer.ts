import tracer from 'dd-trace';

tracer.init({
    service: 'nango-persist',
    samplingRules: [
        { service: 'persist-net', sampleRate: 0.1, name: '*' },
        { service: 'nango-elasticsearch', sampleRate: 0.1, name: '*' }
    ]
});
tracer.use('pg', {
    service: (params: { database: string }) => `postgres-${params.database}`
});
tracer.use('elasticsearch', {
    service: 'nango-elasticsearch'
});
tracer.use('express');
tracer.use('net', {
    enabled: true,
    service: 'persist-net'
});
tracer.use('dns', {
    enabled: false
});
