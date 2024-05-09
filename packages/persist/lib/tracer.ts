import tracer from 'dd-trace';

tracer.init({
    service: 'nango-persist'
});
tracer.use('pg', {
    service: (params: { database: string }) => `postgres-${params.database}`
});
tracer.use('opensearch', {
    service: 'nango-opensearch'
});
tracer.use('express');
