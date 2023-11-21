import { useState, useEffect, Fragment } from 'react';
import { AdjustmentsHorizontalIcon, ArrowPathRoundedSquareIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { BoltIcon } from '@heroicons/react/24/outline';
import { Prism } from '@mantine/prism';
import { Integration, Tabs, EndpointResponse, Flow } from './Show';
import Button from '../../components/ui/button/Button';
import CopyButton from '../../components/ui/button/CopyButton';
import { useGetProjectInfoAPI } from '../../utils/api';
import FlowCard from './components/FlowCard';
import EndpointRow from './components/EndpointRow';
import Info from '../../components/ui/Info'
import EndpointLabel from './components/EndpointLabel';
import { FlowEndpoint, NangoSyncModel } from '../../types';
import { nodeSnippet, nodeActionSnippet, curlSnippet, pythonSnippet, phpSnippet, goSnippet, javaSnippet } from '../../utils/language-snippets';
import { generateExampleValueForProperty } from '../../utils/utils';

interface APIReferenceProps {
    integration: Integration | null;
    setActiveTab: (tab: Tabs) => void;
    endpoints: EndpointResponse;
}

enum Language {
    Node = 0,
    cURL = 1,
    Python = 2,
    PHP = 3,
    Go = 4,
    Java = 5
}

export default function APIReference(props: APIReferenceProps) {
    const [loaded, setLoaded] = useState(false);
    const [showDocModal, setShowDocModal] = useState(false);
    const [modalInfo, setModalInfo] = useState<Flow | null>(null);
    const [showParametersOpen, setShowParametersOpen] = useState(false);
    const [language, setLanguage] = useState<Language>(Language.Node);
    const [syncSnippet, setSyncSnippet] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [jsonResponseSnippet, setJsonResponseSnippet] = useState('');

    const { integration, setActiveTab, endpoints } = props;
    const getProjectInfoAPI = useGetProjectInfoAPI()

    const endpoint = '/github/lite-issues';
    const connectionId = '<CONNECTION-ID>';

    useEffect(() => {
        const getAccount = async () => {
            let res = await getProjectInfoAPI();

            if (res?.status === 200) {
                const account = (await res.json())['account'];
                setSecretKey(account.secret_key);
            }
        };

        if (!loaded) {
            setLoaded(true);
            getAccount();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded, setLoaded, getProjectInfoAPI, setSecretKey]);

    const parseInput = (flow: Flow) => {
        let input;

        if (flow?.input) {
            const rawInput = {} as Record<string, boolean|string|number>;
            for (const field of flow.input.fields) {
                rawInput[field.name] = field.type;
            }
            input = rawInput;
        } else {
            input = undefined;
        }

        return input;
    };

    const openAPIDocModal = (flow: Flow) => {
        setShowDocModal(true);

        setSyncSnippet(
            flow?.type === 'sync'
                ? nodeSnippet(endpoint, secretKey, connectionId, integration?.unique_key as string)
                : nodeActionSnippet(endpoint, secretKey, connectionId, integration?.unique_key as string, parseInput(flow))
        );
        const model = flow.models.find((model) => model.name === flow.output);
        const jsonResponse = generateExampleValueForProperty(model as NangoSyncModel);
        const metadata = {
            _nango_metadata: {
                deleted_at: null,
                last_action: 'ADDED',
                first_seen_at: '2023-09-18T15:20:35.941305+00:00',
                last_modified_at: '2023-09-18T15:20:35.941305+00:00'
            }
        };
        setJsonResponseSnippet(JSON.stringify([{...jsonResponse, ...metadata}], null, 2));
        setModalInfo(flow);
    }

    const showSyncConfigurationModal = () => {
        setShowDocModal(false);
        setActiveTab(Tabs.Sync);
    }

    useEffect(() => {
        const closeAPIDocModal = () => {
            setShowDocModal(false);
        }

        if (showDocModal) {
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    closeAPIDocModal();
                }
            });

            document.querySelector('.outside-modal')?.addEventListener('click', (e) => {
                if (e.target === e.currentTarget || e.target === document.querySelector('.close-area')) {
                    closeAPIDocModal();
                }
            });
        }

        return () => {
            document.removeEventListener('click', closeAPIDocModal);
        }
    }, [showDocModal]);

    return (
        <div className="h-fit rounded-md text-white text-sm">
            <div className={`${showDocModal ? 'fixed' : 'hidden'} z-50 inset-0 overflow-y-auto`}>
                <div className="flex justify-center min-h-screen pt-4 px-4 pb-20 sm:block sm:p-0">
                    <div className="fixed inset-0 transition-opacity outside-modal" aria-hidden="true">
                        <div className="absolute inset-0 bg-neutral-900 opacity-75 close-area"></div>
                        <div className="bg-black border-l border-neutral-700 flex flex-col z-10 opacity-1 ml-auto w-1/2 h-full text-gray-4 p-10 overflow-scroll">
                            <div className="flex w-full justify-between z-20">
                                <h1 className="flex text-2xl text-white font-bold">Endpoint Reference</h1>
                                <div className="flex">
                                    <div className="group flex cursor-pointer hover:bg-neutral-800 px-2 py-4 h-4 items-center relative rounded border border-neutral-700">
                                        {modalInfo?.type === 'sync' && (
                                            <ArrowPathRoundedSquareIcon className="flex h-5 w-5 text-gray-400 cursor-pointer" />
                                        )}
                                        {modalInfo?.type === 'action' && (
                                            <BoltIcon className="flex h-5 w-5 text-gray-400 cursor-pointer" />
                                        )}
                                        <span className="ml-2 text-gray-400">{modalInfo?.type === 'action' ? 'Action' : 'Sync'} Info</span>
                                        {modalInfo && (
                                            <div className="hidden group-hover:block text-white absolute top-10 right-0 bg-neutral-800 rounded border border-neutral-700 w-56">
                                                <FlowCard flow={modalInfo as Flow} />
                                            </div>
                                        )}
                                    </div>
                                    <div
                                        className="flex cursor-pointer hover:bg-neutral-800 ml-3 px-2 py-4 h-4 items-center relative rounded border border-neutral-700"
                                        onClick={() => showSyncConfigurationModal()}
                                    >
                                        <AdjustmentsHorizontalIcon className="flex h-5 w-5 text-gray-400 cursor-pointer" />
                                        <span className="ml-2 text-gray-400">Sync Configuration</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col z-10 mt-4">
                                <EndpointLabel endpoint={modalInfo?.endpoint as string | FlowEndpoint} type={modalInfo?.type as string} />
                                <span className="text-gray-400 mt-2">{modalInfo?.description}</span>
                            </div>
                            <div className="flex flex-col z-10 mt-8">
                                <h2 className="text-base">Request</h2>
                                <span className="text-gray-400 mb-4">Use the following code snippet to call this endpoint: </span>
                                <div className="border border-border-gray rounded-md text-white text-sm py-2">
                                    <div className="flex justify-between items-center px-4 py-4 border-b border-border-gray">
                                        <div className="space-x-4">
                                            <Button
                                                type="button"
                                                variant={`${language === Language.Node ? 'black' : 'zombie'}`}
                                                className={`cursor-default ${language === Language.Node ? 'pointer-events-none' : 'cursor-pointer'}`}
                                                onClick={() => {
                                                  if (language !== Language.Node) {
                                                    setSyncSnippet(
                                                        modalInfo?.type === 'sync'
                                                            ? nodeSnippet(endpoint, secretKey, connectionId, integration?.unique_key as string)
                                                            : nodeActionSnippet(endpoint, secretKey, connectionId, integration?.unique_key as string, parseInput(modalInfo as Flow))
                                                    );
                                                    setLanguage(Language.Node);
                                                  }
                                                }}
                                            >
                                                Node
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={`${language === Language.cURL ? 'black' : 'zombie'}`}
                                                className={`cursor-default ${language === Language.cURL ? 'pointer-events-none' : 'cursor-pointer'}`}
                                                onClick={() => {
                                                  if (language !== Language.cURL) {
                                                    setSyncSnippet(curlSnippet(endpoint, secretKey, connectionId, integration?.unique_key as string));
                                                    setLanguage(Language.cURL);
                                                  }
                                                }}
                                            >
                                                cURL
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={`${language === Language.Python ? 'black' : 'zombie'}`}
                                                className={`cursor-default ${language === Language.Python ? 'pointer-events-none' : 'cursor-pointer'}`}
                                                onClick={() => {
                                                  if (language !== Language.Python) {
                                                    setSyncSnippet(pythonSnippet(endpoint, secretKey, connectionId, integration?.unique_key as string));
                                                    setLanguage(Language.Python);
                                                  }
                                                }}
                                            >
                                                Python
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={`${language === Language.PHP ? 'black' : 'zombie'}`}
                                                className={`cursor-default ${language === Language.PHP ? 'pointer-events-none' : 'cursor-pointer'}`}
                                                onClick={() => {
                                                  if (language !== Language.PHP) {
                                                    setSyncSnippet(phpSnippet(endpoint, secretKey, connectionId, integration?.unique_key as string));
                                                    setLanguage(Language.PHP);
                                                  }
                                                }}
                                            >
                                                PHP
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={`${language === Language.Go ? 'black' : 'zombie'}`}
                                                className={`cursor-default ${language === Language.Go ? 'pointer-events-none' : 'cursor-pointer'}`}
                                                onClick={() => {
                                                  if (language !== Language.Go) {
                                                    setSyncSnippet(goSnippet(endpoint, secretKey, connectionId, integration?.unique_key as string));
                                                    setLanguage(Language.Go);
                                                  }
                                                }}
                                            >
                                                Go
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={`${language === Language.Java ? 'black' : 'zombie'}`}
                                                className={`cursor-default ${language === Language.Java ? 'pointer-events-none' : 'cursor-pointer'}`}
                                                onClick={() => {
                                                  if (language !== Language.Java) {
                                                    setSyncSnippet(javaSnippet(endpoint, secretKey, connectionId, integration?.unique_key as string));
                                                    setLanguage(Language.Java);
                                                  }
                                                }}
                                            >
                                                Java
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
                                <div className="flex flex-col mt-4 text-gray-400 border border-border-gray rounded-md p-3 mb-5">
                                    <div className="flex w-full cursor-pointer" onClick={() => setShowParametersOpen(!showParametersOpen)}>
                                        {showParametersOpen ? <ChevronDownIcon className="flex h-5 w-5 text-gray-400" /> : <ChevronUpIcon className="flex h-5 w-5 text-gray-400 cursor-pointer" /> }
                                        <span className="ml-2">{showParametersOpen ? 'Hide Optional Parameters' : 'Show Parameters'}</span>
                                    </div>
                                    {showParametersOpen && (
                                        <div className="flex flex-col mt-4">
                                            <span>The following parameters can be added to the <i>getRecords</i> request:</span>
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
                                                <span className="text-gray-400 mt-2">Only return records added, updated or deleted since this timestmap, e.g. ‘2023-05-31T11:46:13.390Z’</span>
                                            </div>
                                            <div className="border-t border-neutral-700 mt-4 py-4">
                                                <div className="flex">
                                                    <span className="text-indigo-200">offset</span>
                                                    <span className="ml-2 text-gray-400 bg-neutral-800 rounded text-xs px-1 py-1">number</span>
                                                </div>
                                                <span className="text-gray-400 mt-2">For pagination: The number of records to skip. If not passed, no records are skipped.</span>
                                            </div>
                                            <div className="border-t border-neutral-700 mt-4 py-4">
                                                <div className="flex">
                                                    <span className="text-indigo-200">sortBy</span>
                                                    <span className="ml-2 text-gray-400 bg-neutral-800 rounded text-xs px-1 py-1">'id' | 'createdAt' | 'updatedAt'</span>
                                                </div>
                                                <span className="text-gray-400 mt-2">Set how the records are sorted. The default is by 'id'. 'createdAt' and 'updatedAt' refer to creation/update date within Nango, not the external system.</span>
                                            </div>
                                            <div className="border-t border-neutral-700 mt-4 py-4">
                                                <div className="flex">
                                                    <span className="text-indigo-200">order</span>
                                                    <span className="ml-2 text-gray-400 bg-neutral-800 rounded text-xs px-1 py-1">'asc' | 'desc'</span>
                                                </div>
                                                <span className="text-gray-400 mt-2">Set the order of results. The default is 'desc'.</span>
                                            </div>
                                            <div className="border-t border-neutral-700 mt-4 py-4">
                                                <div className="flex">
                                                    <span className="text-indigo-200">filter</span>
                                                    <span className="ml-2 text-gray-400 bg-neutral-800 rounded text-xs px-1 py-1">'added' | 'updated' | 'deleted'</span>
                                                </div>
                                                <span className="text-gray-400 mt-2">Only return records with the specified change. Accepts comma separated combinations e.g., ‘added,updated’.</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <Info size={16} padding="px-4 py-1.5">
                                    <a href="https://docs.nango.dev/guides/webhooks#webhooks-from-nango-to-your-app" target="_blank" className="text-[#4E80EE]" rel="noreferrer">Register webhooks</a> to be notified when new data is available without polling.
                                </Info>
                                <div className="flex flex-col mt-8">
                                    <h2 className="text-base">Response</h2>
                                    <span className="text-gray-400 mb-4">This endpoint returns the following response:</span>
                                    <div className="border border-border-gray rounded-md text-white text-sm py-2">
                                        <div className="flex justify-between items-center px-4 py-4 border-b border-border-gray">
                                            <div className="space-x-4">
                                                <Button
                                                    type="button"
                                                    variant={`${language === Language.Node ? 'black' : 'zombie'}`}
                                                    className={`cursor-default ${language === Language.Node ? 'pointer-events-none' : 'cursor-pointer'}`}
                                                    onClick={() => {
                                                      if (language !== Language.Node) {
                                                          setSyncSnippet(
                                                              modalInfo?.type === 'sync'
                                                                  ? nodeSnippet(endpoint, secretKey, connectionId, integration?.unique_key as string)
                                                                  : nodeActionSnippet(endpoint, secretKey, connectionId, integration?.unique_key as string, parseInput(modalInfo as Flow))

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
                </div>
            </div>
            <table className="w-[976px]">
                <tbody className="flex flex-col space-y-2">
                    <tr>
                        <td className="flex items-center px-3 justify-between text-xs px-2 py-2 bg-zinc-900 border border-neutral-800 rounded-md">
                            <div className="w-48">Endpoint</div>
                            <div className="w-64">Description</div>
                            <div className="w-48">Source</div>
                            <div className="">Sync/Action Info</div>
                        </td>
                    </tr>
                    {[...endpoints?.enabledFlows?.syncs || [], ...endpoints?.enabledFlows?.actions || [], ...endpoints?.unEnabledFlows?.syncs || [], ...endpoints?.unEnabledFlows?.actions || []].map((flow, flowIndex) => (
                        <Fragment key={flowIndex}>
                            {flow.endpoints.map((endpoint, index: number) => (
                                <tr key={`tr-${flow.name}-${flowIndex}-${index}`}>
                                    <EndpointRow
                                        flow={flow}
                                        endpoint={endpoint}
                                        output={Array.isArray(flow.returns) ? flow.returns[index] : flow.returns}
                                        openAPIDocModal={openAPIDocModal}
                                        source={
                                            flow.is_public ? 'Public' :
                                            flow.pre_built ? 'Managed' :
                                            'Custom'
                                        }
                                    />
                                </tr>
                            ))}
                        </Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
