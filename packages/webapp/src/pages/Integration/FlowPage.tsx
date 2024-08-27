import { toast } from 'react-toastify';
import useSWR from 'swr';
import { Loading } from '@geist-ui/core';
import { useEffect, useState } from 'react';
import { CodeBracketIcon, ChevronDownIcon, ChevronUpIcon, PencilSquareIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { CheckCircledIcon } from '@radix-ui/react-icons';
import { Prism } from '@mantine/prism';
import type { EnvironmentAndAccount } from '@nangohq/server';

import { useUpdateSyncFrequency, requestErrorToast, apiFetch } from '../../utils/api';
import type { ButtonVariants } from '../../components/ui/button/Button';
import Button from '../../components/ui/button/Button';
import { CopyButton } from '../../components/ui/button/CopyButton';
import Spinner from '../../components/ui/Spinner';
import type { FlowConfiguration, EndpointResponse } from './Show';
import { Tabs, SubTabs } from './Show';
import type { IntegrationConfig, Flow, Connection } from '../../types';
import EndpointLabel from './components/EndpointLabel';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '../../components/ui/Dialog';
import Info from '../../components/ui/Info';
import { formatDateToShortUSFormat, githubIntegrationTemplates } from '../../utils/utils';
import EnableDisableSync from './components/EnableDisableSync';
import { autoStartSnippet, setMetadataSnippet } from '../../utils/language-snippets';
import { useStore } from '../../store';
import { getSyncResponse } from '../../utils/scripts';
import type { SyncTypeLiteral, NangoModel, PutUpgradePreBuiltFlow } from '@nangohq/types';

interface FlowPageProps {
    environment: EnvironmentAndAccount['environment'];
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
    const { environment, integration, flow, flowConfig, reload, endpoints, setFlow, setActiveTab, setSubTab } = props;
    const env = useStore((state) => state.env);
    const { data: connections, error } = useSWR<Connection[]>(`/api/v1/integration/${integration.unique_key}/connections?env=${env}`);

    const [showMetadataCode, setShowMetadataCode] = useState(false);
    const [showAutoStartCode, setShowAutoStartCode] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isEnabling, setIsEnabling] = useState(false);
    const updateSyncFrequency = useUpdateSyncFrequency(env);

    const [modalVisible, setModalVisible] = useState(false);
    const [modalTitle, setModalTitle] = useState('');
    const [modalContent, setModalContent] = useState<string | React.ReactNode>('');
    const [modalAction, setModalAction] = useState<(() => Promise<void>) | null>(null);
    const [modalConfirmationButton, setModalConfirmationButton] = useState<ButtonVariants>('black');
    const [modalSpinner, setModalSpinner] = useState(false);

    const [showFrequencyEditMenu, setShowFrequencyEditMenu] = useState(false);
    const [frequencyEdit, setFrequencyEdit] = useState('');

    useEffect(() => {
        if (error) {
            requestErrorToast();
        }
    }, [error]);

    /*
     * If the flow is enabled then we need to make sure to assign
     * the updated ID to the flow object. This covers the scenario of a user
     * enabled a flow, then disables it
     */
    useEffect(() => {
        if (!endpoints.allFlows) {
            return;
        }

        const { syncs, actions } = endpoints.allFlows;

        if (flow?.type === 'sync') {
            const sync = syncs.find((sync: Flow) => sync.name === flow.name);
            if (sync) {
                setFlow({
                    ...flow,
                    id: sync.id,
                    enabled: sync.enabled,
                    version: sync.version,
                    upgrade_version: sync.upgrade_version,
                    last_deployed: sync.last_deployed
                });
            }
        } else {
            const action = actions.find((action: Flow) => action.name === flow?.name);
            if (action) {
                setFlow({
                    ...(flow as Flow),
                    id: action.id,
                    enabled: action.enabled,
                    version: action.version,
                    upgrade_version: action.upgrade_version,
                    last_deployed: action.last_deployed
                });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(endpoints), setFlow]);

    const onScriptUprade = (flow: Flow) => {
        const { version: currentVersion, upgrade_version } = flow;
        setModalTitle('Upgrade with caution');
        setModalContent(
            <>
                You are about to upgrade from version {currentVersion} to{' '}
                <a
                    className="underline"
                    target="_blank"
                    rel="noreferrer"
                    href={`${githubIntegrationTemplates}/${integration.provider}/${flow.type}s/${flow.name}.ts`}
                >
                    {upgrade_version}
                </a>
                . The new integration will replace the old as soon as you upgrade. Major version changes indicate incompatible API modifications, possibly
                requiring changes to your code.
            </>
        );
        setModalConfirmationButton('danger');
        setModalVisible(true);
        setModalAction(() => async () => {
            setModalSpinner(true);
            await confirmVersionUpgrade();
            setModalSpinner(false);
        });
    };

    const downloadFlow = async () => {
        setIsDownloading(true);
        const flowInfo = {
            id: flow?.id,
            name: flow?.name,
            provider: integration.provider,
            is_public: flow?.is_public,
            public_route: flowConfig?.rawName || integration.provider,
            providerConfigKey: integration.unique_key,
            flowType: flow?.type
        };

        const response = await apiFetch(`/api/v1/flow/download?env=${env}`, {
            method: 'POST',
            body: JSON.stringify(flowInfo)
        });

        if (response.status !== 200) {
            const error = await response.json();
            setIsDownloading(false);
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
        const timestamp = Math.floor(new Date().getTime() / 1000).toString();
        link.href = url;
        link.download = `nango-integrations-${timestamp}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsDownloading(false);
    };

    const editFrequency = () => {
        if (!flow?.enabled) {
            setModalTitle('Cannot edit sync frequency');
            setModalContent('The sync frequency cannot be edited unless the sync is enabled.');
            setModalVisible(true);
            return;
        }

        if (!flow.is_public) {
            setModalTitle('Cannot edit frequency for custom syncs');
            setModalContent('If you want to edit the frequency of this sync, edit it in your `nango.yaml` configuration file.');
            setModalVisible(true);
            return;
        }

        setShowFrequencyEditMenu(true);
    };

    const onSaveFrequency = () => {
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
                unit = 'days';
                break;
        }

        setModalConfirmationButton('primary');

        if (unit === 'minutes' && parseInt(frequencyWithoutEvery) < 5) {
            setModalTitle('Invalid frequency');
            setModalContent('The minimum frequency is 5 minutes.');
            setModalVisible(true);
            return;
        }

        if (unit === '') {
            setModalTitle('Invalid frequency unit');
            setModalContent(`The unit "${frequencyUnit}" is not a valid time unit. Valid units are minutes, hours, and days.`);
            setModalVisible(true);
            return;
        }

        setModalTitle('Edit sync frequency?');
        setModalContent('This will affect potential many connections. Increased frequencies can increase your billing.');
        setModalVisible(true);

        setModalAction(() => async () => {
            setModalSpinner(true);
            await updateSyncFrequency(flow?.id as number, frequencyWithoutEvery);
            setModalSpinner(false);
            setShowFrequencyEditMenu(false);
            setModalVisible(false);
            reload();
            setFlow({
                ...flow,
                runs: `every ${frequencyWithoutEvery}`
            } as Flow);
        });
    };

    const confirmVersionUpgrade = async () => {
        setModalSpinner(true);
        if (!flow || !flow.id || !flow.upgrade_version) {
            toast.error('Unable to upgrade the script.', {
                position: toast.POSITION.BOTTOM_CENTER
            });
            return;
        }
        const upgradeFlow: PutUpgradePreBuiltFlow['Body'] = {
            id: flow.id,
            syncName: flow.name,
            providerConfigKey: integration.unique_key,
            fileBody: {
                js: '',
                ts: ''
            },
            upgrade_version: flow.upgrade_version,
            last_deployed: flow.last_deployed || '',
            metadata: {
                description: flow.description || '',
                scopes: flow.scopes || []
            },
            endpoints: flow.endpoints,
            is_public: true,
            type: flow.type,
            pre_built: true,
            sync_type: flow.sync_type?.toLowerCase() as SyncTypeLiteral,
            runs: flow.runs || '',
            models: flow.models.map((model) => model.name),
            model_schema: JSON.stringify(flow.models),
            webhookSubscriptions: flow.webhookSubscriptions,
            track_deletes: flow.track_deletes
        };

        const response = await apiFetch(`/api/v1/flow/pre-built/upgrade?env=${env}`, {
            method: 'PUT',
            body: JSON.stringify(upgradeFlow)
        });

        if (response.status !== 200) {
            const error = await response.json();
            toast.error(error.error.message, {
                position: toast.POSITION.BOTTOM_CENTER
            });
            return;
        }

        toast.success('Script upgraded successfully', {
            position: toast.POSITION.BOTTOM_CENTER
        });

        setModalSpinner(false);
        setModalVisible(false);
        reload();
    };

    if (error) {
        return <></>;
    }

    if (!flow) {
        return <Loading spaceRatio={2.5} className="-top-36" />;
    }

    const routeToReference = () => {
        setActiveTab(Tabs.API);
        setSubTab(SubTabs.Reference);
    };

    const onClickModalButton = async () => {
        setModalSpinner(true);
        if (modalAction) {
            await modalAction();
        }
        setModalSpinner(false);
    };

    return (
        <>
            <Dialog open={modalVisible} onOpenChange={setModalVisible}>
                <DialogContent>
                    <DialogTitle>{modalTitle}</DialogTitle>
                    <DialogDescription>{modalContent}</DialogDescription>

                    <DialogFooter>
                        <DialogClose asChild>
                            <Button className="!text-text-light-gray" variant="zombieGray">
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button type="submit" variant={modalConfirmationButton} disabled={modalSpinner} onClick={onClickModalButton} isLoading={modalSpinner}>
                            Upgrade
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <div className="mx-auto space-y-10 text-sm">
                <div className="flex justify-between">
                    <div className="flex">
                        <div className="mt-3">
                            <span className="text-left text-base font-semibold tracking-tight text-gray-400 mb-12">
                                {flow?.type?.charAt(0)?.toUpperCase() + flow?.type?.slice(1)} Script
                            </span>
                            <h2 className="text-left text-[28px] font-semibold tracking-tight text-white mb-12">{flow?.name}</h2>
                        </div>
                    </div>
                    <div className="flex items-center">
                        <Button variant="zinc" disabled={isDownloading} size="sm" onClick={() => downloadFlow()}>
                            <CodeBracketIcon className="flex h-5 w-5 cursor-pointer" />
                            {!isDownloading ? 'Download Code' : 'Downloading'}
                            {isDownloading && <Spinner size={1} />}
                        </Button>
                    </div>
                </div>
                {flow.is_public && (
                    <div className="my-1">
                        <Info size={18} padding="px-4 py-1.5">
                            This script originates from a template made public by Nango. Templates are intended as a starting point and can easily be customized{' '}
                            <a
                                href="https://docs.nango.dev/customize/guides/extend-an-integration-template"
                                target="_blank"
                                className="text-white underline"
                                rel="noreferrer"
                            >
                                (learn more)
                            </a>
                            .
                        </Info>
                    </div>
                )}
                {flow?.nango_yaml_version === 'v1' && (
                    <div className="my-5">
                        <Info size={18} padding="px-4 py-1.5">
                            This {flow?.type} is using the legacy nango.yaml schema.{' '}
                            <a
                                href="https://docs.nango.dev/customize/guides/advanced/migrate-integration-configuration"
                                target="_blank"
                                className="text-white underline"
                                rel="noreferrer"
                            >
                                Migrate to the new schema
                            </a>{' '}
                            to unlock capabilities, including auto-generated API documentation.
                        </Info>
                    </div>
                )}
                {flow.description && (
                    <div className="flex flex-col">
                        <span className="text-gray-400 text-xs uppercase mb-1">Description</span>
                        <div className="text-white">{flow?.description}</div>
                    </div>
                )}
                <div className="flex">
                    <div className="flex flex-col w-1/2">
                        <span className="text-gray-400 text-xs uppercase mb-1">Enabled</span>
                        {connections && (
                            <span className="flex">
                                <EnableDisableSync
                                    flow={flow}
                                    provider={integration.provider}
                                    providerConfigKey={integration.unique_key}
                                    reload={reload}
                                    rawName={flowConfig?.rawName}
                                    connections={connections}
                                    endpoints={endpoints}
                                    setIsEnabling={setIsEnabling}
                                />
                                {flow.type === 'action' && isEnabling && (
                                    <span className="ml-2">
                                        <Spinner size={1} />
                                    </span>
                                )}
                                {flow.is_public && (
                                    <div className="flex items-center">
                                        <span className="ml-2 text-white">
                                            Template version:{' '}
                                            {flow.upgrade_version ? (
                                                <span>v{flow.version || '0.0.1'}</span>
                                            ) : (
                                                <a
                                                    className="underline"
                                                    rel="noreferrer"
                                                    href={`${githubIntegrationTemplates}/${integration.provider}/${flow.type}s/${flow.name}.ts`}
                                                    target="_blank"
                                                >
                                                    v{flow.version || '0.0.1'}
                                                </a>
                                            )}
                                        </span>
                                        {flow.upgrade_version ? (
                                            <span className="flex items-center text-white mx-1">
                                                {' '}
                                                (latest:{' '}
                                                <a
                                                    target="_blank"
                                                    href={`${githubIntegrationTemplates}/${integration.provider}/${flow.type}s/${flow.name}.ts`}
                                                    rel="noreferrer"
                                                    className="underline ml-1"
                                                >
                                                    v{flow.upgrade_version}
                                                </a>
                                                )
                                                <Button
                                                    variant="black"
                                                    onClick={() => onScriptUprade(flow)}
                                                    size="sm"
                                                    className="ml-2 rounded-full h-6 px-2 bg-zinc-800 text-zinc-200"
                                                >
                                                    Upgrade Template
                                                </Button>
                                            </span>
                                        ) : (
                                            <span className="flex ml-2 gap-x-1 text-green-base">
                                                <CheckCircledIcon className="flex h-5 w-5" />
                                                Template up-to-date
                                            </span>
                                        )}
                                    </div>
                                )}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-col w-1/2">
                        <span className="text-gray-400 text-xs uppercase mb-1">Endpoints</span>
                        {flow.endpoints.map((endpoint, index) => (
                            <div key={index} onClick={routeToReference} className="flex flex-col space-y-2 cursor-pointer">
                                <EndpointLabel endpoint={endpoint} type={flow.type} />
                            </div>
                        ))}
                    </div>
                </div>
                {!flow.is_public && (flow.version || flow.last_deployed) && (
                    <div className="flex">
                        {flow?.version && (
                            <div className="flex flex-col w-1/2">
                                <span className="text-gray-400 text-xs uppercase mb-1">Version</span>
                                <span className="text-white">{flow?.version}</span>
                            </div>
                        )}
                        {flow?.last_deployed && (
                            <div className="flex flex-col w-1/2">
                                <span className="text-gray-400 text-xs uppercase mb-1">Last Deployed</span>
                                <div className="text-white">{formatDateToShortUSFormat(flow?.last_deployed)}</div>
                            </div>
                        )}
                    </div>
                )}
                <div className="flex">
                    <div className="flex flex-col w-1/2">
                        <span className="text-gray-400 text-xs uppercase mb-1">Source</span>
                        <div className="text-white">{flow?.is_public ? 'Template' : 'Custom'}</div>
                    </div>
                    {flow?.sync_type && (
                        <div className="flex flex-col w-1/2">
                            <span className="text-gray-400 text-xs uppercase mb-1">Type</span>
                            <div className="text-white">{flow?.sync_type.toUpperCase() === 'FULL' ? 'Full Refresh' : 'Incremental'}</div>
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
                                            <input
                                                value={frequencyEdit}
                                                onChange={(e) => setFrequencyEdit(e.target.value)}
                                                className="bg-active-gray w-full text-white rounded-md px-3 py-0.5 mt-0.5 focus:border-white"
                                                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                                                    if (e.key === 'Enter') {
                                                        onSaveFrequency();
                                                    }
                                                }}
                                            />
                                            <XCircleIcon
                                                className="flex h-5 w-5 text-red-400 cursor-pointer hover:text-red-700"
                                                onClick={() => setShowFrequencyEditMenu(false)}
                                            />
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
                                        <span className="mt-0.5 cursor-pointer ml-1" onClick={() => onSaveFrequency()}>
                                            Change frequency to: {frequencyEdit}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col w-1/2">
                            <span className="text-gray-400 text-xs uppercase mb-1">Track Deletes</span>
                            <div className="text-white">{flow?.track_deletes ? 'Yes' : 'No'}</div>
                        </div>
                    </div>
                )}
                {flow?.type === 'sync' && flow?.webhookSubscriptions?.length > 0 && (
                    <div className="flex">
                        <div className="flex flex-col w-1/2 relative">
                            <span className="text-gray-400 text-xs uppercase mb-1">Webhook Subscriptions</span>
                            <div className="text-white">{flow.webhookSubscriptions.join(', ')}</div>
                        </div>
                    </div>
                )}
                {flow?.type === 'sync' && (
                    <>
                        {!flow?.input || Object.keys(flow?.input).length === 0 ? (
                            <div className="flex">
                                <div className="flex flex-col">
                                    <span className="text-gray-400 text-xs uppercase mb-1">Metadata</span>
                                    <div className="text-white">No</div>
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
                                                        {showMetadataCode ? (
                                                            <ChevronDownIcon className="flex h-5 w-5 text-blue-400 text-opacity-50" />
                                                        ) : (
                                                            <ChevronUpIcon className="flex h-5 w-5 text-blue-400 text-opacity-50 cursor-pointer" />
                                                        )}
                                                        <span className="ml-2 text-blue-400 text-opacity-50">
                                                            {showMetadataCode ? 'Hide Code' : 'Show Code'}
                                                        </span>
                                                    </div>
                                                    {showMetadataCode && (
                                                        <div className="border-opacity-50 rounded-md text-white text-sm py-2 mt-3 bg-zinc-900">
                                                            <div className="flex justify-between items-center px-4 py-2 border-b border-border-blue-400">
                                                                <div className="space-x-4">
                                                                    <Button type="button" variant="black" className="pointer-events-none">
                                                                        Node
                                                                    </Button>
                                                                </div>
                                                                <CopyButton
                                                                    text={setMetadataSnippet(environment.secret_key, integration.unique_key, flow.input)}
                                                                />
                                                            </div>
                                                            <Prism noCopy language="typescript" className="p-1 transparent-code" colorScheme="dark">
                                                                {setMetadataSnippet(environment.secret_key, integration.unique_key, flow.input)}
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
                        {flow?.auto_start === true ? (
                            <div className="flex">
                                <div className="flex flex-col">
                                    <span className="text-gray-400 text-xs uppercase mb-1">Auto Starts</span>
                                    <div className="text-white">Yes</div>
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
                                                        {showAutoStartCode ? (
                                                            <ChevronDownIcon className="flex h-5 w-5 text-blue-400 text-opacity-50" />
                                                        ) : (
                                                            <ChevronUpIcon className="flex h-5 w-5 text-blue-400 text-opacity-50 cursor-pointer" />
                                                        )}
                                                        <span className="ml-2 text-blue-400 text-opacity-50">
                                                            {showAutoStartCode ? 'Hide Code' : 'Show Code'}
                                                        </span>
                                                    </div>
                                                    {showAutoStartCode && (
                                                        <div className="border border-blue-400 border-opacity-50 rounded-md text-white text-sm py-2 mt-3 bg-zinc-900">
                                                            <div className="flex justify-between items-center px-4 py-4 border-b border-border-blue-400">
                                                                <div className="space-x-4">
                                                                    <Button type="button" variant="black" className="pointer-events-none">
                                                                        Node
                                                                    </Button>
                                                                </div>
                                                                <CopyButton
                                                                    text={autoStartSnippet(environment.secret_key, integration.unique_key, flow?.name)}
                                                                />
                                                            </div>
                                                            <Prism noCopy language="typescript" className="p-1 transparent-code" colorScheme="dark">
                                                                {autoStartSnippet(environment.secret_key, integration.unique_key, flow?.name)}
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
                {flow?.type === 'sync' && flow.returns && (
                    <div className="flex">
                        <div className="flex flex-col w-full">
                            <span className="text-gray-400 text-xs uppercase mb-2">Output Models</span>
                            {(Array.isArray(flow.returns) ? flow.returns : [flow.returns]).map((model: string, index: number) => (
                                <div key={index}>
                                    <span className="text-white">{model}</span>
                                    <div className="border border-border-gray rounded-md text-white text-sm mt-3">
                                        <div className="flex justify-between items-center px-4 py-3 border-b border-border-gray">
                                            <div className="flex items-center space-x-4">
                                                <Button type="button" variant="active" className="pointer-events-none">
                                                    JSON
                                                </Button>
                                            </div>
                                        </div>
                                        <Prism noCopy language="json" className="p-3 transparent-code" colorScheme="dark">
                                            {getSyncResponse((flow.models as unknown as NangoModel[]).find((m) => m.name === model)!)}
                                        </Prism>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
