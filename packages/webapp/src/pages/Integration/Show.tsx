import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';

import {
    useGetIntegrationDetailsAPI
} from '../../utils/api';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import DashboardLayout from '../../layout/DashboardLayout';
import APIReference from './APIReference';
import SyncConfiguration from './SyncConfiguration';
import AuthSettings from './AuthSettings';

export interface Integration {
    unique_key: string;
    provider: string;
    client_id: string;
    client_secret: string;
    app_link?: string;
    scopes: string;
}

enum Tabs {
    API,
    Sync,
    Auth
}

export default function ShowIntegration() {
    const [loaded, setLoaded] = useState(false);
    const [integration, setIntegration] = useState<Integration | null>(null);
    const { providerConfigKey } = useParams();
    const [templateLogo, setTemplateLogo] = useState<string>('');
    const [activeTab, setActiveTab] = useState<Tabs>(Tabs.API);
    const getIntegrationDetailsAPI = useGetIntegrationDetailsAPI();

    useEffect(() => {
        const getProviders = async () => {
            if (providerConfigKey) {
                let res = await getIntegrationDetailsAPI(providerConfigKey);
                if (res?.status === 200) {
                    const data = await res.json();
                    setIntegration(data['config']);
                }
            }
        };

        if (!loaded) {
            setLoaded(true);
            getProviders();
        }
    }, [providerConfigKey, getIntegrationDetailsAPI, loaded, setLoaded]);

    if (integration != null && templateLogo === '') {
        setTemplateLogo(`images/template-logos/${integration.provider}.svg`);
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.Integrations}>
            {integration && (
                <div className="mx-auto w-largebox">
                    <div className="flex mx-20 mt-12">
                        <img src={`/images/template-logos/${integration?.provider}.svg`} alt="" className="h-24 w-24" />
                        <div className="mt-3 ml-6">
                            <span className="text-left text-2xl font-semibold tracking-tight text-gray-400 mb-12">
                                Integration
                            </span>
                            <h2 className="text-left text-3xl font-semibold tracking-tight text-white mb-12">
                                {providerConfigKey}
                            </h2>
                        </div>
                    </div>
                </div>
            )}
            <section className="mx-20 mt-10">
                <ul className="flex text-gray-400 space-x-8 cursor-pointer">
                    <li className={`p-2 rounded ${activeTab === Tabs.API ? 'bg-zinc-900 text-white' : 'hover:bg-gray-700'}`} onClick={() => setActiveTab(Tabs.API)}>API Reference</li>
                    <li className={`p-2 rounded ${activeTab === Tabs.Sync ? 'bg-zinc-900 text-white' : 'hover:bg-gray-700'}`} onClick={() => setActiveTab(Tabs.Sync)}>Sync Configuration</li>
                    <li className={`p-2 rounded ${activeTab === Tabs.Auth ? 'bg-zinc-900 text-white' : 'hover:bg-gray-700'}`} onClick={() => setActiveTab(Tabs.Auth)}>Auth Settings</li>
                </ul>
            </section>
            <section className="mx-20 mt-10">
                {activeTab === Tabs.API && integration && (
                    <APIReference integration={integration} />
                )}
                {activeTab === Tabs.Sync && integration && (
                    <SyncConfiguration integration={integration} />
                )}
                {activeTab === Tabs.Auth && integration && (
                    <AuthSettings integration={integration} />
                )}
            </section>
        </DashboardLayout>
    );
}
