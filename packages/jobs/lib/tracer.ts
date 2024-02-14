import tracer from 'dd-trace';
import { isCloud } from '@nangohq/shared';

if (isCloud()) {
    tracer.init({
        service: 'nango-jobs'
    });
    tracer.use('pg', {
        service: 'nango-postgres'
    });
}

export default tracer;
