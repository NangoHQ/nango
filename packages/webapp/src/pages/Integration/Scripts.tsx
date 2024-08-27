import { Tooltip } from '@geist-ui/core';
import { BoltIcon, ArrowPathRoundedSquareIcon } from '@heroicons/react/24/outline';
import type { EndpointResponse, FlowConfiguration } from './Show';
import { SubTabs } from './Show';
import type { IntegrationConfig, Flow } from '../../types';
import EnableDisableSync from './components/EnableDisableSync';
import { HelpFooter } from './components/HelpFooter';
import * as Table from '../../components/ui/Table';
import { cn } from '../../utils/utils';
import { EmptyState } from '../../components/EmptyState';

interface ScriptProps {
    endpoints: EndpointResponse;
    integration: IntegrationConfig;
    reload: () => void;
    setFlow: (flow: Flow) => void;
    setSubTab: (tab: SubTabs) => void;
    setFlowConfig: (flowConfig: FlowConfiguration) => void;
}

export default function Scripts(props: ScriptProps) {
    const { integration, endpoints, reload, setFlow, setSubTab, setFlowConfig } = props;
    const syncs = [...(endpoints?.allFlows?.syncs || []), ...(endpoints?.disabledFlows?.syncs || [])].sort((a, b) => a.name.localeCompare(b.name));
    const actions = [...(endpoints?.allFlows?.actions || []), ...(endpoints?.disabledFlows?.actions || [])].sort((a, b) => a.name.localeCompare(b.name));
    const hasScripts = syncs.length || actions.length;

    const routeToScript = (flow: Flow) => {
        setFlow(flow);
        setSubTab(SubTabs.Flow);
        if (flow.is_public) {
            setFlowConfig(endpoints.disabledFlows as FlowConfiguration);
        } else {
            setFlowConfig(endpoints.allFlows as FlowConfiguration);
        }
    };

    return (
        <div className="h-fit rounded-md text-white text-sm">
            {!hasScripts ? (
                <EmptyState
                    title="No available scripts"
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
                <div className="flex flex-col gap-10">
                    <Table.Table className="table-fixed">
                        <Table.Header>
                            <Table.Row>
                                <Table.Head className="w-[200px]">
                                    <div className="flex w-18 items-center">
                                        <ArrowPathRoundedSquareIcon className="flex h-4 w-4 mr-1" />
                                        Sync Scripts
                                    </div>
                                </Table.Head>
                                <Table.Head className="w-[220px]">Models</Table.Head>
                                <Table.Head className="w-[300px]">Description</Table.Head>
                                <Table.Head className="w-[100px]">Source</Table.Head>
                                <Table.Head className="w-[80px]">Enabled</Table.Head>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {syncs.length > 0 ? (
                                syncs.map((flow) => {
                                    return (
                                        <Table.Row
                                            key={flow.name}
                                            className={cn('cursor-pointer', flow.enabled && 'text-white')}
                                            onClick={() => routeToScript(flow)}
                                        >
                                            <Table.Cell bordered>
                                                <div className="truncate">{flow.name}</div>
                                            </Table.Cell>
                                            <Table.Cell bordered>
                                                <div className="truncate flex items-center">
                                                    <Tooltip
                                                        text={Array.isArray(flow.returns) ? flow.returns.join(', ') : flow.returns}
                                                        type="dark"
                                                        className="truncate"
                                                    >
                                                        {Array.isArray(flow.returns) ? flow.returns.join(', ') : flow.returns}
                                                    </Tooltip>
                                                </div>
                                            </Table.Cell>
                                            <Table.Cell bordered>
                                                <div className="truncate">{flow.description}</div>
                                            </Table.Cell>
                                            <Table.Cell bordered>{flow.is_public ? 'Template' : 'Custom'}</Table.Cell>
                                            <Table.Cell bordered onClick={(e) => e.stopPropagation()}>
                                                <EnableDisableSync
                                                    flow={flow}
                                                    provider={integration.provider}
                                                    providerConfigKey={integration.unique_key}
                                                    reload={reload}
                                                    connections={integration?.connections}
                                                />
                                            </Table.Cell>
                                        </Table.Row>
                                    );
                                })
                            ) : (
                                <Table.Empty colSpan={5}>No syncs</Table.Empty>
                            )}
                        </Table.Body>
                    </Table.Table>

                    <Table.Table className="table-fixed">
                        <Table.Header>
                            <Table.Row>
                                <Table.Head className="w-[200px]">
                                    <div className="flex items-center">
                                        <BoltIcon className="flex h-4 w-4 mr-1" />
                                        Actions Scripts
                                    </div>
                                </Table.Head>
                                <Table.Head className="w-[500px]">Description</Table.Head>
                                <Table.Head className="w-[100px]">Source</Table.Head>
                                <Table.Head className="w-[100px]">Enabled</Table.Head>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {actions.length > 0 ? (
                                actions.map((flow) => {
                                    return (
                                        <Table.Row
                                            key={flow.name}
                                            className={cn('cursor-pointer', flow.enabled && 'text-white')}
                                            onClick={() => routeToScript(flow)}
                                        >
                                            <Table.Cell bordered>
                                                <div className="truncate">{flow.name}</div>
                                            </Table.Cell>
                                            <Table.Cell bordered>
                                                <div className="truncate">{flow.description}</div>
                                            </Table.Cell>
                                            <Table.Cell bordered>{flow.is_public ? 'Template' : 'Custom'}</Table.Cell>
                                            <Table.Cell bordered onClick={(e) => e.stopPropagation()}>
                                                <EnableDisableSync
                                                    flow={flow}
                                                    provider={integration.provider}
                                                    providerConfigKey={integration.unique_key}
                                                    reload={reload}
                                                    connections={integration?.connections}
                                                    showSpinner={true}
                                                />
                                            </Table.Cell>
                                        </Table.Row>
                                    );
                                })
                            ) : (
                                <Table.Empty colSpan={4}>No actions</Table.Empty>
                            )}
                        </Table.Body>
                    </Table.Table>

                    <div className="mt-10">
                        <HelpFooter />
                    </div>
                </div>
            )}
        </div>
    );
}
