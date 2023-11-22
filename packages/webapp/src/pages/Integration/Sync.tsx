import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ChevronDownIcon, ChevronUpIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { Prism } from '@mantine/prism';

import {
    useGetProjectInfoAPI,
    useGetSyncDetailsAPI
} from '../../utils/api';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import DashboardLayout from '../../layout/DashboardLayout';
import Button from '../../components/ui/button/Button';
import CopyButton from '../../components/ui/button/CopyButton';
import { FlowConfiguration } from './Show';
import type { Flow } from '../../types';
import EndpointLabel from './components/EndpointLabel';
import Info from '../../components/ui/Info'
import { parseInput, generateResponseModel, formatDateToShortUSFormat } from '../../utils/utils';
import EnableDisableSync from './components/EnableDisableSync';
import { autoStartSnippet, setMetadaSnippet } from '../../utils/language-snippets';

export default function ShowIntegration() {
    const [accountLoaded, setAccountLoaded] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [syncConfig, setSyncConfig] = useState<FlowConfiguration | null>(null);
    const [secretKey, setSecretKey] = useState('');
    const [sync, setSync] = useState<Flow | null>(null);
    const [showMetadataCode, setShowMetadataCode] = useState(false);
    const [showAutoStartCode, setShowAutoStartCode] = useState(false);
    const [provider, setProvider] = useState('');
    const { providerConfigKey, syncName } = useParams();
    const getSyncDetailsAPI = useGetSyncDetailsAPI();
    const getProjectInfoAPI = useGetProjectInfoAPI()

    useEffect(() => {
        const getAccount = async () => {
            let res = await getProjectInfoAPI();

            if (res?.status === 200) {
                const account = (await res.json())['account'];
                setSecretKey(account.secret_key);
            }
        };

        if (!loaded) {
            setAccountLoaded(true);
            getAccount();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountLoaded, setLoaded, getProjectInfoAPI, setSecretKey]);

    useEffect(() => {
        const getSync = async () => {
            if (providerConfigKey && syncName) {
                let res = await getSyncDetailsAPI(providerConfigKey, syncName);
                if (res?.status === 200) {
                    const data = await res.json();

                    setProvider(data.provider);

                    if (data.sync) {
                        setSyncConfig(data.sync);
                        setSync(data.sync.syncs[0]);
                    } else {
                        setSyncConfig(data.unEnabledSync)
                        setSync(data.unEnabledSync.syncs[0]);
                    }
                }
            }
        };

        if (!loaded) {
            setLoaded(true);
            getSync();
        }
    }, [providerConfigKey, getSyncDetailsAPI, syncName, loaded, setLoaded]);

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
            {provider && (
                <div className="mx-auto space-y-12 text-sm">
                    <div className="flex mx-20 mt-12">
                        <img src={`/images/template-logos/${provider}.svg`} alt="" className="h-24 w-24" />
                        <div className="mt-3 ml-6">
                            <span className="text-left text-2xl font-semibold tracking-tight text-gray-400 mb-12">
                                Sync
                            </span>
                            <h2 className="text-left text-3xl font-semibold tracking-tight text-white mb-12">
                                {sync?.name}
                            </h2>
                        </div>
                    </div>
                    <div className="mx-20 flex flex-col">
                        <span className="text-gray-400 text-xs uppercase mb-1">Description</span>
                        <div className="text-white">
                            {sync?.description}
                        </div>
                    </div>
                    <div className="mx-20 flex">
                        <div className="flex flex-col w-1/2">
                            <span className="text-gray-400 text-xs uppercase mb-1">Enabled</span>
                                <EnableDisableSync
                                    flow={sync as Flow}
                                    provider={provider}
                                    setLoaded={setLoaded}
                                    rawName={syncConfig?.rawName}
                                />
                        </div>
                        <div className="flex flex-col w-1/2">
                            <span className="text-gray-400 text-xs uppercase mb-1">Endpoints</span>
                            {sync?.endpoints.map((endpoint, index) => (
                                <div key={index} className="flex flex-col space-y-2">
                                    <EndpointLabel endpoint={endpoint} type={sync.type} />
                                </div>
                            ))}
                        </div>
                    </div>
                    {(sync?.version || sync?.last_deployed) && (
                        <div className="mx-20 flex">
                            {sync?.version &&  (
                                <div className="flex flex-col w-1/2">
                                    <span className="text-gray-400 text-xs uppercase mb-1">Version</span>
                                    <span className="text-white">{sync?.version}</span>
                                </div>
                            )}
                            {sync?.last_deployed && (
                                <div className="flex flex-col w-1/2">
                                    <span className="text-gray-400 text-xs uppercase mb-1">Last Deployed</span>
                                    <div className="text-white">{formatDateToShortUSFormat(sync?.last_deployed as string)}</div>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="mx-20 flex">
                        <div className="flex flex-col w-1/2">
                            <span className="text-gray-400 text-xs uppercase mb-1">Source</span>
                            <div className="text-white">
                                {sync?.is_public ? 'Public' :
                                    sync?.pre_built ? 'Managed' :
                                    'Custom'}
                            </div>
                        </div>
                        <div className="flex flex-col w-1/2">
                            <span className="text-gray-400 text-xs uppercase mb-1">Type</span>
                            <div className="text-white">
                                {sync?.sync_type === 'FULL' ? 'Full Refresh' : 'Incremental'}
                            </div>
                        </div>
                    </div>
                    <div className="mx-20 flex">
                        <div className="flex flex-col w-1/2">
                            <span className="text-gray-400 text-xs uppercase mb-1">Frequency</span>
                            <div className="flex text-white space-x-3">
                                <span>{sync?.runs}</span>
                                <PencilSquareIcon className="flex h-5 w-5 cursor-pointer" />
                            </div>
                        </div>
                        <div className="flex flex-col w-1/2">
                            <span className="text-gray-400 text-xs uppercase mb-1">Track Deletes</span>
                            <div className="text-white">
                                {sync?.track_deletes === true ? 'Yes' : 'No'}
                            </div>
                        </div>
                    </div>
                    {(!sync?.input || Object.keys(sync?.input).length === 0) ? (
                        <div className="mx-20 flex">
                            <div className="flex flex-col">
                                <span className="text-gray-400 text-xs uppercase mb-1">Metadata</span>
                                <div className="text-white">
                                    No
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mx-20 flex">
                            <div className="flex flex-col w-full">
                                <span className="text-gray-400 text-xs uppercase mb-2">Metadata</span>
                                <div className="text-sm w-full">
                                    <Info size={16} verticallyCenter={false}>
                                        <span>To use this sync, programmatically add metadata on each connection.</span>
                                        <div className="flex w-[700px] cursor-pointer" onClick={() => setShowMetadataCode(!showMetadataCode)}>
                                            <div className="flex-col items-center mt-4 border border-blue-400 border-opacity-50 rounded px-2 py-2 -ml-8 w-full">
                                                <div className="flex">
                                                    {showMetadataCode ? <ChevronDownIcon className="flex h-5 w-5 text-blue-400 text-opacity-50" /> : <ChevronUpIcon className="flex h-5 w-5 text-blue-400 text-opacity-50 cursor-pointer" /> }
                                                    <span className="ml-2 text-blue-400 text-opacity-50">{showMetadataCode ? 'Hide Code' : 'Show Code'}</span>
                                                </div>
                                                {showMetadataCode && (
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
                                                            <CopyButton dark text={setMetadaSnippet(secretKey, providerConfigKey as string, parseInput(sync) as Record<string, any>)} />
                                                        </div>
                                                        <Prism
                                                            noCopy
                                                            language="typescript"
                                                            className="p-1 transparent-code"
                                                            colorScheme="dark"
                                                        >
                                                            {setMetadaSnippet(secretKey, providerConfigKey as string, parseInput(sync) as Record<string, any>)}
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
                    {(sync?.auto_start === true) ? (
                        <div className="mx-20 flex">
                            <div className="flex flex-col">
                                <span className="text-gray-400 text-xs uppercase mb-1">Auto Starts</span>
                                <div className="text-white">
                                    No
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mx-20 flex">
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
                                                            <CopyButton dark text={autoStartSnippet(secretKey, providerConfigKey as string, sync?.name as string)} />
                                                        </div>
                                                        <Prism
                                                            noCopy
                                                            language="typescript"
                                                            className="p-1 transparent-code"
                                                            colorScheme="dark"
                                                        >
                                                            {autoStartSnippet(secretKey, providerConfigKey as string, sync?.name as string)}
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
                    {
                        sync?.returns && (
                            <div className="mx-20 flex">
                                <div className="flex flex-col w-full">
                                    <span className="text-gray-400 text-xs uppercase mb-2">Output Models</span>
                                    {((Array.isArray(sync?.returns as string[]) ? sync?.returns : [sync?.returns]) as string[]).map((model: string, index: number) => (
                                        <div key={index}>
                                            <span className="text-white">{model}</span>
                                            <div className="border border-border-gray rounded-md text-white text-sm py-2 mt-3">
                                                <div className="flex justify-between items-center px-4 py-4 border-b border-border-gray">
                                                    <div className="space-x-4">
                                                        <Button
                                                            type="button"
                                                            variant="black"
                                                            className="pointer-events-none"
                                                        >
                                                            JSON
                                                        </Button>
                                                    </div>
                                                    <CopyButton dark text={JSON.stringify([generateResponseModel(sync.models, model)], null, 2)} />
                                                </div>
                                                <Prism
                                                    noCopy
                                                    language="json"
                                                    className="p-3 transparent-code"
                                                    colorScheme="dark"
                                                >
                                                    {JSON.stringify([generateResponseModel(sync.models, model)], null, 2)}
                                                </Prism>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    }
                </div>
            )}
        </DashboardLayout>
    );
}
