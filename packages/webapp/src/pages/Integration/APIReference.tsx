import * as Table from '../../components/ui/Table';
import type { Tabs, SubTabs, EndpointResponse } from './Show';
import EndpointRow from './components/EndpointRow';
import { HelpFooter } from './components/HelpFooter';
import type { EnvironmentAndAccount } from '@nangohq/server';
import type { IntegrationConfig, Flow, FlowEndpoint } from '../../types';
import { EmptyState } from '../../components/EmptyState';

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
                <EmptyState
                    title="No available endpoints"
                    help={
                        <>
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
                        </>
                    }
                >
                    <div className="mt-10">
                        <HelpFooter />
                    </div>
                </EmptyState>
            ) : (
                <>
                    <Table.Table className="table-fixed">
                        <Table.Header>
                            <Table.Row>
                                <Table.Head className="w-[250px]">Endpoint</Table.Head>
                                <Table.Head className="w-[600px]">Description</Table.Head>
                                <Table.Head className="w-[60px]">Enabled</Table.Head>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {allFlows.map((flow, flowIndex) => {
                                return flow.endpoints.map((endpoint, index: number) => {
                                    return (
                                        <EndpointRow
                                            key={`tr-${flow.name}-${flowIndex}-${index}`}
                                            flow={flow}
                                            endpoint={endpoint}
                                            integration={integration}
                                            setSubTab={setSubTab}
                                            setFlow={setFlow}
                                            setEndpoint={setEndpoint}
                                        />
                                    );
                                });
                            })}
                        </Table.Body>
                    </Table.Table>
                    <div className="mt-10">
                        <HelpFooter />
                    </div>
                </>
            )}
        </div>
    );
}
