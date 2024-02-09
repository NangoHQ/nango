import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loading } from '@geist-ui/core';
import { useParams } from 'react-router-dom';
import { ArrowLeftIcon, AdjustmentsHorizontalIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { Prism } from '@mantine/prism';
import { defaultCallback } from '../../utils/utils';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import DashboardLayout from '../../layout/DashboardLayout';
import {
    useGetProjectInfoAPI,
    useGetIntegrationEndpointsAPI,
    useGetIntegrationDetailsAPI
} from '../../utils/api';
import Button from '../../components/ui/button/Button';
import CopyButton from '../../components/ui/button/CopyButton';
import Info from '../../components/ui/Info'
import EndpointLabel from './components/EndpointLabel';
import { NangoSyncModel, NangoSyncEndpoint, IntegrationConfig, FlowEndpoint, Flow, Account } from '../../types';
import { nodeSnippet, nodeActionSnippet, curlSnippet } from '../../utils/language-snippets';
import { parseEndpoint, parseInput, generateResponseModel } from '../../utils/utils';
import { useStore } from '../../store';

enum Language {
    Node = 0,
    cURL = 1,
    Python = 2,
    PHP = 3,
    Go = 4,
    Java = 5
}

export default function EndpointReference() {
    const [loaded, setLoaded] = useState(false);
    const [accountLoaded, setAccountLoaded] = useState(false);
    const [account, setAccount] = useState<Account>();
    const [showParametersOpen, setShowParametersOpen] = useState(false);
    const [activeFlow, setActiveFlow] = useState<Flow>();
    const [integration, setIntegration] = useState<IntegrationConfig | null>(null);
    const [language, setLanguage] = useState<Language>(Language.Node);
    const [syncSnippet, setSyncSnippet] = useState('');
    const [jsonResponseSnippet, setJsonResponseSnippet] = useState('');

    const getIntegrationDetailsAPI = useGetIntegrationDetailsAPI();
    const getEndpoints = useGetIntegrationEndpointsAPI();
    const getProjectInfoAPI = useGetProjectInfoAPI()

    const connectionId = '<CONNECTION-ID>';

    const env = useStore(state => state.cookieValue);
    const { providerConfigKey } = useParams();
    const location = useLocation();
    const basePath = `/${env}/integration/${providerConfigKey}/reference/`;
    const wildcardPath = location.pathname.replace(basePath, '');


    const navigate = useNavigate();

    useEffect(() => {
        const getProviders = async () => {
            if (providerConfigKey) {
                let res = await getIntegrationDetailsAPI(providerConfigKey);
                if (res?.status === 200) {
                    const data = await res.json();
                    const loadedIntegration = data['config'];
                    setIntegration(data['config']);
                    const endpointsRes = await getEndpoints(loadedIntegration.unique_key, loadedIntegration.provider);
                    if (endpointsRes?.status === 200) {
                        const endpointData = await endpointsRes.json();
                        const allFlows = [...endpointData?.enabledFlows?.syncs || [], ...endpointData?.enabledFlows?.actions || [], ...endpointData?.unEnabledFlows?.syncs || [], ...endpointData?.unEnabledFlows?.actions || []];
                        const currentFlow = allFlows.find((flow) => {
                            const endpoints = flow.endpoints;
                            for (const endpoint of endpoints) {
                                const endpointRoute = parseEndpoint(endpoint);
                                if (endpointRoute === `/${wildcardPath}`) {
                                    return true;
                                }
                            }
                            return false;
                        });
                        setActiveFlow(currentFlow);
                    }
                }
            }
        };

        if (!loaded) {
            setLoaded(true);
            getProviders();
        }
    }, [providerConfigKey, getIntegrationDetailsAPI, loaded, setLoaded, getEndpoints, account, integration?.unique_key, wildcardPath]);

    useEffect(() => {
        const getAccount = async () => {
            let res = await getProjectInfoAPI();

            if (res?.status === 200) {
                const account = (await res.json())['account'];
                setAccount({
                    ...account,
                    callback_url: account.callback_url || defaultCallback()
                });
            }
        };

        if (!accountLoaded) {
            setAccountLoaded(true);
            getAccount();
        }
    }, [accountLoaded, setAccountLoaded, getProjectInfoAPI, setAccount]);

    useEffect(() => {
        if (accountLoaded && loaded && activeFlow && account) {
            setSyncSnippet(
                activeFlow?.type === 'sync'
                    ? nodeSnippet(activeFlow?.models, account?.secret_key as string, connectionId, integration?.unique_key as string)
                    : nodeActionSnippet(activeFlow?.name as string, account?.secret_key as string, connectionId, integration?.unique_key as string, parseInput(activeFlow as Flow))
            );

            const jsonModel = generateResponseModel(activeFlow?.models as NangoSyncModel[], Array.isArray(activeFlow?.returns) ? activeFlow?.returns[0] as string : activeFlow.returns, activeFlow?.type === 'sync');
            if (activeFlow?.type === 'sync') {
                setJsonResponseSnippet(JSON.stringify({"records": [{...jsonModel}]}, null, 2));
            } else {
                setJsonResponseSnippet(JSON.stringify(jsonModel, null, 2));
            }
        }
    }, [accountLoaded, loaded, activeFlow, account, integration?.unique_key]);

    if (!loaded || !accountLoaded) return (
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
            <Loading spaceRatio={2.5} className="-top-36" />
        </DashboardLayout>
    );

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
            <ArrowLeftIcon className="flex h-5 w-5 text-gray-500 cursor-pointer mb-4" onClick={() => navigate(`/${env}/integration/${providerConfigKey}`)} />
            <div className="text-white text-sm mb-16 pb-24" aria-hidden="true">
                <div className="">
                    <div className="flex w-full justify-between ">
                        <h1 className="flex text-2xl text-white font-bold">Endpoint Reference</h1>
                        <div className="flex">
                            <Button
                                variant="zinc"
                                size="sm"
                                className="flex cursor-pointer items-center relative rounded ml-3"
                                onClick={() => navigate(`/${env}/integration/${providerConfigKey}/${activeFlow?.name}`)}
                            >
                                <AdjustmentsHorizontalIcon className="flex h-5 w-5 text-gray-400 cursor-pointer" />
                            </Button>
                        </div>
                    </div>
                    <div className="flex flex-col z-10 mt-4 text-gray-400">
                        <EndpointLabel endpoint={activeFlow?.endpoints[0] as string | FlowEndpoint} type={activeFlow?.type as string} />
                        <span className="mt-2">{activeFlow?.description}</span>
                    </div>
                    {activeFlow?.type === 'sync' && (!activeFlow.version && activeFlow.version === null) && (
                        <Info size={18} classNames="mt-3 z-10" padding="px-4 py-1.5" color="orange">
                            To use this endpoint, enable file synchronization in the <span className="cursor-pointer underline" onClick={() => navigate(`/integration/${providerConfigKey}#scripts`)}>scripts</span>.
                        </Info>
                    )}
                    <div className="flex flex-col z-10 mt-8">
                        <h2 className="text-base">Request</h2>
                        <span className="text-gray-400 mb-4">Use the following code snippet to call this endpoint: </span>
                        <div className="border border-border-gray rounded-md text-white text-sm">
                            <div className="flex justify-between items-center px-4 py-3 border-b border-border-gray">
                                <div className="flex items-center space-x-4">
                                    <Button
                                        type="button"
                                        variant={`${language === Language.Node ? 'active' : 'hover'}`}
                                        className={`cursor-default ${language === Language.Node ? 'pointer-events-none' : 'cursor-pointer'}`}
                                        onClick={() => {
                                          if (language !== Language.Node) {
                                            setSyncSnippet(
                                                activeFlow?.type === 'sync'
                                                    ? nodeSnippet(activeFlow?.models, account?.secret_key as string, connectionId, integration?.unique_key as string)
                                                    : nodeActionSnippet(activeFlow?.name as string, account?.secret_key as string, connectionId, integration?.unique_key as string, parseInput(activeFlow as Flow))
                                            );
                                            setLanguage(Language.Node);
                                          }
                                        }}
                                    >
                                        Node
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={`${language === Language.cURL ? 'active' : 'hover'}`}
                                        className={`cursor-default ${language === Language.cURL ? 'pointer-events-none' : 'cursor-pointer'}`}
                                        onClick={() => {
                                          if (language !== Language.cURL) {
                                            setSyncSnippet(curlSnippet(activeFlow?.endpoints[0] as NangoSyncEndpoint, account?.secret_key as string, connectionId, integration?.unique_key as string, parseInput(activeFlow as Flow)));
                                            setLanguage(Language.cURL);
                                          }
                                        }}
                                    >
                                        cURL
                                    </Button>
                                </div>
                                <CopyButton dark text={syncSnippet} />
                            </div>
                            <Prism
                                noCopy
                                language="typescript"
                                className="p-3 transparent-code"
                                colorScheme="dark"
                            >
                                {syncSnippet}
                            </Prism>
                        </div>
                        {activeFlow?.type === 'sync' && (
                            <>
                                <div className="flex flex-col mt-4 text-gray-400 border border-border-gray rounded-md p-3 mb-5">
                                    <div className="flex w-full cursor-pointer" onClick={() => setShowParametersOpen(!showParametersOpen)}>
                                        {showParametersOpen ? <ChevronDownIcon className="flex h-5 w-5 text-gray-400" /> : <ChevronUpIcon className="flex h-5 w-5 text-gray-400 cursor-pointer" /> }
                                        <span className="ml-2">{showParametersOpen ? 'Hide Optional Parameters' : 'Show Parameters'}</span>
                                    </div>
                                    {showParametersOpen && (
                                        <div className="flex flex-col mt-4">
                                            <span>The following parameters can be added to the <i>listRecords</i> request:</span>
                                            <div className="border-t border-neutral-700 mt-4 py-4">
                                                <div className="flex">
                                                    <span className="text-indigo-200">delta</span>
                                                    <span className="ml-2 text-gray-400 bg-neutral-800 rounded text-xs px-1 py-1">string</span>
                                                </div>
                                                <span className="text-gray-400 mt-2">Only return records added, updated or deleted since this timestmap, e.g. ‘2023-05-31T11:46:13.390Z’</span>
                                            </div>
                                            <div className="border-t border-neutral-700 mt-4 py-4">
                                                <div className="flex">
                                                    <span className="text-indigo-200">limit</span>
                                                    <span className="ml-2 text-gray-400 bg-neutral-800 rounded text-xs px-1 py-1">number</span>
                                                </div>
                                                <span className="text-gray-400 mt-2">The maximum number of records to return. If not passed, defaults to 100.</span>
                                            </div>
                                            <div className="border-t border-neutral-700 mt-4 py-4">
                                                <div className="flex">
                                                    <span className="text-indigo-200">cursor</span>
                                                    <span className="ml-2 text-gray-400 bg-neutral-800 rounded text-xs px-1 py-1">string</span>
                                                </div>
                                                <span className="text-gray-400 mt-2">For pagination: obtained from the "next_cursor" property in the response to fetch the next page of results. The cursor will be included until there are no more results to paginate through.</span>
                                            </div>
                                            <div className="border-t border-neutral-700 mt-4 py-4">
                                                <div className="flex">
                                                    <span className="text-indigo-200">filter</span>
                                                    <span className="ml-2 text-gray-400 bg-neutral-800 rounded text-xs px-1 py-1">'added' | 'updated' | 'deleted'</span>
                                                </div>
                                                <span className="text-gray-400 mt-2">Only return records with the specified change. Accepts comma separated combinations e.g., 'added,updated'.</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <Info size={16} padding="px-4 py-1.5">
                                    <a href="https://docs.nango.dev/guides/webhooks#webhooks-from-nango-to-your-app" target="_blank" className="text-white underline" rel="noreferrer">Register webhooks</a> to be notified when new data is available without polling.
                                </Info>
                            </>
                        )}
                        <div className="flex flex-col mt-8">
                            <h2 className="text-base">Response</h2>
                            <span className="text-gray-400 mb-4">This endpoint returns the following response:</span>
                            <div className="border border-border-gray rounded-md text-white text-sm">
                                <div className="flex justify-between items-center px-4 py-3 border-b border-border-gray">
                                    <div className="space-x-4">
                                        <Button
                                            type="button"
                                            variant="active"
                                            className={`cursor-default ${language === Language.Node ? 'pointer-events-none' : 'cursor-pointer'}`}
                                            onClick={() => {
                                              if (language !== Language.Node) {
                                                  setSyncSnippet(
                                                      activeFlow?.type === 'sync'
                                                          ? nodeSnippet(activeFlow?.models, account?.secret_key as string, connectionId, integration?.unique_key as string)
                                                          : nodeActionSnippet(activeFlow?.name as string, account?.secret_key as string, connectionId, integration?.unique_key as string, parseInput(activeFlow as Flow))
                                                  );
                                                setLanguage(Language.Node);
                                              }
                                            }}
                                        >
                                            JSON
                                        </Button>
                                    </div>
                                    <CopyButton dark text={jsonResponseSnippet} />
                                </div>
                                <Prism
                                    noCopy
                                    language="json"
                                    className="p-3 transparent-code"
                                    colorScheme="dark"
                                >
                                    {jsonResponseSnippet}
                                </Prism>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
