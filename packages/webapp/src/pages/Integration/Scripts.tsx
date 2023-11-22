import { useNavigate } from 'react-router';
import { Tooltip } from '@geist-ui/core';
import { EndpointResponse } from './Show';
import { IntegrationConfig } from '../../types';
import EnableDisableSync from './components/EnableDisableSync';

interface ScriptProps {
    endpoints: EndpointResponse;
    integration: IntegrationConfig;
    setLoaded: (loaded: boolean) => void;
}

export default function Scripts(props: ScriptProps) {
    const { integration, endpoints, setLoaded } = props;
    const navigate = useNavigate();

    return (
        <div className="h-fit rounded-md text-white text-sm">
            <table className="w-[976px]">
                <tbody className="flex flex-col space-y-2">
                    <tr>
                        <td className="flex items-center px-3 justify-between text-xs px-2 py-2 bg-zinc-900 border border-neutral-800 rounded-md">
                            <div className="w-12">Scripts</div>
                            <div className="w-12">Models</div>
                            <div className="w-72">Description</div>
                            <div className="w-12">Source</div>
                            <div className="">Enabled</div>
                        </td>
                    </tr>
                    <tr>
                    {[...endpoints?.enabledFlows?.syncs || [], ...endpoints?.unEnabledFlows?.syncs || []].filter(flow => flow.endpoints && flow.endpoints.length > 0).map((flow) => (
                        <td
                            key={flow.name}
                            className="flex items-center p-3 py-5 cursor-pointer justify-between border-b border-border-gray"
                            onClick={() => navigate(`/integration/${integration.provider}/${flow.name}`)}
                        >
                            <div className="flex items-center w-36">
                                <span className="w-48">{flow.name}</span>
                            </div>
                            <div className="flex items-center w-36 -ml-8">
                                <Tooltip text={Array.isArray(flow.returns) ? flow.returns.join(', ') : flow.returns} type="dark">
                                    <div className="w-36 max-w-3xl truncate">{Array.isArray(flow.returns) ? flow.returns.join(', ') : flow.returns}</div>
                                </Tooltip>
                            </div>
                            <div className="flex items-center w-[22rem] -ml-8">
                                <Tooltip text={flow.description} type="dark">
                                    <div className="w-72 max-w-3xl truncate">{flow.description}</div>
                                </Tooltip>
                            </div>
                            <div className="flex items-center w-32">
                                {flow.is_public ? 'Public' :
                                    flow.pre_built ? 'Managed' :
                                    'Custom'
                                }
                            </div>
                            <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                                <EnableDisableSync
                                    flow={flow}
                                    provider={integration.provider}
                                    setLoaded={setLoaded}
                                    rawName={endpoints?.unEnabledFlows?.rawName}
                                />
                            </div>
                        </td>
                    ))}
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
