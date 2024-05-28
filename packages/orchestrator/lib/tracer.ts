import tracer from 'dd-trace';

tracer.init({
    service: 'nango-orchestrator'
});
tracer.use('pg', {
    service: (params: { database: string }) => `postgres-${params.database}`
});
tracer.use('express');
