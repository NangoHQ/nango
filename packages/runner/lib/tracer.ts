import tracer from 'dd-trace';

tracer.init({
    service: 'nango-runner',
    samplingRules: [{ service: 'runner-net', sampleRate: 0.1, name: '*' }]
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
        enabled: true,
        service: 'runner-net'
    });
