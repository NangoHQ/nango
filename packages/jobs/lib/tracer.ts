import tracer from 'dd-trace';

tracer.init({
    service: 'nango-jobs'
});
tracer.use('pg', {
    service: (params: { database: string }) => `postgres-${params.database}`
});
tracer.use('opensearch', {
    service: 'nango-opensearch'
});
