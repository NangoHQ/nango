import { useNavigate, useParams } from 'react-router-dom';
import EndpointLabel from './EndpointLabel';
import { Flow, FlowEndpoint, IntegrationConfig } from '../../../types';
import FlowCard from './FlowCard';
import { parseEndpoint } from '../../../utils/utils';

export interface EndpointRowProps {
    flow: Flow;
    integration: IntegrationConfig | null;
    endpoint: string | FlowEndpoint;
}

export default function EndpointRow({ flow, endpoint, integration }: EndpointRowProps) {
    const navigate = useNavigate();
    const endpointRoute = parseEndpoint(endpoint);
    const { env } = useParams();

    return (
        <td className="flex items-center p-3 py-2.5 justify-between border-b border-border-gray hover:bg-hover-gray cursor-pointer" onClick={() => navigate(`/${env}/integration/${integration?.unique_key}/reference${endpointRoute}`)}>
            <div className="flex items-center w-48">
                <EndpointLabel endpoint={endpoint} type={flow.type} />
            </div>
            <div className="flex items-center ml-3">
                <div className="text-gray-400 w-64 max-w-3xl truncate">{flow.description}</div>
            </div>
            <div className="flex flex-end ml-16 relative group hover:bg-neutral-800 rounded p-2">
                {Boolean('version' in flow && flow.version !== null) ? (
                    <div className="w-2 h-2 bg-green-500 rounded-full cursor-pointer"></div>
                ) : (
                    <div className="w-2 h-2 bg-pink-600 rounded-full cursor-pointer"></div>
                )}
                <div className="hidden group-hover:block text-white absolute z-10 top-10 -left-24 bg-neutral-800 rounded border border-neutral-700 w-56">
                    <FlowCard flow={flow} />
                </div>
            </div>
        </td>
    );
}
