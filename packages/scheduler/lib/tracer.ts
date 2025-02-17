import tracer from 'dd-trace';

tracer.init({
    service: 'nango-scheduler',
    spanSamplingRules: [{ name: 'scheduler.scheduling.schedule', sampleRate: 0.05 }]
});
tracer.use('pg', {
    service: (params: { database: string }) => `postgres-${params.database}`
});
tracer.use('dns', {
    enabled: false
});
