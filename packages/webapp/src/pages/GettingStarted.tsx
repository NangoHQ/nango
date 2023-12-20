import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import Nango from '@nangohq/frontend';
import { Prism } from '@mantine/prism';
import { useModal, Modal } from '@geist-ui/core';

import { baseUrl } from '../utils/utils';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';
import Button from '../components/ui/button/Button';
import Info from '../components/ui/Info'
import CopyButton from '../components/ui/button/CopyButton';
import { useGetProjectInfoAPI } from '../utils/api';
import Spinner from '../components/ui/Spinner';
import { nodeSnippet, curlSnippet, pythonSnippet, phpSnippet, goSnippet, javaSnippet } from '../utils/language-snippets';

import { useStore } from '../store';

enum Steps {
    Authorize = 0,
    Sync = 1,
    Receive = 2,
    Write = 3,
    Ship = 4,
    Complete = 5
}

enum Language {
    Node = 0,
    cURL = 1,
    Python = 2,
    PHP = 3,
    Go = 4,
    Java = 5
}

export default function GettingStarted() {
    const [loaded, setLoaded] = useState(false);
    const [step, setStep] = useState(0);
    const [publicKey, setPublicKey] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [hostUrl, setHostUrl] = useState('');
    const [connectionId, setConnectionId] = useState('');
    const [serverErrorMessage, setServerErrorMessage] = useState('');
    const [onboardingId, setOnboardingId] = useState<number>();
    const [records, setRecords] = useState<any[]>([]);
    const [syncSnippet, setSyncSnippet] = useState('');
    const [language, setLanguage] = useState<Language>(Language.Node);
    const [syncStillRunning, setSyncStillRunning] = useState(true);

    const { setVisible, bindings } = useModal()

    const model = 'Issue';
    const providerConfigKey = 'demo-github-integration';

    const env = useStore(state => state.cookieValue);

    const getProjectInfoAPI = useGetProjectInfoAPI()


    useEffect(() => {
        setLoaded(false);
    }, [env]);

    if (env !== 'dev') {
        window.location.href = '/integrations';
    }

        useEffect(() => {
        const getAccount = async () => {
            let res = await getProjectInfoAPI();

            if (res?.status === 200) {
                const account = (await res.json())['account'];
                setPublicKey(account.public_key);
                setSecretKey(account.secret_key);
                setHostUrl(account.host || baseUrl());
                const email = account.email;
                let strippedEmail = email.includes('@') ? email.split('@')[0] : email;
                strippedEmail = strippedEmail.replace(/[^a-zA-Z0-9]/g, '_');
                setConnectionId(strippedEmail);
                setSyncSnippet(nodeSnippet(model, account.secret_key, strippedEmail, providerConfigKey));
            }
        };

        if (!loaded) {
            setLoaded(true);
            getAccount();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded, setLoaded, getProjectInfoAPI, setPublicKey, setSecretKey]);

    useEffect(() => {
        const getProgress = async () => {
            const params = {
                provider_config_key: providerConfigKey,
                connection_id: connectionId,
                model,
            };

            const res = await fetch(`/api/v1/onboarding?${new URLSearchParams(params).toString()}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (res.status === 200) {
                const { progress, id, records: fetchedRecords } = await res.json();
                setStep(progress || 0);
                if (id) {
                    setOnboardingId(id);
                }

                if (fetchedRecords) {
                    setRecords(fetchedRecords);
                    setSyncStillRunning(false);
                }
            }
        };

        if (connectionId) {
            getProgress();
        }
    }, [loaded, setLoaded, connectionId]);

    const authorizeSnippet = () => {
        return `import Nango from '@nangohq/frontend';

const nango = new Nango({ publicKey: '${publicKey}' });

nango.auth('${providerConfigKey}', '${connectionId}')
`};

    const webhookSnippet = () => {
        return `{ "${model}": { "added": ${records.length}, "updated": 0, "deleted": 0 }, ...}`;
    }

    const actionSnippet = () => {
        return `nango.triggerAction('${providerConfigKey}', '${connectionId}', 'create_issue', params);`;
    }

    const initOnboarding = async () => {
        const res = await fetch(`/api/v1/onboarding`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                provider_config_key: providerConfigKey,
                connection_id: connectionId
            })
        });

        if (res.status !== 201) {
            const { message } = await res.json();
            setServerErrorMessage(message);
            return;
        }

        const { id } = await res.json();

        setOnboardingId(id);
    };

    const updateProgress = async (progress: number) => {
        const res = await fetch(`/api/v1/onboarding/${onboardingId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ progress })
        });

        if (!res.ok) {
            const { message } = await res.json();
            setServerErrorMessage(message);
            return;
        }
    };


    const verifyDemoProviderConfigKey = async () => {
        await fetch(`/api/v1/onboarding/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
    };


    const onAuthorize = async () => {
        const nango = new Nango({ host: hostUrl, publicKey });

        await verifyDemoProviderConfigKey();

        nango.auth(providerConfigKey, connectionId, {
                params: {},
            })
            .then(async () => {
                await initOnboarding();
                setStep(Steps.Sync);
            })
            .catch((err: { message: string; type: string }) => {
                setServerErrorMessage(`${err.type} error: ${err.message}`);
            });
    };

    const onShowRecords = () => {
        setVisible(true);
    }

    const fetchRecords = async () => {
        const params = {
            model
        };

        const res = await fetch(`/records?${new URLSearchParams(params).toString()}`, {
            method: 'GET',
            headers: {
                    'Authorization': `Bearer ${secretKey}`,
                    'Content-Type': 'application/json',
                    'Provider-Config-Key': providerConfigKey,
                    'Connection-Id': connectionId
                }
            });

            if (res.status !== 200) {
                const { message } = await res.json();
                setServerErrorMessage(message);
                return;
            }

            const fetchedRecords = await res.json();
            setRecords(fetchedRecords);
    };

    let pollingInterval: NodeJS.Timer | null = null;

    const startPolling = () => {
        if (pollingInterval) return;

        pollingInterval = setInterval(async () => {
            const params = {
                provider_config_key: providerConfigKey,
                connection_id: connectionId
            };
            const response = await fetch(`/api/v1/onboarding/sync-status?${new URLSearchParams(params).toString()}`);

            if (response.status !== 200) {
                clearInterval(pollingInterval as unknown as number);
                pollingInterval = null;
                return;
            }

            const data = await response.json();

            if (data.jobStatus === 'SUCCESS') {
                clearInterval(pollingInterval as unknown as number);
                await fetchRecords();
                pollingInterval = null;
                setSyncStillRunning(false);
            }

        }, 1000);
    };

    const onGetRecords = async () => {
        if (records.length === 0) {
            startPolling();
        }
        setStep(Steps.Receive);
        await updateProgress(Steps.Receive);
    };

    const onWebhookConfirm = async () => {
        setStep(Steps.Write);
        await updateProgress(Steps.Write);
    };

    const onActionConfirm = async () => {
        setStep(Steps.Ship);
        await updateProgress(Steps.Ship);
    };

    const onClickExpore = async () => {
        window.open('https://docs.nango.dev/integrations/overview', '_blank');
    };

    const onClickGuides = async () => {
        window.open('https://docs.nango.dev/introduction', '_blank');
    };

    const onClickJoinCommunity = async () => {
        window.open('https://nango.dev/slack', '_blank');
    };

    const resetOnboarding = async () => {
        if (step !== Steps.Authorize) {
            setStep(Steps.Authorize);
            await updateProgress(Steps.Authorize);
        }
    };

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.GettingStarted}>
            <Modal {...bindings} wrapClassName="!h-[600px] !w-[550px] !max-w-[550px] !bg-black no-border-modal">
                <div className="flex justify-between text-sm">
                    <div>
                        <Info size={24}>
                            <span className="text-left">Object schemas are customizable, and should be unified across APIs.</span>
                        </Info>
                        <Modal.Content className="overflow-scroll max-w-[550px]">
                            <Prism language="json" colorScheme="dark" className="!text-sm !max-h-[400px] max-w-[550px] break-all-words !pb-6" noCopy>
                                {JSON.stringify(records, null, 2)}
                            </Prism>
                        </Modal.Content>
                    </div>
                </div>
                <Modal.Action passive className="!flex !justify-end !text-sm !bg-black !border-0 !h-[100px]" onClick={() => setVisible(false)}>
                    <Button className="!text-text-light-gray" variant="zombieGray">Close</Button>
                </Modal.Action>
            </Modal>
            <div className="px-16 w-fit mx-auto text-white ">
                <div>
                    <h1 className="mt-16 text-left text-4xl font-semibold tracking-tight text-white">How integrations work with <span onDoubleClick={resetOnboarding}>Nango</span></h1>
                    <h2 className="mt-4 text-xl text-text-light-gray">Using GitHub as an example, follow these steps to synchronize external data with the Nango API.</h2>
                </div>
                <div className="border-l border-border-gray">
                    <div className="mt-8 ml-6">
                        <div className={`p-4 rounded-md relative ${step !== Steps.Authorize ? 'border border-green-900 bg-gradient-to-r from-[#0C1E1A] to-[#0E1115]' : ''}`}>
                            <div className="absolute left-[-2.22rem] top-4 w-6 h-6 rounded-full ring-black bg-[#0e1014] flex items-center justify-center">
                                <div className={`w-2 h-2 rounded-full ring-1 ${step !== Steps.Authorize ? 'ring-[#318463]' : 'ring-white'} bg-transparent`}></div>
                            </div>
                            <h2 className="text-xl">Authorize end users</h2>
                            <h3 className="text-text-light-gray mb-6">Let users authorize your integration (GitHub in this example) in your frontend.</h3>
                            <div className="border border-border-gray rounded-md text-white text-sm py-2">
                                <div className="flex justify-between items-center px-4 py-4 border-b border-border-gray">
                                    <Button type="button" variant="black" className="cursor-default pointer-events-none">Frontend</Button>
                                    <CopyButton dark text={authorizeSnippet()} />
                                </div>
                                <Prism
                                    noCopy
                                    language="typescript"
                                    className="p-3 transparent-code border-b border-border-gray"
                                    colorScheme="dark"
                                >
                                    {authorizeSnippet()}
                                </Prism>
                                <div className="px-4 py-4">
                                    {step === Steps.Authorize ? (
                                        <Button type="button" variant="primary" onClick={onAuthorize}><img className="h-5" src="/images/unlock-icon.svg" alt="" />Authorize Github</Button>
                                    ) : (
                                        <span className="mx-2 text-[#34A853]">
                                            🎉 Github Authorized!
                                        </span>
                                    )}

                                </div>
                                {serverErrorMessage && <p className="mt-2 mx-4 text-sm text-red-600">{serverErrorMessage}</p>}
                            </div>
                        </div>
                    </div>
                    <div className="mt-8 ml-6">
                        <div className={`p-4 rounded-md relative ${step > Steps.Sync ? 'border border-green-900 bg-gradient-to-r from-[#0C1E1A] to-[#0E1115]' : ''}`}>
                            <div className="absolute left-[-2.22rem] top-4 w-6 h-6 rounded-full ring-black bg-[#0e1014] flex items-center justify-center">
                                <div className={`w-2 h-2 rounded-full ring-1 ${step > Steps.Sync ? 'ring-[#318463]' : 'ring-white'} bg-transparent`}></div>
                            </div>
                            <h2 className={`text-xl${step < Steps.Sync ? ' text-text-light-gray' : ''}`}>Synchronize external data</h2>
                            {step >= Steps.Sync && (
                                <>
                                <h3 className="text-text-light-gray mb-6">Retrieve GitHub issues from Nango in your backend.</h3>
                                <div className="border border-border-gray rounded-md text-white text-sm py-2">
                                    <div className="flex justify-between items-center px-4 py-4 border-b border-border-gray">
                                        <div className="space-x-4">
                                            <Button
                                                type="button"
                                                variant={`${language === Language.Node ? 'black' : 'zombie'}`}
                                                className={`cursor-default ${language === Language.Node ? 'pointer-events-none' : 'cursor-pointer'}`}
                                                onClick={() => {
                                                  if (language !== Language.Node) {
                                                    setSyncSnippet(nodeSnippet(model, secretKey, connectionId, providerConfigKey));
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
                                                    setSyncSnippet(curlSnippet(model, secretKey, connectionId, providerConfigKey));
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
                                                    setSyncSnippet(pythonSnippet(model, secretKey, connectionId, providerConfigKey));
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
                                                    setSyncSnippet(phpSnippet(model, secretKey, connectionId, providerConfigKey));
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
                                                    setSyncSnippet(goSnippet(model, secretKey, connectionId, providerConfigKey));
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
                                                    setSyncSnippet(javaSnippet(model, secretKey, connectionId, providerConfigKey));
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
                                        className="p-3 transparent-code border-b border-border-gray"
                                        colorScheme="dark"
                                    >
                                        {syncSnippet}
                                    </Prism>
                                    <div className="flex items-center px-4 py-4">
                                        {step === Steps.Sync ? (
                                            <Button type="button" variant="primary" onClick={onGetRecords}>
                                                <img className="h-5" src="/images/chart-icon.svg" alt="" />Retrieve Github Issues
                                            </Button>
                                        ) : (
                                            <>
                                                {syncStillRunning ? (
                                                    <div className="flex items-center"><Spinner size={1} /><span className="ml-2">Please wait while "Issues" are being fetched</span></div>
                                                ) : (
                                                    <>
                                                        <span className="mx-2 text-[#34A853] mr-4 mt-2">
                                                            🎉  {records.length >= 15 ? '15+' : records.length} issues retrieved!
                                                        </span>
                                                        <Button variant="zombieGray" className="mt-2" onClick={onShowRecords}>Show Data</Button>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    {serverErrorMessage && <p className="mt-2 mx-4 text-sm text-red-600">{serverErrorMessage}</p>}
                                </div>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="mt-8 ml-6">
                        <div className={`p-4 rounded-md relative ${step > Steps.Receive ? 'border border-green-900 bg-gradient-to-r from-[#0C1E1A] to-[#0E1115]' : ''}`}>
                            <div className="absolute left-[-2.22rem] top-4 w-6 h-6 rounded-full ring-black bg-[#0e1014] flex items-center justify-center">
                                <div className={`w-2 h-2 rounded-full ring-1 ${step > Steps.Receive ? 'ring-[#318463]' : 'ring-white'} bg-transparent`}></div>
                            </div>
                            <h2 className={`text-xl${step < Steps.Receive ? ' text-text-light-gray' : ''}`}>Receive webhooks when new data is available</h2>
                            {step >= Steps.Receive && (
                                <>
                                    <h3 className="text-text-light-gray mb-6">Receive webhooks on data updates, so you don’t need poll periodically.</h3>
                                    <div className="border border-border-gray rounded-md text-white text-sm py-2 mb-5">
                                        <Prism language="json" colorScheme="dark" noCopy className="transparent-code">
                                            {webhookSnippet()}
                                        </Prism>
                                    </div>
                                    {step === Steps.Receive && (<Button variant="primary" onClick={onWebhookConfirm}>Got it!</Button>)}
                                </>
                            )}
                        </div>
                    </div>
                    <div className="mt-8 ml-6">
                        <div className={`p-4 rounded-md relative ${step > Steps.Write ? 'border border-green-900 bg-gradient-to-r from-[#0C1E1A] to-[#0E1115]' : ''}`}>
                            <div className="absolute left-[-2.22rem] top-4 w-6 h-6 rounded-full ring-black bg-[#0e1014] flex items-center justify-center">
                                <div className={`w-2 h-2 rounded-full ring-1 ${step > Steps.Write ? 'ring-[#318463]' : 'ring-white'} bg-transparent`}></div>
                            </div>
                            <h2 className={`text-xl${step < Steps.Write ? ' text-text-light-gray' : ''}`}>Write back to APIs</h2>
                            {step >= Steps.Write && (
                                <>
                                    <h3 className="text-text-light-gray mb-6">Push updates back to external APIs, with unified & customizable schemas across APIs.</h3>
                                    <div className="border border-border-gray rounded-md text-white text-sm py-2 mb-5">
                                        <Prism language="typescript" colorScheme="dark" noCopy className="transparent-code">
                                            {actionSnippet()}
                                        </Prism>
                                    </div>
                                    {step === Steps.Write && (<Button variant="primary" onClick={onActionConfirm}>Got it!</Button>)}
                                </>
                            )}
                        </div>
                    </div>
                    <div className="pb-8 ml-6">
                        <div className={`p-4 rounded-md relative ${step > Steps.Ship ? 'mt-8 border border-green-900 bg-gradient-to-r from-[#0C1E1A] to-[#0E1115]' : ''}`}>
                            <div className={`absolute left-[-2.22rem] ${step > Steps.Ship ? 'top-4' : 'top-12'} w-6 h-6 rounded-full ring-black bg-[#0e1014] flex items-center justify-center`}>
                                <div className={`w-2 h-2 rounded-full ring-1 ${step > Steps.Ship ? 'ring-[#318463]' : 'ring-white'} bg-transparent`}></div>
                            </div>
                            <h2 className={`text-xl${step < Steps.Write ? ' text-text-light-gray' : ''} ${step > Steps.Ship ? '' : 'mt-8 '}`}>Next: Ship your first integration!</h2>
                            {step >= Steps.Ship && (
                                <>
                                    <h3 className="text-text-light-gray mb-6">Build any integration for any API with Nango.</h3>
                                    <div className="space-x-3">
                                        <Button type="button" variant="primary" onClick={onClickExpore}>
                                            <img className="h-5" src="/images/explore-icon.svg" alt="" />
                                            Explore pre-built APIs
                                        </Button>
                                        <Button type="button" variant="primary" onClick={onClickGuides}>
                                            <img className="h-5" src="/images/learn-icon.svg" alt="" />
                                            Step-by-step guides
                                        </Button>
                                        <Button type="button" variant="primary" onClick={onClickJoinCommunity}>
                                            <img className="h-5" src="/images/community-icon.svg" alt="" />
                                            Join the community
                                        </Button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
              <Helmet>
                <style>
                  {'.no-border-modal footer { border-top: none !important;}'}
                </style>
              </Helmet>
        </DashboardLayout>
    );
}
