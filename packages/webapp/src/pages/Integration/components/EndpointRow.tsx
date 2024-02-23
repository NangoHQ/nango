import EndpointLabel from './EndpointLabel';
import { Flow, FlowEndpoint, IntegrationConfig } from '../../../types';
import FlowCard from './FlowCard';
import { SubTabs } from '../Show';

export interface EndpointRowProps {
    flow: Flow;
    integration: IntegrationConfig | null;
    endpoint: string | FlowEndpoint;
    setSubTab: (tab: SubTabs) => void;
    setFlow: (flow: Flow) => void;
}

export default function EndpointRow({ flow, endpoint, setSubTab, setFlow }: EndpointRowProps) {

    const routeToReference = () => {
        setFlow(flow)
        setSubTab(SubTabs.Reference);
    };

    return (
        <td className="flex items-center p-3 py-2.5 border-b border-border-gray hover:bg-hover-gray cursor-pointer" onClick={routeToReference}>
            <div className="flex items-center w-80">
                <EndpointLabel endpoint={endpoint} type={flow.type} />
            </div>
            <div className="flex items-center">
                <div className="text-gray-400 ml-12 w-[36rem] truncate">{flow.description}</div>
            </div>
            <div className="flex flex-end relative group hover:bg-neutral-800 rounded p-2 ml-12">
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
