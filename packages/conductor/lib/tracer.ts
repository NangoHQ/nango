import tracer from 'dd-trace';

tracer.init({
    service: 'nango-conductor'
});
tracer.use('pg', {
    service: (params: { database: string }) => `postgres-${params.database}`
});
tracer.use('express');
