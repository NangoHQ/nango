import tracer from 'dd-trace';

tracer.init({
    service: 'nango-jobs'
});
tracer.use('pg', {
    service: (params: { database: string }) => `postgres-${params.database}`
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
