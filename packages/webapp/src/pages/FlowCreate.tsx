import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Prism } from '@mantine/prism';
import { useGetFlows, useCreateFlow } from '../utils/api';
import { Sync } from '../types';
import { LeftNavBarItems } from '../components/LeftNavBar';
import DashboardLayout from '../layout/DashboardLayout';
import { useStore } from '../store';
import Info from '../components/ui/Info'
import Button from '../components/ui/button/Button';
import Spinner from '../components/ui/Spinner';

interface FlowDetails {
    type?: 'sync' | 'action';
    auto_start?: boolean;
    track_deletes?: boolean;
    returns: string[];
    runs: string;
    rawName?: string
    description?: string;
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
    const [isDownloading, setIsDownloading] = useState(false);
    const [integration, setIntegration] = useState<string>('');
    const [flows, setFlows] = useState<Integration>({});
    const [possibleFlowsFromSelection, setPossibleFlowsFromSelection] = useState<Flow[]>([]);
    const [flowNames, setFlowNames] = useState<string[]>([]);
    const [flow, setFlow] = useState<FlowDetails>();
    const [models, setModels] = useState<Flow['models']>({});
    const [selectedFlowName, setSelectedFlowName] = useState<string>('');
    const [alreadyAddedFlows, setAlreadyAddedFlows] = useState<Sync[]>([]);
    const [canAdd, setCanAdd] = useState<boolean>(true);

    const [frequencyValue, setFrequencyValue] = useState<number>();
    const [frequencyUnit, setFrequencyUnit] = useState<string>();
    const [showFrequencyError, setShowFrequencyError] = useState(false);
    const getFlows = useGetFlows();
    const createFlow = useCreateFlow();
    const env = useStore(state => state.cookieValue);

    const navigate = useNavigate();

    useEffect(() => {
        setLoaded(false);
    }, [env]);

    useEffect(() => {
        const getAvailableFlows = async () => {
            const res = await getFlows();

            if (res?.status === 200) {
                const { availableFlows, addedFlows } = await res.json();
                setAlreadyAddedFlows(addedFlows);
                setFlows(availableFlows.integrations);
                const integration = Object.keys(availableFlows.integrations)[0];
                setIntegration(integration);
                setSelectedFlowName(Object.keys(availableFlows.integrations[Object.keys(availableFlows.integrations)[0]])[0]);
                const flowNames = Object.keys(availableFlows.integrations[Object.keys(availableFlows.integrations)[0]]).filter(name => name !== 'models' && name !== 'rawName')
                setFlowNames(flowNames);
                setPossibleFlowsFromSelection(flowNames.map(name => availableFlows.integrations[integration][name]) as Flow[]);
                const flow = availableFlows.integrations[Object.keys(availableFlows.integrations)[0]][Object.keys(availableFlows.integrations[Object.keys(availableFlows.integrations)[0]])[0]] as FlowDetails;
                flow.type = flow.type || 'sync';
                setFlow(flow);
                updateFrequency(flow.runs);
                setModels(availableFlows.integrations[Object.keys(availableFlows.integrations)[0]]['models']);
            }
        }
        if (!loaded) {
            setLoaded(true);
            getAvailableFlows();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getFlows, loaded]);

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data = Object.fromEntries(formData.entries());
        const frequencyValue = Number(data['frequency']);
        const frequencyUnit = data['frequency-unit'];

        if (frequencyValue && frequencyValue < 5 && frequencyUnit === 'minutes') {
            setShowFrequencyError(true);
            return;
        } else {
            setShowFrequencyError(false);
        }

        const flowObject = flows[data['integration'] as string] as Flow;

        const models = Array.isArray(flow?.returns) ? showModels(flow?.returns as string[]) as any : flow?.returns;
        const flowPayload = {
            provider: data['integration'].toString(),
            type: flow?.type || 'sync',
            name: data['flow-name'].toString(),
            runs: flow?.type === 'action' ? null : `every ${frequencyValue} ${frequencyUnit}`,
            auto_start: flow?.auto_start !== false,
            models: (Array.isArray(flow?.returns) ? flow?.returns : [flow?.returns]) as string[],
            model_schema: JSON.stringify(Object.keys(models).map(model => ({
                name: model,
                fields: Object.keys(models[model]).map(field => ({
                    name: field,
                    type: models[model][field]
                }))
            }))),
            is_public: true,
            public_route: flowObject.rawName || data['integration'].toString()
        };

        const res = await createFlow([flowPayload]);

        if (res?.status === 201) {
            toast.success(`${flowPayload.type} created successfully!`, { position: toast.POSITION.BOTTOM_CENTER });
            navigate('/syncs', { replace: true });
        } else if (res != null) {
            const payload = await res.json();
            toast.error(payload.error, {
                position: toast.POSITION.BOTTOM_CENTER
            });
        }
    }

    const handleIntegrationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setIntegration(e.target.value);
        setShowFrequencyError(false);
        const flowNamesWithModels = Object.keys(flows[e.target.value]);
        const flowNames = flowNamesWithModels.filter(name => name !== 'models' && name !== 'rawName');
        setPossibleFlowsFromSelection(flowNames.map(name => flows[e.target.value][name]) as Flow[]);
        setFlowNames(flowNames);
        setSelectedFlowName(flowNames[0]);
        const alreadyAdded = alreadyAddedFlows.find((flow: Sync) => flow.unique_key === e.target.value && flow.sync_name === flowNames[0]);
        setCanAdd(alreadyAdded === undefined);
        const flow = flows[e.target.value][flowNames[0]] as FlowDetails;
        setFlow(flow);
        updateFrequency(flow.runs);
        setModels(flows[e.target.value]['models']);
    }

    const handleFlowNameChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const flow = flows[integration][e.target.value] as FlowDetails;
        setSelectedFlowName(e.target.value);
        setShowFrequencyError(false);
        setFlow(flow);
        if (flow.type !== 'action') {
            updateFrequency(flow.runs);
        }
        setModels(flows[integration]['models']);

        const alreadyAdded = alreadyAddedFlows.find((flow: Sync) => flow.unique_key === integration && flow.sync_name === e.target.value);
        setCanAdd(alreadyAdded === undefined);
    }

    const showModels = (returns: string | string[]) => {
        const builtModels = {} as Flow['models'];

        if (!Array.isArray(returns)) {
            return models[returns] ?? returns;
        }

        returns.forEach(returnedModel => {
            builtModels[returnedModel] = models[returnedModel];
        });

        return builtModels;
    }

    const matchDefaultFrequencyValue = (frequency: string): void => {
        const frequencyValue = frequency.match(/\d+/g)?.[0];

        if (frequency.includes('half')) {
            setFrequencyValue(30);
            return;
        }

        if (!frequencyValue) {
            setFrequencyValue(1);
            return;
        };

        setFrequencyValue(Number(frequencyValue));
    }

    const matchDefaultFrequencyUnit = (frequency: string): void => {
        const frequencyWithoutEvery = frequency.replace('every ', '');
        const frequencyWithoutNumber = frequencyWithoutEvery.replace(/\d+/g, '');
        const frequencyUnit = frequencyWithoutNumber.replace(/\s/g, '');

        let unit = '';

        switch (frequencyUnit) {
            case 'minutes':
            case 'minute':
            case 'min':
            case 'mins':
                unit = 'minutes';
            break;
            case 'hours':
            case 'hour':
            case 'hr':
            case 'hrs':
            case 'h':
                unit = 'hours';
            break;
            case 'days':
            case 'day':
            case 'd':
                unit ='days';
            break;
        }

        setFrequencyUnit(unit);
    }

    function updateFrequency(frequency: string) {
        matchDefaultFrequencyValue(frequency);
        matchDefaultFrequencyUnit(frequency);
    }

    const downloadFlow = async () => {
        setIsDownloading(true);
        const flowObject = flows[integration] as Flow;

        const flowInfo = {
            name: selectedFlowName,
            provider: integration,
            is_public: true,
            public_route: flowObject.rawName || integration
        };

        const response = await fetch('/api/v1/flow/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(flowInfo)
        });

        if (response.status !== 200) {
            const error = await response.json();
            toast.error(error.error, {
                position: toast.POSITION.BOTTOM_CENTER
            });
            setIsDownloading(false);
            return;
        } else {
            toast.success('Integration files downloaded successfully', {
                position: toast.POSITION.BOTTOM_CENTER
            });
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'nango-integrations.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsDownloading(false);
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Syncs}>
            {flows && Object.keys(flows).length > 0 && (
                <div className="mx-auto pb-40">
                    <h2 className="mx-20 mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Add New Sync or Action</h2>
                    <div className="mx-20 h-fit text-white text-sm">
                        <div className="mb-8">
                            <Info>
                                If none of the available templates fit your specific needs, you can create your own <a href={`https://docs.nango.dev/guides/${flow?.type === 'sync' ? 'sync' : 'actions'}`} className="text-[#4E80EE]" rel="noreferrer" target="_blank">custom {flow?.type || 'sync' }s</a>,
                                or request that we build them for you by reaching out on our <a href="https://nango.dev/slack" className="text-[#4E80EE]" rel="noreferrer" target="_blank">community</a>.
                            </Info>
                        </div>
                        <form className="space-y-6" onSubmit={handleSave} autoComplete="off">
                            <div>
                                <div>
                                    <div className="flex">
                                        <label htmlFor="integration" className="text-text-light-gray block text-sm font-semibold">
                                            Provider
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
                                            Template
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
                                                <option key={index} value={flowName}>{flowName} ({(possibleFlowsFromSelection[index]?.type) as unknown as string === 'action' ? 'action' : 'sync'})</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            {flow?.description && (
                                <div>
                                    <div className="flex">
                                        <label htmlFor="flow-name" className="text-text-light-gray block text-sm font-semibold">
                                            Description
                                        </label>
                                    </div>
                                    <div className="mt-1">
                                        <span className="text-text-light-gray">{flow?.description}</span>
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
                                            <div className="flex">
                                                <input
                                                    id="frequency"
                                                    name="frequency"
                                                    type="number"
                                                    className="border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                                                    value={frequencyValue}
                                                    onChange={(e) => setFrequencyValue(Number(e.target.value))}
                                                />
                                                <select
                                                    id="frequency-unit"
                                                    name="frequency-unit"
                                                    className="ml-4 border-border-gray bg-bg-black text-text-light-gray block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base shadow-sm active:outline-none focus:outline-none active:border-white focus:border-white"
                                                    value={frequencyUnit}
                                                    onChange={(e) => setFrequencyUnit(e.target.value)}
                                                >
                                                    <option value="minutes">{frequencyValue === 1 ? 'Minute' : 'Minutes'}</option>
                                                    <option value="hours">{frequencyValue === 1 ? 'Hour' : 'Hours'}</option>
                                                    <option value="days">{frequencyValue === 1 ? 'Day' : 'Days'}</option>
                                                </select>
                                            </div>
                                        </div>
                                        {showFrequencyError && (
                                            <span className="block text-red-500">Frequency cannot be less than 5 minutes</span>
                                        )}
                                    </div>
                                </div>
                            )}
                            {flow?.type !== 'action' && (
                                <div>
                                    <div>
                                        <div className="flex">
                                            <label htmlFor="flow-name" className="text-text-light-gray block text-sm font-semibold">
                                                Auto Starts
                                            </label>
                                        </div>
                                        <div className="mt-1">
                                            <span className="text-white">{flow?.auto_start === false ? 'No' : 'Yes'}</span>
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
                            <div className="flex flex-col">
                                <div className="flex flex-row items-center">
                                {canAdd !== false && (
                                    <button type="submit" className="bg-white h-8 rounded-md hover:bg-gray-300 border px-3 pt-0.5 text-sm text-black mr-4">
                                        Add {flow?.type === 'action' ? 'Action' : 'Sync'}
                                    </button>
                                )}
                                <Button type="button" variant="secondary" onClick={downloadFlow}>Download</Button>
                                {isDownloading && (
                                    <span className="ml-4"><Spinner size={2} /></span>
                                )}
                                </div>
                                {!canAdd && (
                                    <span className="flex flex-col mt-2 text-red-500">This flow has already been added!</span>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
