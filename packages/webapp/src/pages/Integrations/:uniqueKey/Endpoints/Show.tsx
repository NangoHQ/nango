import { useParams } from 'react-router-dom';
import { Skeleton } from '../../../../components/ui/Skeleton';
import { useGetIntegrationFlows } from '../../../../hooks/useIntegration';
import { useStore } from '../../../../store';
import { useMemo } from 'react';
import type { HTTP_VERB, NangoSyncConfig } from '@nangohq/types';
import * as Table from '../../../../components/ui/Table';
import { HttpLabel } from '../../../../components/HttpLabel';
import { QuestionMarkCircledIcon } from '@radix-ui/react-icons';

type NangoSyncConfigWithEndpoint = NangoSyncConfig & { endpoint: { verb: HTTP_VERB; path: string } };
const allowedGroup = ['customers', 'invoices', 'payments', 'tickets'];
export const EndpointsShow: React.FC = () => {
    const env = useStore((state) => state.env);
    const { integrationId } = useParams();
    const { data, loading } = useGetIntegrationFlows(env, integrationId!);

    const byGroup = useMemo(() => {
        if (!data) {
            return [];
        }

        const tmp: Record<string, NangoSyncConfigWithEndpoint[]> = {};
        for (const flow of data.flows) {
            for (const endpoint of flow.endpoints) {
                const entries = Object.entries(endpoint)[0];
                const paths = entries[1].split('/');

                const path = paths[1];
                if (!path) {
                    continue;
                }
                const groupName = allowedGroup.includes(path) ? path : 'others';

                let group = tmp[groupName];
                if (!group) {
                    group = [];
                    tmp[groupName] = group;
                }

                group.push({ ...flow, endpoint: { verb: entries[0] as HTTP_VERB, path: entries[1] } });
            }
        }

        const groups: { name: string; flows: NangoSyncConfigWithEndpoint[] }[] = [];
        for (const group of Object.entries(tmp)) {
            groups.push({
                name: group[0],
                flows: group[1].sort((a, b) => {
                    // Sort by length of path
                    const lenA = (a.endpoint.path.match(/\//g) || []).length;
                    const lenB = (b.endpoint.path.match(/\//g) || []).length;
                    if (lenA > lenB) return 1;
                    else if (lenA < lenB) return -1;

                    // Sort by verb
                    if (a.endpoint.verb === 'GET') return -1;
                    else if (a.endpoint.verb === 'POST' && b.endpoint.verb === 'PUT') return -1;
                    else if (a.endpoint.verb === 'PUT' && b.endpoint.verb === 'PATCH') return -1;
                    else if (a.endpoint.verb === 'PATCH' && b.endpoint.verb === 'DELETE') return -1;
                    return 1;
                })
            });
        }

        return groups;
    }, [data]);

    if (loading) {
        return (
            <div>
                <Skeleton className="w-[150px]" />
            </div>
        );
    }

    if (!data) {
        return null;
    }
    return (
        <div className="text-sm text-white flex flex-col gap-10">
            <div className="flex flex-col gap-8">
                {byGroup.map(({ name, flows }) => {
                    return (
                        <div key={name}>
                            <div className="bg-active-gray capitalize py-1 px-2 text-sm rounded-sm">{name}</div>
                            <Table.Table className="table-fixed">
                                <Table.Header>
                                    <Table.Row>
                                        <Table.Head className="w-[200px] bg-pure-black p-0"></Table.Head>
                                        <Table.Head className="w-[300px] bg-pure-black p-0"></Table.Head>
                                        <Table.Head className="w-[60px] bg-pure-black p-0"></Table.Head>
                                        <Table.Head className="w-[60px] bg-pure-black p-0"></Table.Head>
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    {flows.map((flow) => {
                                        return (
                                            <Table.Row key={flow.name}>
                                                <Table.Cell bordered className="text-white">
                                                    <HttpLabel {...flow.endpoint} />
                                                </Table.Cell>
                                                <Table.Cell bordered className="text-white">
                                                    {flow.description}
                                                </Table.Cell>
                                                <Table.Cell bordered className="text-white">
                                                    {flow.is_public ? 'Template' : 'Custom'}
                                                </Table.Cell>
                                                <Table.Cell bordered className="text-white"></Table.Cell>
                                            </Table.Row>
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
