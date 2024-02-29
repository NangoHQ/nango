import tracer from 'dd-trace';

tracer.init({
    service: 'nango-runner'
});
tracer
    .use('pg', {
        enabled: false
    })
    .use('express', {
        enabled: false
    })
    .use('http', {
        enabled: false
    })
    .use('dns', {
        enabled: false
    })
    .use('net', {
        enabled: false
    });
