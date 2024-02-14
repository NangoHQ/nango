import tracer from 'dd-trace';

tracer.init({
    service: 'nango'
});
tracer.use('pg', {
    service: 'nango-postgres'
});
tracer.use('express');

export default tracer;
