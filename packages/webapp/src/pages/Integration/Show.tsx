import { useParams } from 'react-router-dom';
import { useNavigate, useLocation } from 'react-router';
import { Loading } from '@geist-ui/core';
import { useState, useEffect } from 'react';
import useSWR from 'swr'

import { LeftNavBarItems } from '../../components/LeftNavBar';
import DashboardLayout from '../../layout/DashboardLayout';
import APIReference from './APIReference';
import Button from '../../components/ui/button/Button';
import { BuildingOfficeIcon, BookOpenIcon } from '@heroicons/react/24/outline';
import IntegrationLogo from '../../components/ui/IntegrationLogo';
import Scripts from './Scripts';
import AuthSettings from './AuthSettings';
import { IntegrationConfig, Flow, Account } from '../../types';
import { useStore } from '../../store';
import { requestErrorToast } from '../../utils/api';

export enum Tabs {
    API,
    Scripts,
    Auth
}

export interface FlowConfiguration {
    provider: string;
    providerConfigKey: string;
    syncs: Flow[];
    actions: Flow[];
    rawName?: string
}

export interface EndpointResponse {
    enabledFlows: FlowConfiguration | null;
    unEnabledFlows?: FlowConfiguration;
}

export default function ShowIntegration() {
    const { providerConfigKey } = useParams();

    const [loaded, setLoaded] = useState(true);
    const { data, error } = useSWR<{config: IntegrationConfig, flows: EndpointResponse}>(`/api/v1/integration/${providerConfigKey}?include_creds=true&include_flows=true&loaded=${loaded}`);
    const { data: accountData, error: accountError } = useSWR<{account: Account}>(`/api/v1/environment`);

    const [activeTab, setActiveTab] = useState<Tabs>(Tabs.API);
    const navigate = useNavigate();
    const location = useLocation();
    const env = useStore(state => state.cookieValue);

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

    if (error || accountError) {
        requestErrorToast();
        return (
            <DashboardLayout selectedItem={LeftNavBarItems.Connections}>
                <Loading spaceRatio={2.5} className="-top-36" />
            </DashboardLayout>
        );
    }

    if (!data || !accountData) return (
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
            <Loading spaceRatio={2.5} className="-top-36" />
        </DashboardLayout>
    );

    const { config: integration, flows: endpoints } = data;
    const { account } = accountData;

    const showDocs = () => {
        window.open(integration?.docs, '_blank');
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
            <div>
                {integration && (
                    <div className="mx-auto">
                        <div className="flex justify-between items-center">
                            <div className="flex">
                                <IntegrationLogo provider={integration?.provider} height={24} width={24} classNames="mr-2 border border-border-gray rounded-xl" />
                                <div className="mt-3 ml-6">
                                    <span className="text-left text-xl font-semibold tracking-tight text-gray-400">
                                        Integration
                                    </span>
                                    <div className="flex items-center -mt-2">
                                        <h2 className="text-left text-3xl font-semibold tracking-tight text-white">
                                            {providerConfigKey}
                                        </h2>
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
                                <BuildingOfficeIcon className="flex h-5 w-5" />
                                <span className="px-1">Connect</span>
                            </Button>
                        </div>
                    </div>
                )}
                <section className="mt-14">
                    <ul className="flex text-gray-400 space-x-2 text-sm cursor-pointer">
                        <li className={`p-2 rounded ${activeTab === Tabs.API ? 'bg-active-gray text-white' : 'hover:bg-hover-gray'}`} onClick={() => setActiveTab(Tabs.API)}>API Reference</li>
                        <li className={`p-2 rounded ${activeTab === Tabs.Scripts ? 'bg-active-gray text-white' : 'hover:bg-hover-gray'}`} onClick={() => setActiveTab(Tabs.Scripts)}>Scripts</li>
                        <li className={`p-2 rounded ${activeTab === Tabs.Auth ? 'bg-active-gray text-white' : 'hover:bg-hover-gray'}`} onClick={() => setActiveTab(Tabs.Auth)}>Settings</li>
                    </ul>
                </section>
                <section className="mt-10">
                    {activeTab === Tabs.API && integration && endpoints && account && (
                        <APIReference integration={integration} setActiveTab={setActiveTab} endpoints={endpoints} account={account} />
                    )}
                    {activeTab === Tabs.Scripts && integration && endpoints && (
                        <Scripts integration={integration} endpoints={endpoints} reload={() => setLoaded(!loaded)} />
                    )}
                    {activeTab === Tabs.Auth && integration && account && (
                        <AuthSettings integration={integration} account={account} />
                    )}
                </section>
            </div>
        </DashboardLayout>
    );
}
