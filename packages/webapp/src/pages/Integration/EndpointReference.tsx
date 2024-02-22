import { useState, useEffect } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { Prism } from '@mantine/prism';
import Button from '../../components/ui/button/Button';
import CopyButton from '../../components/ui/button/CopyButton';
import Info from '../../components/ui/Info'
import EndpointLabel from './components/EndpointLabel';
import { NangoSyncModel, NangoSyncEndpoint, IntegrationConfig, FlowEndpoint, Flow, Account } from '../../types';
import { nodeSnippet, nodeActionSnippet, curlSnippet } from '../../utils/language-snippets';
import { parseInput, generateResponseModel } from '../../utils/utils';
import { Tabs, SubTabs } from './Show';
import { useStore } from '../../store';

enum Language {
    Node = 0,
    cURL = 1,
    Python = 2,
    PHP = 3,
    Go = 4,
    Java = 5
}

interface EndpointReferenceProps {
    account: Account;
    integration: IntegrationConfig;
    activeFlow: Flow | null;
    setSubTab: (tab: SubTabs) => void;
    setActiveTab: (tab: Tabs) => void;
}

export default function EndpointReference(props: EndpointReferenceProps) {
    const { account, integration, activeFlow, setSubTab, setActiveTab } = props;

    const [showParametersOpen, setShowParametersOpen] = useState(false);
    const [language, setLanguage] = useState<Language>(Language.Node);
    const [syncSnippet, setSyncSnippet] = useState('');
    const [jsonResponseSnippet, setJsonResponseSnippet] = useState('');

    const connectionId = '<CONNECTION-ID>';

    const baseUrl = useStore(state => state.baseUrl);

    useEffect(() => {
        if (activeFlow) {
            setSyncSnippet(
                activeFlow?.type === 'sync'
                    ? nodeSnippet(activeFlow?.models, account?.secret_key as string, connectionId, integration?.unique_key as string)
                    : nodeActionSnippet(activeFlow?.name as string, account?.secret_key as string, connectionId, integration?.unique_key as string, parseInput(activeFlow as Flow))
            );

            const jsonModel = generateResponseModel(activeFlow?.models as NangoSyncModel[], Array.isArray(activeFlow?.returns) ? activeFlow?.returns[0] as string : activeFlow.returns, activeFlow?.type === 'sync');
            if (activeFlow?.type === 'sync') {
                setJsonResponseSnippet(JSON.stringify({"records": [{...jsonModel}], "next_cursor": 'MjAyMy0xMS0xN1QxMTo0NzoxNC40NDcrMDI6MDB8fDAz...'}, null, 2));
            } else {
                setJsonResponseSnippet(JSON.stringify(jsonModel, null, 2));
            }
        }
    }, [activeFlow, account, integration?.unique_key]);

    const routeToFlow = () => {
        setActiveTab(Tabs.Scripts);
        setSubTab(SubTabs.Flow);
    };

    return (
        <div className="text-white">
            <div className="flex flex-col z-10 mt-4 text-gray-400">
                <EndpointLabel endpoint={activeFlow?.endpoints[0] as string | FlowEndpoint} type={activeFlow?.type as string} />
                <span className="mt-2">{activeFlow?.description}</span>
            </div>
            {!activeFlow?.version && activeFlow?.version === null && (
                <Info size={18} classNames="mt-10 mb-10 z-10" padding="px-4 py-1.5" color="orange">
                    This endpoint is disabled. Enable it in the associated <span className="cursor-pointer underline" onClick={routeToFlow}>script settings</span>.
                </Info>
            )}
            <div className="flex flex-col z-10 mt-6">
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
                                    setSyncSnippet(curlSnippet(baseUrl, activeFlow?.endpoints[0] as NangoSyncEndpoint, account?.secret_key as string, connectionId, integration?.unique_key as string, parseInput(activeFlow as Flow)));
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
                                <span className="ml-2">{showParametersOpen ? `Hide Optional ${language === Language.cURL ? 'Query ' : ''}Parameters` : `Show Optional ${language === Language.cURL ? 'Query ' : ''}Parameters`}</span>
                            </div>
                            {showParametersOpen && (
                                <div className="flex flex-col mt-4">
                                    <span>The following parameters can be added to the {language === Language.Node ? <i>listRecords</i> : 'request'}{language === Language.cURL ? ' as query params' : ''}:</span>
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
                    </>
                )}
                <div className="flex flex-col mt-3">
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
    );
}
