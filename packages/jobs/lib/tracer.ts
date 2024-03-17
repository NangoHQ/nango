import tracer from 'dd-trace';

tracer.init({
    service: 'nango-jobs'
});
tracer.use('pg', {
    service: 'nango-postgres'
});
