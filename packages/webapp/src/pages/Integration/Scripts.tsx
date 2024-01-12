import { useNavigate } from 'react-router';
import { Tooltip } from '@geist-ui/core';
import { BoltIcon, ArrowPathRoundedSquareIcon } from '@heroicons/react/24/outline';
import { EndpointResponse } from './Show';
import { IntegrationConfig } from '../../types';
import EnableDisableSync from './components/EnableDisableSync';
import HelpFooter from './components/HelpFooter';

interface ScriptProps {
    endpoints: EndpointResponse;
    integration: IntegrationConfig;
    setLoaded: (loaded: boolean) => void;
}

export default function Scripts(props: ScriptProps) {
    const { integration, endpoints, setLoaded } = props;
    const navigate = useNavigate();
    const syncs = [...endpoints?.enabledFlows?.syncs || [], ...endpoints?.unEnabledFlows?.syncs || []];
    const actions = [...endpoints?.enabledFlows?.actions || [], ...endpoints?.unEnabledFlows?.actions || []];
    const hasScripts = syncs.length || actions.length;

    return (
        <div className="h-fit rounded-md text-white text-sm">
            {!hasScripts ? (
                <div className="flex flex-col border border-border-gray rounded-md text-white text-sm text-center p-10">
                    <h2 className="text-xl text-center w-full">Sync models from {integration?.provider}</h2>
                    <div className="mt-4 text-gray-400">{integration?.provider} does not yet have publicly available models to sync. Create your own or request some from Nango.</div>
                    <HelpFooter type="" />
                </div>
            ) : (
                <>
                    <table className="w-[976px]">
                        <tbody className="flex flex-col space-y-2">
                            <tr>
                                <td className="flex items-center px-3 justify-between text-xs px-2 py-2 bg-zinc-900 border border-neutral-800 rounded-md">
                                    <div className="flex w-18 items-center">
                                        <ArrowPathRoundedSquareIcon className="flex h-4 w-4 mr-1" />
                                        Sync Scripts
                                    </div>
                                    <div className="w-12 -ml-10">Models</div>
                                    <div className="w-72">Description</div>
                                    <div className="w-12">Source</div>
                                    <div className="">Enabled</div>
                                </td>
                            </tr>
                            <tr>
                            {syncs.map((flow) => (
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
                        <tbody className="flex mt-16 flex-col space-y-2">
                            <tr>
                                <td className="flex items-center px-3 justify-between text-xs px-2 py-2 bg-zinc-900 border border-neutral-800 rounded-md">
                                    <div className="flex w-18 items-center">
                                        <BoltIcon className="flex h-4 w-4 mr-1" />
                                        Action Scripts
                                    </div>
                                    <div className="w-[670px]">Description</div>
                                    <div className="">Source</div>
                                </td>
                            </tr>
                            <tr>
                            {actions.map((flow) => (
                                <td
                                    key={flow.name}
                                    className="flex items-center cursor-pointer p-3 py-5 justify-between border-b border-border-gray"
                                    onClick={() => navigate(`/integration/${integration.provider}/${flow.name}`)}
                                >
                                    <div className="flex items-center w-36">
                                        <span className="w-48">{flow.name}</span>
                                    </div>
                                    <div className="flex items-center w-[720px]">
                                        <Tooltip text={<span className="text-sm">{flow.description}</span>} type="dark">
                                            <div className="w-[710px] max-w-3xl truncate">{flow.description}</div>
                                        </Tooltip>
                                    </div>
                                    <div className="flex items-center">
                                        {flow.is_public ? 'Public' :
                                            flow.pre_built ? 'Managed' :
                                            'Custom'
                                        }
                                    </div>
                                </td>
                            ))}
                            </tr>
                        </tbody>
                    </table>
                    <HelpFooter />
                </>
            )}
        </div>
    );
}
