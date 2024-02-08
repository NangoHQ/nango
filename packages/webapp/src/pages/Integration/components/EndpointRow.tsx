import { BoltIcon } from '@heroicons/react/24/outline';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowPathRoundedSquareIcon } from '@heroicons/react/24/outline';
import EndpointLabel from './EndpointLabel';
import { Flow, FlowEndpoint, IntegrationConfig } from '../../../types';
import FlowCard from './FlowCard';
import { parseEndpoint } from '../../../utils/utils';

export interface EndpointRowProps {
    flow: Flow;
    integration: IntegrationConfig | null;
    endpoint: string | FlowEndpoint;
    source: 'Public' | 'Custom';
}

export default function EndpointRow({ flow, endpoint, source, integration }: EndpointRowProps) {
    const navigate = useNavigate();
    const endpointRoute = parseEndpoint(endpoint);
    const { env } = useParams();

    return (
        <td className="flex items-center p-3 py-4 justify-between border-b border-border-gray hover:bg-hover-gray cursor-pointer" onClick={() => navigate(`/${env}/integration/${integration?.unique_key}/reference${endpointRoute}`)}>
            <div className="flex items-center w-48">
                <EndpointLabel endpoint={endpoint} type={flow.type} />
            </div>
            <div className="flex items-center ml-3">
                <div className="text-gray-400 w-64 max-w-3xl truncate">{flow.description}</div>
            </div>
            <div className="w-48 ml-3">
                <div className="w-48 text-gray-400">
                    {source}
                </div>
            </div>
            <div className="flex flex-end ml-16 relative group hover:bg-neutral-800 rounded p-2">
                {flow?.type === 'sync' && (
                    <ArrowPathRoundedSquareIcon className="flex h-5 w-5 text-gray-400 cursor-pointer" />
                )}
                {flow?.type === 'action' && (
                    <BoltIcon className="flex h-5 w-5 text-gray-400 cursor-pointer" />
                )}
                <div className="hidden group-hover:block text-white absolute z-10 top-10 -left-24 bg-neutral-800 rounded border border-neutral-700 w-56">
                    <FlowCard flow={flow} />
                </div>
            </div>
        </td>
    );
}
