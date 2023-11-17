import { useState, useEffect } from 'react';
import { ArrowPathRoundedSquareIcon } from '@heroicons/react/24/outline';
import { BoltIcon } from '@heroicons/react/24/outline';
import { Tooltip } from '@geist-ui/core';
import { Integration } from './Show';
import {
    useGetIntegrationEndpointsAPI
} from '../../utils/api';
import FlowCard from './components/FlowCard';
import { GET, POST, PATCH, PUT, DELETE } from '../../components/ui/label/http';

interface APIReferenceProps {
    integration: Integration | null;
}

type HTTP_VERB = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

type NangoSyncEndpoint = {
    [key in HTTP_VERB]?: string;
};

export interface Flow extends UnenabledFlow {
    attributes: Record<string, unknown>;
    endpoints: NangoSyncEndpoint[];
    input: string;
    models: string[];
    scopes: string[];
    sync_type?: 'FULL' | 'INCREMENTAL';
    is_public: boolean;
    pre_built: boolean;
    version?: string;
    last_deployed?: string;
}

interface EnabledFlow {
    provider: string;
    providerConfigKey: string;
    syncs: Flow[];
    actions: Flow[];
}

export interface UnenabledFlow {
    description: string;
    name: string;
    returns: string | string[];
    type: 'sync' | 'action';
    runs?: string;
    track_deletes: boolean;
    auto_start?: boolean;
    endpoint?: string;
}

interface EndpointResponse {
    enabledFlows: EnabledFlow | null;
    unenabledFlows: UnenabledFlow[];
}

export default function APIReference(props: APIReferenceProps) {
    const [loaded, setLoaded] = useState(false);
    const [endpoints, setEndpoints] = useState<EndpointResponse>();

    const { integration } = props;
    const getEndpoints = useGetIntegrationEndpointsAPI();

    useEffect(() => {
        const getAllEndpoints = async () => {
            if (integration) {
                const res = await getEndpoints(integration.unique_key, integration.provider);
                if (res?.status === 200) {
                    const data = await res.json();
                    setEndpoints(data);
                }
            }
        };

        if (!loaded) {
            setLoaded(true);
            getAllEndpoints();
        }
    }, [integration, getEndpoints, loaded, setLoaded]);

    return (
        <div className="h-fit rounded-md text-white text-sm">
            <table className="w-[976px]">
                <tbody className="flex flex-col space-y-2">
                    <tr>
                        <td className="flex items-center px-3 justify-between text-xs px-2 py-2 bg-zinc-900 border border-neutral-800 rounded-md">
                            <div className="w-48">Endpoint</div>
                            <div className="w-64">Description</div>
                            <div className="w-48">Source</div>
                            <div className="">Sync/Action Info</div>
                        </td>
                    </tr>
                    {[...endpoints?.enabledFlows?.syncs || [], ...endpoints?.enabledFlows?.actions || []].map((flow) => (
                        <tr key={`tr-${flow.name}`}>
                            <td className="flex items-center p-3 justify-between border-b border-border-gray">
                                <div className="flex items-center px-3 w-48">
                                    <div className="flex flex items-center">
                                        {flow.endpoints[0]['GET'] && (
                                            <GET path={flow.endpoints[0]['GET']} />
                                        )}
                                        {flow.endpoints[0]['POST'] && (
                                            <POST path={flow.endpoints[0]['POST']} />
                                        )}
                                        {flow.endpoints[0]['PUT'] && (
                                            <PUT path={flow.endpoints[0]['PUT']} />
                                        )}
                                        {flow.endpoints[0]['PATCH'] && (
                                            <PATCH path={flow.endpoints[0]['PATCH']} />
                                        )}
                                        {flow.endpoints[0]['DELETE'] && (
                                            <DELETE path={flow.endpoints[0]['DELETE']} />
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center ml-3">
                                    <Tooltip text={flow.description} type="dark">
                                        <div className="text-gray-400 w-64 max-w-3xl truncate">{flow.description}</div>
                                    </Tooltip>
                                </div>
                                <div className="w-48">
                                    <div className="w-48 text-gray-400">
                                        {flow.is_public && ('Public')}
                                        {!flow.is_public && flow.pre_built && ('Managed')}
                                        {!flow.is_public && !flow.pre_built && ('Custom')}
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
                        </tr>
                    ))}
                    {endpoints?.unenabledFlows?.filter(flow => flow.endpoint).map((flow) => (
                        <tr key={`tr-${flow.name}`} className="">
                            <td className="flex items-center p-3 justify-between border-b border-border-gray">
                                <div className="flex items-center px-3 w-48">
                                    {flow?.endpoint?.split(' ').length === 1 && (flow?.type === 'sync') && (
                                        <GET path={flow?.endpoint as string} />
                                    )}
                                    {flow?.endpoint?.split(' ').length === 1 && (flow?.type === 'action') && (
                                        <POST path={flow?.endpoint as string} />
                                    )}
                                    {flow?.endpoint?.split(' ')[0] === 'GET' && (
                                        <GET path={flow?.endpoint.split(' ')[1]} />
                                    )}
                                    {flow?.endpoint?.split(' ')[0] === 'PUT' && (
                                        <PUT path={flow?.endpoint.split(' ')[1]} />
                                    )}
                                    {flow?.endpoint?.split(' ')[0] === 'PATCH' && (
                                        <PATCH path={flow?.endpoint.split(' ')[1]} />
                                    )}
                                    {flow?.endpoint?.split(' ')[0] === 'POST' && (
                                        <POST path={flow?.endpoint.split(' ')[1]} />
                                    )}
                                    {flow?.endpoint?.split(' ')[0] === 'DELETE' && (
                                        <DELETE path={flow?.endpoint.split(' ')[1]} />
                                    )}
                                </div>
                                <div className="flex items-center ml-3">
                                    <Tooltip text={flow.description} type="dark">
                                        <div className="text-gray-400 w-64 max-w-3xl truncate">{flow.description}</div>
                                    </Tooltip>
                                </div>
                                <div className="w-48">
                                    <div className="w-48 text-gray-400">
                                        Public
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
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
