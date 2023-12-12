import tracer from 'dd-trace';
import { isCloud } from '@nangohq/shared';
if (isCloud()) {
    tracer.init({
        service: 'nango-jobs'
    });
}

export default tracer;
