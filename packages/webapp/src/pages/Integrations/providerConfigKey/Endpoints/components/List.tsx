import type { GetIntegration, HTTP_VERB, NangoSyncConfig } from '@nangohq/types';
import * as Table from '../../../../../components/ui/Table';
import { HttpLabel } from '../../../../../components/HttpLabel';
import { QuestionMarkCircledIcon } from '@radix-ui/react-icons';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../../../../components/EmptyState';
import { HelpFooter } from '../../../components/HelpFooter';
import { ScriptToggle } from '../../../components/ScriptToggle';

export type NangoSyncConfigWithEndpoint = NangoSyncConfig & { endpoint: { verb: HTTP_VERB; path: string } };

export const EndpointsList: React.FC<{ integration: GetIntegration['Success']['data']; byGroup: { name: string; flows: NangoSyncConfigWithEndpoint[] }[] }> = ({
    integration,
    byGroup
}) => {
    if (byGroup.length <= 0) {
        return (
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
        );
    }
    return (
        <div className="text-sm text-white flex flex-col gap-10">
            <div className="flex flex-col gap-8">
                {byGroup.map(({ name, flows }) => {
                    return (
                        <div key={name}>
                            <div className="bg-active-gray capitalize py-1 px-2 text-sm rounded-sm font-semibold">{name}</div>
                            <Table.Table className="table-fixed">
                                <Table.Header>
                                    <Table.Row>
                                        <Table.Head className="w-[200px] bg-pure-black p-0"></Table.Head>
                                        <Table.Head className="w-[340px] bg-pure-black p-0"></Table.Head>
                                        <Table.Head className="w-[60px] bg-pure-black p-0"></Table.Head>
                                        <Table.Head className="w-[40px] bg-pure-black p-0"></Table.Head>
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    {flows.map((flow) => {
                                        const usp = new URLSearchParams(flow.endpoint);
                                        return (
                                            <Link to={`?${usp.toString()}`} key={flow.name} className="contents">
                                                <Table.Row>
                                                    <Table.Cell bordered className="text-white py-4">
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
            </div>

            <div className="text-text-light-gray flex gap-2 items-center">
                <QuestionMarkCircledIcon />
                Can&apos;t find the endpoint you need?{' '}
                <a href="https://docs.nango.dev/customize/overview" className="underline">
                    Add your own
                </a>
            </div>
        </div>
    );
};
