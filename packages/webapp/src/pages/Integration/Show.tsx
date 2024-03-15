import { useParams } from 'react-router-dom';
import { useNavigate, useLocation } from 'react-router';
import { Loading } from '@geist-ui/core';
import { useState, useEffect } from 'react';
import useSWR from 'swr';

import { LeftNavBarItems } from '../../components/LeftNavBar';
import DashboardLayout from '../../layout/DashboardLayout';
import APIReference from './APIReference';
import EndpointReference from './EndpointReference';
import FlowPage from './FlowPage';
import Button from '../../components/ui/button/Button';
import { LinkIcon, BookOpenIcon } from '@heroicons/react/24/outline';
import IntegrationLogo from '../../components/ui/IntegrationLogo';
import Scripts from './Scripts';
import AuthSettings from './AuthSettings';
import { IntegrationConfig, Flow, Account } from '../../types';
import { useStore } from '../../store';
import { requestErrorToast } from '../../utils/api';
import PageNotFound from '../PageNotFound';

export enum Tabs {
    API,
    Scripts,
    Auth
}

export enum SubTabs {
    Reference,
    Flow
}

export interface FlowConfiguration {
    provider: string;
    providerConfigKey: string;
    syncs: Flow[];
    actions: Flow[];
    rawName?: string;
}

export interface EndpointResponse {
    enabledFlows: FlowConfiguration | null;
    unEnabledFlows?: FlowConfiguration;
}

export default function ShowIntegration() {
    const { providerConfigKey } = useParams();

    const [loaded, setLoaded] = useState(true);
    const { data, error } = useSWR<{ config: IntegrationConfig; flows: EndpointResponse; error?: string; type?: string }>(
        `/api/v1/integration/${providerConfigKey}?include_creds=true&include_flows=true&loaded=${loaded}`
    );

    const { data: accountData, error: accountError } = useSWR<{ account: Account }>(`/api/v1/environment`);

    const [activeTab, setActiveTab] = useState<Tabs>(Tabs.API);
    const [subTab, setSubTab] = useState<SubTabs | null>(null);
    const [currentFlow, setCurrentFlow] = useState<Flow | null>(null);
    const [flowConfig, setFlowConfig] = useState<FlowConfiguration | null>(null);
    const navigate = useNavigate();
    const location = useLocation();
    const env = useStore((state) => state.cookieValue);

    useEffect(() => {
        if (location.hash === '#api') {
            setActiveTab(Tabs.API);
        }
        if (location.hash === '#scripts') {
            setActiveTab(Tabs.Scripts);
        }
        if (location.hash === '#auth') {
            setActiveTab(Tabs.Auth);
        }
    }, [location]);

    if (data?.error) {
        return <PageNotFound />;
    }

    if (error || accountError) {
        requestErrorToast();
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
                <Loading spaceRatio={2.5} className="-top-36" />
            </DashboardLayout>
        );
    }

    if (!data || !accountData)
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
                <Loading spaceRatio={2.5} className="-top-36" />
            </DashboardLayout>
        );

    const { config: integration, flows: endpoints } = data;
    const { account } = accountData;

    const showDocs = () => {
        window.open(integration?.docs, '_blank');
    };

    const updateTab = (tab: Tabs) => {
        setActiveTab(tab);
        setSubTab(null);
    };

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
            <div>
                {integration && (
                    <div className="mx-auto">
                        <div className="flex justify-between items-center">
                            <div className="flex">
                                <IntegrationLogo
                                    provider={integration?.provider}
                                    height={24}
                                    width={24}
                                    classNames="mr-2 p-1 border border-border-gray rounded-xl"
                                />
                                <div className="mt-3 ml-6">
                                    <span className="text-left text-xl font-semibold tracking-tight text-gray-400">Integration</span>
                                    <div className="flex items-center -mt-2">
                                        <h2 className="text-left text-3xl font-semibold tracking-tight text-white">{providerConfigKey}</h2>
                                        <BookOpenIcon onClick={() => showDocs()} className="ml-4 h-8 w-8 text-gray-400 cursor-pointer hover:text-white" />
                                    </div>
                                </div>
                            </div>
                            <Button
                                variant="zinc"
                                size="sm"
                                className="flex cursor-pointer text-gray-400 neutral-700 items-center"
                                onClick={() => {
                                    navigate(`/${env}/connections/create/${providerConfigKey}`);
                                }}
                            >
                                <LinkIcon className="flex h-5 w-5" />
                                <span className="px-1">Add Connection</span>
                            </Button>
                        </div>
                    </div>
                )}
                <section className="mt-14">
                    <ul className="flex text-gray-400 space-x-2 text-sm cursor-pointer">
                        <li
                            className={`p-2 rounded ${activeTab === Tabs.API ? 'bg-active-gray text-white' : 'hover:bg-hover-gray'}`}
                            onClick={() => updateTab(Tabs.API)}
                        >
                            API Reference
                        </li>
                        <li
                            className={`p-2 rounded ${activeTab === Tabs.Scripts ? 'bg-active-gray text-white' : 'hover:bg-hover-gray'}`}
                            onClick={() => updateTab(Tabs.Scripts)}
                        >
                            Scripts
                        </li>
                        <li
                            className={`p-2 rounded ${activeTab === Tabs.Auth ? 'bg-active-gray text-white' : 'hover:bg-hover-gray'}`}
                            onClick={() => setActiveTab(Tabs.Auth)}
                        >
                            Settings
                        </li>
                    </ul>
                </section>
                <section className="mt-10">
                    {activeTab === Tabs.API && integration && endpoints && account && (
                        <>
                            {subTab === SubTabs.Reference ? (
                                <EndpointReference
                                    account={account}
                                    integration={integration}
                                    activeFlow={currentFlow}
                                    setActiveTab={setActiveTab}
                                    setSubTab={setSubTab}
                                />
                            ) : (
                                <APIReference
                                    integration={integration}
                                    setActiveTab={setActiveTab}
                                    endpoints={endpoints}
                                    account={account}
                                    setSubTab={setSubTab}
                                    setFlow={setCurrentFlow}
                                />
                            )}
                        </>
                    )}
                    {activeTab === Tabs.Scripts && integration && endpoints && (
                        <>
                            {subTab === SubTabs.Flow ? (
                                <FlowPage
                                    integration={integration}
                                    account={account}
                                    flow={currentFlow}
                                    flowConfig={flowConfig}
                                    reload={() => setLoaded(!loaded)}
                                    endpoints={endpoints}
                                    setFlow={setCurrentFlow}
                                    setActiveTab={setActiveTab}
                                    setSubTab={setSubTab}
                                />
                            ) : (
                                <Scripts
                                    integration={integration}
                                    endpoints={endpoints}
                                    reload={() => setLoaded(!loaded)}
                                    setFlow={setCurrentFlow}
                                    setFlowConfig={setFlowConfig}
                                    setSubTab={setSubTab}
                                />
                            )}
                        </>
                    )}
                    {activeTab === Tabs.Auth && integration && account && <AuthSettings integration={integration} account={account} />}
                </section>
            </div>
        </DashboardLayout>
    );
}
