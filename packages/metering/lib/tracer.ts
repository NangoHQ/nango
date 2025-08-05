import tracer from 'dd-trace';

tracer.init({
    service: 'nango-metering'
});
tracer.use('pg', {
    service: (params: { database: string }) => `postgres-${params.database}`
});
tracer.use('dns', { enabled: false });
