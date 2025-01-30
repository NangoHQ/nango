import tracer from 'dd-trace';

tracer.init({
    service: 'nango-persist'
});
tracer.use('pg', {
    service: (params: { database: string }) => `postgres-${params.database}`
});
tracer.use('elasticsearch', {
    service: 'nango-elasticsearch'
});
tracer.use('express');
tracer.use('dns', {
    enabled: true
});
