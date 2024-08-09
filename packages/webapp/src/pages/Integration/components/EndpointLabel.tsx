import type { HTTP_VERB } from '@nangohq/types';
import { HttpLabel } from '../../../components/HttpLabel';
import type { FlowEndpoint } from '../../../types';

export default function EndpointLabel({ type, endpoint }: { type: string; endpoint: string | FlowEndpoint }) {
    if (typeof endpoint === 'object') {
        const [verb, path] = Object.entries(endpoint)[0];
        return <HttpLabel verb={verb as HTTP_VERB} path={path} />;
    }

    const split = (endpoint as unknown as string)?.split(' ');
    if (type === 'sync') {
        return <HttpLabel verb={'GET'} path={split[1]} />;
    }

    return <HttpLabel verb={'POST'} path={split[1]} />;
}
