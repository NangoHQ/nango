import tracer from 'dd-trace';

tracer.init({
    service: 'nango-self-hosting'
});
tracer.use('pg', {
    service: (params: { database: string }) => `postgres-${params.database}`
});
tracer.use('express');
tracer.use('dns', { enabled: false });
