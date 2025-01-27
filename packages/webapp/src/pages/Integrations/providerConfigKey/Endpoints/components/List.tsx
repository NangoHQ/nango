import type { GetIntegration, NangoSyncConfig, NangoSyncEndpointV2 } from '@nangohq/types';
import * as Table from '../../../../../components/ui/Table';
import { HttpLabel } from '../../../../../components/HttpLabel';
import { QuestionMarkCircledIcon } from '@radix-ui/react-icons';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../../../../components/EmptyState';
import { HelpFooter } from '../../../components/HelpFooter';
import { ScriptToggle } from '../../../components/ScriptToggle';
import { useStore } from '../../../../../store';
import { Info } from '../../../../../components/Info';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../../../components/ui/Tooltip';
import { Prism } from '@mantine/prism';

export type NangoSyncConfigWithEndpoint = NangoSyncConfig & { endpoint: NangoSyncEndpointV2 };
export interface FlowGroup {
    name: string;
    flows: NangoSyncConfigWithEndpoint[];
}

export const EndpointsList: React.FC<{ integration: GetIntegration['Success']['data']; byGroup: FlowGroup[]; v1Flow: NangoSyncConfig[] }> = ({
    integration,
    byGroup,
    v1Flow
}) => {
    const env = useStore((state) => state.env);

    if (byGroup.length <= 0 && v1Flow.length <= 0) {
        return (
            <EmptyState
                title="No available endpoints"
                help={
                    <>
                        There is no{' '}
                        <a
                            className="text-text-blue hover:text-text-light-blue"
                            href="https://docs.nango.dev/guides/pre-built-integrations/overview"
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
        );
    }

    return (
        <div className="text-sm text-white flex flex-col gap-10">
            <div className="flex flex-col gap-8">
                {byGroup.map(({ name, flows }) => {
                    return (
                        <div key={name}>
                            {(byGroup.length > 1 || (byGroup.length == 1 && name !== 'others')) && (
                                <div className="bg-active-gray capitalize py-1 px-2 text-sm rounded-sm font-semibold">{name}</div>
                            )}
                            <Table.Table className="table-fixed">
                                <Table.Header>
                                    <Table.Row>
                                        <Table.Head className="w-[220px] bg-pure-black p-0"></Table.Head>
                                        <Table.Head className="w-[340px] bg-pure-black p-0"></Table.Head>
                                        <Table.Head className="w-[60px] bg-pure-black p-0"></Table.Head>
                                        <Table.Head className="w-[50px] bg-pure-black p-0"></Table.Head>
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    {flows.map((flow) => {
                                        const usp = new URLSearchParams(flow.endpoint as unknown as Record<string, string>);
                                        return (
                                            <Link
                                                to={`/${env}/integrations/${integration.integration.unique_key}/endpoint?${usp.toString()}`}
                                                key={`${flow.name}-${flow.endpoint.path}`}
                                                className="contents"
                                            >
                                                <Table.Row>
                                                    <Table.Cell bordered className="text-white py-4 truncate">
                                                        <HttpLabel {...flow.endpoint} size="xs" />
                                                    </Table.Cell>
                                                    <Table.Cell bordered className="text-white truncate">
                                                        {flow.description}
                                                    </Table.Cell>
                                                    <Table.Cell bordered className="text-white">
                                                        {flow.is_public ? 'Template' : 'Custom'}
                                                    </Table.Cell>
                                                    <Table.Cell bordered className="text-white">
                                                        <ScriptToggle flow={flow} integration={integration} />
                                                    </Table.Cell>
                                                </Table.Row>
                                            </Link>
                                        );
                                    })}
                                </Table.Body>
                            </Table.Table>
                        </div>
                    );
                })}

                {v1Flow.length > 0 && (
                    <div>
                        <div className="bg-active-gray capitalize py-1 px-2 text-sm rounded-sm font-semibold">Scripts without endpoint</div>
                        <Table.Table className="table-fixed">
                            <Table.Header>
                                <Table.Row>
                                    <Table.Head className="w-[220px] bg-pure-black p-0"></Table.Head>
                                    <Table.Head className="w-[340px] bg-pure-black p-0"></Table.Head>
                                    <Table.Head className="w-[60px] bg-pure-black p-0"></Table.Head>
                                    <Table.Head className="w-[50px] bg-pure-black p-0"></Table.Head>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {v1Flow.map((flow) => {
                                    return (
                                        <Tooltip key={flow.id} delayDuration={0}>
                                            <TooltipTrigger asChild>
                                                <Table.Row>
                                                    <Table.Cell bordered className="text-white py-4 truncate">
                                                        {flow.type} - {flow.returns}
                                                    </Table.Cell>
                                                    <Table.Cell bordered className="text-white truncate">
                                                        {flow.description}
                                                    </Table.Cell>
                                                    <Table.Cell bordered className="text-white">
                                                        {flow.is_public ? 'Template' : 'Custom'}
                                                    </Table.Cell>
                                                    <Table.Cell bordered className="text-white"></Table.Cell>
                                                </Table.Row>
                                            </TooltipTrigger>
                                            <TooltipContent align="start" side="bottom">
                                                <div className="h-[250px] overflow-scroll">
                                                    <Prism noCopy language="json" className="px-0 py-2 transparent-code" colorScheme="dark">
                                                        {JSON.stringify(flow, null, 2)}
                                                    </Prism>
                                                </div>
                                            </TooltipContent>
                                        </Tooltip>
                                    );
                                })}
                            </Table.Body>
                        </Table.Table>
                        <Info variant={'warning'} className="mt-4">
                            Your nango.yaml is outdated, you can upgrade by following{' '}
                            <Link to="https://docs.nango.dev/guides/customize/migrate-integration-configuration" className="underline">
                                this procedure
                            </Link>
                        </Info>
                    </div>
                )}
            </div>

            <div className="text-text-light-gray flex gap-2 items-center">
                <QuestionMarkCircledIcon />
                Can&apos;t find the endpoint you need?{' '}
                <a href="https://docs.nango.dev/guides/custom-integrations/overview" className="underline">
                    Add your own
                </a>
            </div>
        </div>
    );
};
