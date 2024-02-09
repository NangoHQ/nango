import tracer from 'dd-trace';

tracer.init({
    service: 'nango'
});

tracer.use('express');

export default tracer;
