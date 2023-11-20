import { Integration, EndpointResponse } from './Show';

interface SyncConfigurationProps {
    integration: Integration | null;
    endpoints: EndpointResponse;
}

export default function SyncConfiguration(props: SyncConfigurationProps) {
    const { integration, endpoints } = props;
    console.log(integration)

    return (
        <div className="h-fit rounded-md text-white text-sm">
            <table className="w-[976px]">
                <tbody className="flex flex-col space-y-2">
                    <tr>
                        <td className="flex items-center px-3 justify-between text-xs px-2 py-2 bg-zinc-900 border border-neutral-800 rounded-md">
                            <div className="w-48">Scripts</div>
                            <div className="w-64">Models</div>
                            <div className="w-48">Description</div>
                            <div className="">Source</div>
                            <div className="">Enabled</div>
                        </td>
                    </tr>
                    {[...endpoints?.enabledFlows?.syncs || [], ...endpoints?.enabledFlows?.actions || []].map((flow) => (
                        <>
                            {flow.name}
                        </>
                    ))}
                    {endpoints?.unenabledFlows?.filter(flow => flow.endpoint).map((flow) => (
                        <tr key={`tr-${flow.name}`} className="">
                            {flow.name}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
