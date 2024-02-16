import ddTrace from 'dd-trace';

ddTrace.init({
    service: 'nango-runner'
});
ddTrace
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

export const tracer = ddTrace;
