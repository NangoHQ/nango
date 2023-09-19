import { useState, useEffect } from 'react';
import { Prism } from '@mantine/prism';
import { useGetFlows } from '../utils/api';
import { LeftNavBarItems } from '../components/LeftNavBar';
import DashboardLayout from '../layout/DashboardLayout';
import { useStore } from '../store';

interface FlowDetails {
    type?: 'sync' | 'action';
    auto_start?: boolean;
    track_deletes?: boolean;
    returns: string[];
    runs: string;
}

interface Flow {
    [key: string]: FlowDetails | object;
    models: Record<string, unknown>;
}

interface Integration {
    [key: string]: Flow;
}

export default function FlowCreate() {
    const [loaded, setLoaded] = useState(false);
    const [integration, setIntegration] = useState<string>('');
    const [flows, setFlows] = useState<Integration>({});
    const [flowNames, setFlowNames] = useState<string[]>([]);
    const [flow, setFlow] = useState<FlowDetails>();
    const [models, setModels] = useState<Flow['models']>({});
    const [selectedFlowName, setSelectedFlowName] = useState<string>('');

    const [frequencyEditMode, setFrequencyEditMode] = useState(false);
    const getFlows = useGetFlows();
    const env = useStore(state => state.cookieValue);

    useEffect(() => {
        setLoaded(false);
    }, [env]);

    useEffect(() => {
        const getAvailableFlows = async () => {
            const res = await getFlows();

            if (res?.status === 200) {
                const flows = await res.json();
                setFlows(flows.integrations);
                setIntegration(Object.keys(flows.integrations)[0]);
                setFlowNames(Object.keys(flows.integrations[Object.keys(flows.integrations)[0]]).filter(name => name !== 'models'));
                setFlow(flows.integrations[Object.keys(flows.integrations)[0]][Object.keys(flows.integrations[Object.keys(flows.integrations)[0]])[0]] as FlowDetails);
                setModels(flows.integrations[Object.keys(flows.integrations)[0]]['models']);
            }
        }
        if (!loaded) {
            setLoaded(true);
            getAvailableFlows();
        }
    }, [getFlows, loaded]);

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = Object.fromEntries(formData.entries());

        const models = showModels(flow?.returns as string[]) as any;
        const integrationPayload = {
            integration: data['integration'],
            type: flow?.type === 'action' ? 'action' : 'sync',
            name: data['flow-name'], // should they be able to change this
            runs: `every ${data['frequency']} ${data['frequency-unit']}`,
            auto_start: data['auto-start'] === 'on',
            track_deletes: data['track-deletes'] === 'true',
            models: flow?.returns,
            model_schema: Object.keys(models).map(model => ({
                name: model,
                fields: Object.keys(models[model]).map(field => ({
                    name: field,
                    type: models[model][field]
                }))
            }))
        }
        // send this to a different endpoint to automatically pull in the built file
        // already set in s3
        console.log(integrationPayload);
        // 1) integration templates need to be built and stored in s3
        // that can happen as part of the build, on a template change
        // 2) Need a marker that this is a prebuilt template
        // 3) Files in are version controlled and if there is an update you
        // can upgrade to the latet version
        // version stored in the nango.yaml?
    }

    const handleIntegrationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setIntegration(e.target.value);
        const flowNamesWithModels = Object.keys(flows[e.target.value]);
        const flowNames = flowNamesWithModels.filter(name => name !== 'models');
        setFlowNames(flowNames);
        setSelectedFlowName(flowNames[0]);
        setFlow(flows[e.target.value][flowNames[0]] as FlowDetails);
        setModels(flows[e.target.value]['models']);
    }

    const handleFlowNameChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const flow = flows[integration][e.target.value] as FlowDetails;
        setSelectedFlowName(e.target.value);
        setFlow(flow);
        setModels(flows[integration]['models']);
    }

    const handleUpdateFrequency = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        const formElement = e.currentTarget.closest('form');
        if (!formElement) return;

        const formData = new FormData(formElement);
        const data = Object.fromEntries(formData.entries());
        const frequency = data['frequency'];
        const frequencyUnit = data['frequency-unit'];

        setFlow({
            ...flow,
            runs: `every ${frequency} ${frequencyUnit}`
        } as FlowDetails);

        setFrequencyEditMode(false);
    }

    const showModels = (returns: string[]) => {
        const builtModels = {} as Flow['models'];

        returns.forEach(returnedModel => {
            builtModels[returnedModel] = models[returnedModel];
        });

        return builtModels;
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Syncs}>
            {flows && Object.keys(flows).length > 0 && (
                <div className="mx-auto w-largebox pb-40">
                    <h2 className="mx-20 mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Add New Flow</h2>
                    <div className="mx-20 h-fit border border-border-gray rounded-md text-white text-sm py-14 px-8">
                        <form className="space-y-6" onSubmit={handleSave} autoComplete="off">
                            <div>
                                <div>
                                    <div className="flex">
                                        <label htmlFor="integration" className="text-text-light-gray block text-sm font-semibold">
                                            Integration
                                        </label>
                                    </div>
                                    <div className="mt-1">
                                        <select
                                            id="integration"
                                            name="integration"
                                            className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                                            onChange={handleIntegrationChange}
                                            defaultValue={Object.keys(flows)[0]}
                                        >
                                            {Object.keys(flows).map((integration, index) => (
                                                <option key={index} value={integration}>{integration}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <div>
                                    <div className="flex">
                                        <label htmlFor="flow-name" className="text-text-light-gray block text-sm font-semibold">
                                            Flow Name
                                        </label>
                                    </div>
                                    <div className="mt-1">
                                        <select
                                            id="flow-name"
                                            name="flow-name"
                                            className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                                            onChange={handleFlowNameChange}
                                            value={selectedFlowName}
                                        >
                                            {flowNames.map((flowName, index) => (
                                                <option key={index} value={flowName}>{flowName}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <div>
                                    <div className="flex">
                                        <label htmlFor="flow-name" className="text-text-light-gray block text-sm font-semibold">
                                            Type
                                        </label>
                                    </div>
                                    <div className="mt-1">
                                        <span className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white">{flow?.type === 'action' ? 'action' : 'sync'}</span>
                                    </div>
                                </div>
                            </div>
                            {flow?.type !== 'action' && (
                                <div>
                                    <div>
                                        <div className="flex">
                                            <label htmlFor="flow-name" className="text-text-light-gray block text-sm font-semibold">
                                                Auto Start
                                            </label>
                                        </div>
                                        <div className="mt-1">
                                            <input
                                                id="auto-start"
                                                type="checkbox"
                                                name="auto-start"
                                                defaultChecked={flow?.auto_start !== false}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                            {flow?.track_deletes && (
                                <div>
                                    <div>
                                        <div className="flex">
                                            <label htmlFor="flow-name" className="text-text-light-gray block text-sm font-semibold">
                                                Track Deletes
                                            </label>
                                        </div>
                                        <div className="mt-1">
                                            <input
                                                id="track-deletes"
                                                type="checkbox"
                                                name="track-deletes"
                                                defaultChecked={flow?.track_deletes}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                            {flow?.type !== 'action' && (
                                <div>
                                    <div>
                                        <div className="flex">
                                            <label htmlFor="flow-name" className="text-text-light-gray block text-sm font-semibold">
                                                Frequency
                                            </label>
                                        </div>
                                        <div className="flex mt-1">
                                            <div className={`${frequencyEditMode ? 'flex' : 'hidden'}`}>
                                                <input
                                                    id="frequency"
                                                    name="frequency"
                                                    type="number"
                                                    className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                                                    defaultValue={flow?.runs?.match(/\d+/g)?.map(Number)[0]}
                                                />
                                                <select
                                                    id="frequency-unit"
                                                    name="frequency-unit"
                                                    className="ml-4 border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                                                    defaultValue={flow?.runs?.match(/[a-zA-Z]+/g)?.map(String)[0]}
                                                >
                                                    <option value="minutes">Minutes</option>
                                                    <option value="hours">Hours</option>
                                                    <option value="days">Days</option>
                                                </select>
                                                <button
                                                    type="button"
                                                    className="hover:bg-gray-700 bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                                    onClick={handleUpdateFrequency}
                                                >
                                                    Update
                                                </button>
                                            </div>
                                            <div className={`${frequencyEditMode ? 'hidden' : 'flex w-1/3'}`}>
                                                <span className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white">{flow?.runs}</span>
                                                <button
                                                    onClick={() => setFrequencyEditMode(true)}
                                                    className="hover:bg-gray-700 bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                                >
                                                    Edit
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {flow?.returns && (
                                <div>
                                    <div>
                                        <div className="flex">
                                            <label htmlFor="flow-name" className="text-text-light-gray block text-sm font-semibold">
                                                Model{flow?.returns?.length > 1 ? 's' : ''}
                                            </label>
                                        </div>
                                        <Prism language="json" colorScheme="dark">
                                            {JSON.stringify(showModels(flow.returns), null, 2)}
                                        </Prism>
                                    </div>
                                </div>
                            )}
                            <div>
                                <div className="flex justify-between">
                                    <button type="submit" className="bg-white mt-4 h-8 rounded-md hover:bg-gray-300 border px-3 pt-0.5 text-sm text-black">
                                        Add {flow?.type === 'action' ? 'Action' : 'Sync'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
