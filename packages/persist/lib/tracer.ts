import tracer from 'dd-trace';
import { isCloud } from '@nangohq/shared';

if (isCloud()) {
    tracer.init({
        service: 'nango-persist'
    });
    tracer.use('pg', {
        service: 'nango-postgres'
    });
    tracer.use('express');
}

export default tracer;
