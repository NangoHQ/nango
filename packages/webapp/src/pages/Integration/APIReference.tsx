import { Fragment } from 'react';
import type { Tabs, SubTabs, EndpointResponse } from './Show';
import EndpointRow from './components/EndpointRow';
import HelpFooter from './components/HelpFooter';
import type { EnvironmentAndAccount } from '@nangohq/server';
import type { IntegrationConfig, Flow, FlowEndpoint } from '../../types';

interface APIReferenceProps {
    integration: IntegrationConfig | null;
    setActiveTab: (tab: Tabs) => void;
    endpoints: EndpointResponse;
    environment: EnvironmentAndAccount['environment'];
    setSubTab: (tab: SubTabs) => void;
    setFlow: (flow: Flow) => void;
    setEndpoint: (endpoint: FlowEndpoint | string) => void;
}

export default function APIReference(props: APIReferenceProps) {
    const { integration, endpoints, setSubTab, setFlow, setEndpoint } = props;

    const allFlows = [
        ...(endpoints?.allFlows?.syncs || []),
        ...(endpoints?.allFlows?.actions || []),
        ...(endpoints?.disabledFlows?.syncs || []),
        ...(endpoints?.disabledFlows?.actions || [])
    ];
    // if any element in the array has elements in the endpoints array then return true
    const hasEndpoints = allFlows.some((flow) => flow.endpoints.length > 0);

    return (
        <div className="h-fit rounded-md text-white text-sm">
            {!hasEndpoints ? (
                <div className="flex flex-col border border-border-gray rounded-md text-white text-sm text-center p-10">
                    <h2 className="text-xl text-center w-full">No available endpoint</h2>
                    <div className="mt-4 text-gray-400">
                        There is no{' '}
                        <a
                            className="text-text-blue hover:text-text-light-blue"
                            href="https://docs.nango.dev/understand/concepts/templates"
                            target="_blank"
                            rel="noreferrer"
                        >
                            integration template
                        </a>{' '}
                        available for this API yet.
                    </div>
                    <HelpFooter />
                </div>
            ) : (
                <>
                    <table className="w-[976px]">
                        <tbody className="flex flex-col max-w-[976px]">
                            <tr>
                                <td className="flex items-center px-3 justify-between text-xs px-2 py-2 bg-active-gray border border-neutral-800 rounded-md">
                                    <div className="w-0">Endpoint</div>
                                    <div className="w-64 -ml-11">Description</div>
                                    <div className="">Enabled</div>
                                </td>
                            </tr>
                            {allFlows.map((flow, flowIndex) => (
                                <Fragment key={flowIndex}>
                                    {flow.endpoints.map((endpoint, index: number) => (
                                        <tr key={`tr-${flow.name}-${flowIndex}-${index}`}>
                                            <EndpointRow
                                                flow={flow}
                                                endpoint={endpoint}
                                                integration={integration}
                                                setSubTab={setSubTab}
                                                setFlow={setFlow}
                                                setEndpoint={setEndpoint}
                                            />
                                        </tr>
                                    ))}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                    <HelpFooter />
                </>
            )}
        </div>
    );
}
