import { toast } from 'react-toastify';
import useSWR from 'swr'
import { Loading } from '@geist-ui/core';
import { useState } from 'react';
import { CodeBracketIcon, ChevronDownIcon, ChevronUpIcon, PencilSquareIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { Prism } from '@mantine/prism';
import { useModal } from '@geist-ui/core';

import { useUpdateSyncFrequency } from '../../utils/api';
import Button from '../../components/ui/button/Button';
import { requestErrorToast } from '../../utils/api';
import CopyButton from '../../components/ui/button/CopyButton';
import Spinner from '../../components/ui/Spinner';
import { FlowConfiguration, EndpointResponse, Tabs, SubTabs } from './Show';
import type { IntegrationConfig, Account, Flow, Connection } from '../../types';
import EndpointLabel from './components/EndpointLabel';
import ActionModal from '../../components/ui/ActionModal';
import Info from '../../components/ui/Info'
import { parseInput, generateResponseModel, formatDateToShortUSFormat } from '../../utils/utils';
import EnableDisableSync from './components/EnableDisableSync';
import { autoStartSnippet, setMetadaSnippet } from '../../utils/language-snippets';

interface FlowPageProps {
    account: Account;
    integration: IntegrationConfig;
    flow: Flow | null;
    flowConfig: FlowConfiguration | null;
    reload: () => void;
    endpoints: EndpointResponse;
    setFlow: (flow: Flow) => void;
    setActiveTab: (tab: Tabs) => void;
    setSubTab: (tab: SubTabs) => void;
}

export default function FlowPage(props: FlowPageProps) {
    const { account, integration, flow, flowConfig, reload, endpoints, setFlow, setActiveTab, setSubTab } = props;
    const { data: connections, error } = useSWR<Connection[]>(`/api/v1/integration/${integration.unique_key}/connections`);

    if (error) {
        requestErrorToast();
    }

    const [showMetadataCode, setShowMetadataCode] = useState(false);
    const [showAutoStartCode, setShowAutoStartCode] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isEnabling, setIsEnabling] = useState(false);
    const updateSyncFrequency = useUpdateSyncFrequency();
    const { setVisible, bindings } = useModal();

    const [modalTitle, setModalTitle] = useState('');
    const [modalContent, setModalContent] = useState<string | React.ReactNode>('');
    const [modalAction, setModalAction] = useState<(() => void) | null>(null);
    const [modalShowSpinner, setModalShowSpinner] = useState(false);
    const [modalTitleColor,] = useState('text-white');

    const [showFrequencyEditMenu, setShowFrequencyEditMenu] = useState(false);
    const [frequencyEdit, setFrequencyEdit] = useState('');

    const downloadFlow = async () => {
        setIsDownloading(true);
        const flowInfo = {
            name: flow?.name,
            provider: integration.provider,
            is_public: true,
            public_route: flowConfig?.rawName || integration.provider
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

    const editFrequency = () => {
        if (!flow?.version) {
            setModalTitle('Cannot edit sync frequency');
            setModalContent('The sync frequency cannot be edited unless the sync is enabled.');
            setVisible(true);
            return;
        }

        if (!flow.is_public) {
            setModalTitle('Cannot edit frequency for custom syncs');
            setModalContent('If you want to edit the frequency of this sync, edit it in your `nango.yaml` configuration file.');
            setVisible(true);
            return;
        }

        setShowFrequencyEditMenu(true);
    };

    const onSaveFrequency = async () => {
        // just in case they included every
        const frequencyWithoutEvery = frequencyEdit.replace('every ', '');
        const frequencyWithoutNumber = frequencyWithoutEvery.replace(/\d+/g, '');
        const frequencyUnit = frequencyWithoutNumber.replace(/\s/g, '');

        let unit = '';

        switch (frequencyUnit) {
            case 'minutes':
            case 'minute':
            case 'min':
            case 'mins':
            case 'm':
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

        if (unit === 'minutes' && parseInt(frequencyWithoutEvery) < 5) {
            setModalTitle('Invalid frequency');
            setModalContent('The minimum frequency is 5 minutes.');
            setVisible(true);
            return;
        }

        if (unit === '') {
            setModalTitle('Invalid frequency unit');
            setModalContent(`The unit "${frequencyUnit}" is not a valid time unit. Valid units are minutes, hours, and days.`);
            setVisible(true);
            return;
        }

        setModalTitle('Edit sync frequency?');
        setModalContent('This will affect potential many connections. Increased frequencies can increase your billing.');
        setVisible(true);

        setModalAction(() => async () => {
            setModalShowSpinner(true);
            await updateSyncFrequency(flow?.id as number, frequencyWithoutEvery);
            setModalShowSpinner(false);
            setShowFrequencyEditMenu(false);
            setVisible(false);
            reload();
            setFlow({
                ...flow,
                runs: `every ${frequencyWithoutEvery}`
            } as Flow);
        });
    };

    if (!flow) {
        return (
            <Loading spaceRatio={2.5} className="-top-36" />
        );
    }

    const routeToReference = () => {
        setActiveTab(Tabs.API);
        setSubTab(SubTabs.Reference);
    };

    return (
                <>
            <ActionModal
                bindings={bindings}
                modalTitle={modalTitle}
                modalContent={modalContent}
                modalAction={modalAction}
                modalShowSpinner={modalShowSpinner}
                modalTitleColor={modalTitleColor}
                setVisible={setVisible}
            />
                <div className="mx-auto space-y-10 text-sm">
                    <div className="flex justify-between">
                        <div className="flex">
                            <div className="mt-3">
                                <span className="text-left text-base font-semibold tracking-tight text-gray-400 mb-12">
                                    {flow?.type?.charAt(0)?.toUpperCase() + flow?.type?.slice(1)} Script
                                </span>
                                <h2 className="text-left text-[28px] font-semibold tracking-tight text-white mb-12">
                                    {flow?.name}
                                </h2>
                            </div>
                        </div>
                        <div className="flex items-center">
                            <Button variant="zinc" disabled={isDownloading} size="sm" onClick={() => downloadFlow()}>
                                <CodeBracketIcon className="flex h-5 w-5 cursor-pointer" />
                                {!isDownloading ? 'Download Code' : 'Downloading'}
                                {isDownloading && (
                                    <Spinner size={1} />
                                )}
                            </Button>
                        </div>
                    </div>
                    {flow.is_public && (
                        <div className="my-1">
                            <Info size={18} padding="px-4 py-1.5">
                                This script originates from a template made public by Nango. Templates are intended as a starting point and can easily be customized <a href="https://docs.nango.dev/customize/guides/extend-an-integration-template" target="_blank" className="text-white underline" rel="noreferrer">(learn more)</a>.
                            </Info>
                        </div>
                    )}
                    {flow?.nango_yaml_version === 'v1' && (
                        <div className="my-5">
                            <Info size={18} padding="px-4 py-1.5">
                                This {flow?.type} is using the legacy nango.yaml schema. <a href="https://docs.nango.dev/customize/guides/advanced/migrate-integration-configuration" target="_blank" className="text-white underline" rel="noreferrer">Migrate to the new schema</a> to unlock capabilities, including auto-generated API documentation.
                            </Info>
                        </div>
                    )}
                    {flow?.description && (
                        <div className="flex flex-col">
                            <span className="text-gray-400 text-xs uppercase mb-1">Description</span>
                            <div className="text-white">
                                {flow?.description}
                            </div>
                        </div>
                    )}
                    <div className="flex">
                        <div className="flex flex-col w-1/2">
                            <span className="text-gray-400 text-xs uppercase mb-1">Enabled</span>
                            {connections && (
                                <span className="flex">
                                    <EnableDisableSync
                                        flow={flow as Flow}
                                        provider={integration.provider}
                                        providerConfigKey={integration.unique_key}
                                        reload={reload}
                                        rawName={flowConfig?.rawName}
                                        connections={connections}
                                        endpoints={endpoints}
                                        setFlow={setFlow}
                                        setIsEnabling={setIsEnabling}
                                    />
                                    {flow.type === 'action' && isEnabling && (
                                        <span className="ml-2">
                                            <Spinner size={1} />
                                        </span>
                                    )}
                                </span>
                            )}
                        </div>
                        <div className="flex flex-col w-1/2">
                            <span className="text-gray-400 text-xs uppercase mb-1">Endpoints</span>
                            {flow?.endpoints.map((endpoint, index) => (
                                <div key={index} onClick={routeToReference} className="flex flex-col space-y-2 cursor-pointer">
                                    <EndpointLabel endpoint={endpoint} type={flow.type} />
                                </div>
                            ))}
                        </div>
                    </div>
                    {(flow?.version || flow?.last_deployed) && (
                        <div className="flex">
                            {flow?.version &&  (
                                <div className="flex flex-col w-1/2">
                                    <span className="text-gray-400 text-xs uppercase mb-1">Version</span>
                                    <span className="text-white">{flow?.version}</span>
                                </div>
                            )}
                            {flow?.last_deployed && (
                                <div className="flex flex-col w-1/2">
                                    <span className="text-gray-400 text-xs uppercase mb-1">Last Deployed</span>
                                    <div className="text-white">{formatDateToShortUSFormat(flow?.last_deployed as string)}</div>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="flex">
                        <div className="flex flex-col w-1/2">
                            <span className="text-gray-400 text-xs uppercase mb-1">Source</span>
                            <div className="text-white">
                                {flow?.is_public ? 'Template' : 'Custom'}
                            </div>
                        </div>
                        {flow?.sync_type && (
                            <div className="flex flex-col w-1/2">
                                <span className="text-gray-400 text-xs uppercase mb-1">Type</span>
                                <div className="text-white">
                                    {flow?.sync_type === 'FULL' ? 'Full Refresh' : 'Incremental'}
                                </div>
                            </div>
                        )}
                    </div>
                    {flow?.type === 'sync' && (
                        <div className="flex">
                            <div className="flex flex-col w-1/2 relative">
                                <span className="text-gray-400 text-xs uppercase mb-1">Frequency</span>
                                <div className="w-2/3">
                                    <div className="flex text-white space-x-3">
                                        {showFrequencyEditMenu ? (
                                            <>
                                                <input value={frequencyEdit}
                                                    onChange={(e) => setFrequencyEdit(e.target.value)}
                                                    className="bg-active-gray w-full text-white rounded-md px-3 py-0.5 mt-0.5 focus:border-white"
                                                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                                        console.log(e.key)
                                                        if (e.key === 'Enter') {
                                                            onSaveFrequency();
                                                        }
                                                    }}
                                                />
                                                <XCircleIcon className="flex h-5 w-5 text-red-400 cursor-pointer hover:text-red-700" onClick={() => setShowFrequencyEditMenu(false)} />
                                            </>
                                        ) : (
                                            <>
                                                <span>{flow?.runs}</span>
                                                <PencilSquareIcon className="flex h-5 w-5 cursor-pointer hover:text-zinc-400" onClick={() => editFrequency()} />
                                            </>
                                        )}
                                    </div>
                                    {showFrequencyEditMenu && frequencyEdit && (
                                        <div className="flex items-center border border-border-gray bg-active-gray text-white rounded-md px-3 py-0.5 mt-0.5 cursor-pointer">
                                            <PencilSquareIcon className="flex h-5 w-5 cursor-pointer hover:text-zinc-400" onClick={() => editFrequency()} />
                                            <span className="mt-0.5 cursor-pointer ml-1" onClick={() => onSaveFrequency()}>Change frequency to: {frequencyEdit}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col w-1/2">
                                <span className="text-gray-400 text-xs uppercase mb-1">Track Deletes</span>
                                <div className="text-white">
                                    {flow?.track_deletes === true ? 'Yes' : 'No'}
                                </div>
                            </div>
                        </div>
                    )}
                    {flow?.type === 'sync' && flow?.webhookSubscriptions?.length > 0 && (
                        <div className="flex">
                            <div className="flex flex-col w-1/2 relative">
                                <span className="text-gray-400 text-xs uppercase mb-1">Webhook Subscriptions</span>
                                <div className="text-white">
                                    {flow.webhookSubscriptions.join(', ')}
                                </div>
                            </div>
                        </div>
                    )}
                    {flow?.type === 'sync' && (
                        <>
                            {(!flow?.input || Object.keys(flow?.input).length === 0) ? (
                                <div className="flex">
                                    <div className="flex flex-col">
                                        <span className="text-gray-400 text-xs uppercase mb-1">Metadata</span>
                                        <div className="text-white">
                                            No
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex">
                                    <div className="flex flex-col w-full">
                                        <span className="text-gray-400 text-xs uppercase mb-2">Metadata</span>
                                        <div className="text-sm w-full text-[#C3E5FA]">
                                            <Info size={16} verticallyCenter={false}>
                                                <span>To use this sync, programmatically add metadata on each connection.</span>
                                                <div className="flex w-[700px] cursor-pointer" onClick={() => setShowMetadataCode(!showMetadataCode)}>
                                                    <div className="flex-col items-center mt-4 border border-blue-400 border-opacity-50 rounded px-2 py-2 -ml-8 w-full">
                                                        <div className="flex">
                                                            {showMetadataCode ? <ChevronDownIcon className="flex h-5 w-5 text-blue-400 text-opacity-50" /> : <ChevronUpIcon className="flex h-5 w-5 text-blue-400 text-opacity-50 cursor-pointer" /> }
                                                            <span className="ml-2 text-blue-400 text-opacity-50">{showMetadataCode ? 'Hide Code' : 'Show Code'}</span>
                                                        </div>
                                                        {showMetadataCode && (
                                                            <div className="border-opacity-50 rounded-md text-white text-sm py-2 mt-3">
                                                                <div className="flex justify-between items-center px-4 py-2 border-b border-border-blue-400">
                                                                    <div className="space-x-4">
                                                                        <Button
                                                                            type="button"
                                                                            variant="black"
                                                                            className="pointer-events-none"
                                                                        >
                                                                            Node
                                                                        </Button>
                                                                    </div>
                                                                    <CopyButton dark text={setMetadaSnippet(account.secret_key, integration.unique_key, parseInput(flow) as Record<string, any>)} />
                                                                </div>
                                                                <Prism
                                                                    noCopy
                                                                    language="typescript"
                                                                    className="p-1 transparent-code"
                                                                    colorScheme="dark"
                                                                >
                                                                    {setMetadaSnippet(account.secret_key, integration.unique_key, parseInput(flow) as Record<string, any>)}
                                                                </Prism>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </Info>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    {flow?.type === 'sync' && (
                        <>
                            {(flow?.auto_start === true) ? (
                                <div className="flex">
                                    <div className="flex flex-col">
                                        <span className="text-gray-400 text-xs uppercase mb-1">Auto Starts</span>
                                        <div className="text-white">
                                            No
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex">
                                    <div className="flex flex-col w-full">
                                        <span className="text-gray-400 text-xs uppercase mb-2">Auto Starts</span>
                                        <div className="text-sm w-full">
                                            <Info size={18} verticallyCenter={false}>
                                                <span>To use this sync, programmatically start the sync for each connection.</span>
                                                <div className="flex w-[700px] cursor-pointer" onClick={() => setShowAutoStartCode(!showAutoStartCode)}>
                                                    <div className="flex-col items-center mt-4 border border-blue-400 border-opacity-50 rounded px-2 py-2 -ml-8 w-full">
                                                        <div className="flex">
                                                            {showAutoStartCode ? <ChevronDownIcon className="flex h-5 w-5 text-blue-400 text-opacity-50" /> : <ChevronUpIcon className="flex h-5 w-5 text-blue-400 text-opacity-50 cursor-pointer" /> }
                                                            <span className="ml-2 text-blue-400 text-opacity-50">{showAutoStartCode ? 'Hide Code' : 'Show Code'}</span>
                                                        </div>
                                                        {showAutoStartCode && (
                                                            <div className="border border-blue-400 border-opacity-50 rounded-md text-white text-sm py-2 mt-3">
                                                                <div className="flex justify-between items-center px-4 py-4 border-b border-border-blue-400">
                                                                    <div className="space-x-4">
                                                                        <Button
                                                                            type="button"
                                                                            variant="black"
                                                                            className="pointer-events-none"
                                                                        >
                                                                            Node
                                                                        </Button>
                                                                    </div>
                                                                    <CopyButton dark text={autoStartSnippet(account.secret_key, integration.unique_key, flow?.name as string)} />
                                                                </div>
                                                                <Prism
                                                                    noCopy
                                                                    language="typescript"
                                                                    className="p-1 transparent-code"
                                                                    colorScheme="dark"
                                                                >
                                                                    {autoStartSnippet(account.secret_key, integration.unique_key, flow?.name as string)}
                                                                </Prism>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </Info>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    {flow?.type === 'sync' && (
                        <>
                            {flow?.returns && (
                                <div className="flex">
                                    <div className="flex flex-col w-full">
                                        <span className="text-gray-400 text-xs uppercase mb-2">Output Models</span>
                                        {((Array.isArray(flow?.returns as string[]) ? flow?.returns : [flow?.returns]) as string[]).map((model: string, index: number) => (
                                            <div key={index}>
                                                <span className="text-white">{model}</span>
                                                <div className="border border-border-gray rounded-md text-white text-sm mt-3">
                                                    <div className="flex justify-between items-center px-4 py-3 border-b border-border-gray">
                                                        <div className="flex items-center space-x-4">
                                                            <Button
                                                                type="button"
                                                                variant="active"
                                                                className="pointer-events-none"
                                                            >
                                                                JSON
                                                            </Button>
                                                        </div>
                                                        <CopyButton dark text={JSON.stringify([generateResponseModel(flow.models, model, true)], null, 2)} />
                                                    </div>
                                                    <Prism
                                                        noCopy
                                                        language="json"
                                                        className="p-3 transparent-code"
                                                        colorScheme="dark"
                                                    >
                                                        {JSON.stringify({"records": [generateResponseModel(flow.models, model, true)], "next_cursor": 'MjAyMy0xMS0xN1QxMTo0NzoxNC40NDcrMDI6MDB8fDAz...'}, null, 2)}
                                                    </Prism>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
                </>
    );
}
