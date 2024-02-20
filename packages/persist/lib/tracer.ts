import tracer from 'dd-trace';

tracer.init({
    service: 'nango-persist'
});
tracer.use('pg', {
    service: 'nango-postgres'
});
tracer.use('express');

export default tracer;
