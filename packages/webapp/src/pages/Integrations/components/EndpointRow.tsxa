import EndpointLabel from './EndpointLabel';
import type { Flow, FlowEndpoint, IntegrationConfig } from '../../../types';
import FlowCard from './FlowCard';
import { SubTabs } from '../Show';
import * as Table from '../../../components/ui/Table';
import { cn } from '../../../utils/utils';

export interface EndpointRowProps {
    flow: Flow;
    integration: IntegrationConfig | null;
    endpoint: string | FlowEndpoint;
    setSubTab: (tab: SubTabs) => void;
    setFlow: (flow: Flow) => void;
    setEndpoint: (endpoint: FlowEndpoint | string) => void;
}

export default function EndpointRow({ flow, endpoint, setSubTab, setFlow, setEndpoint }: EndpointRowProps) {
    const routeToReference = () => {
        setFlow(flow);
        setEndpoint(endpoint);
        setSubTab(SubTabs.Reference);
    };

    return (
        <Table.Row onClick={routeToReference} className={cn('cursor-pointer')}>
            <Table.Cell bordered>
                <EndpointLabel endpoint={endpoint} type={flow.type} />
            </Table.Cell>
            <Table.Cell bordered>
                <div className="truncate">{flow.description}</div>
            </Table.Cell>
            <Table.Cell bordered className="relative">
                <div className="group flex justify-end">
                    {flow.enabled ? (
                        <div className="w-2 h-2 bg-green-500 rounded-full cursor-pointer"></div>
                    ) : (
                        <div className="w-2 h-2 bg-pink-600 rounded-full cursor-pointer"></div>
                    )}
                    <div className="hidden group-hover:block text-white absolute z-10 top-10 -left-24 bg-neutral-800 rounded border border-neutral-700 w-56">
                        <FlowCard flow={flow} />
                    </div>
                </div>
            </Table.Cell>
        </Table.Row>
    );
}
