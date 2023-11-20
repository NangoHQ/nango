import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';

import {
    useGetIntegrationEndpointsAPI,
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

export enum Tabs {
    API,
    Sync,
    Auth
}

type HTTP_VERB = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

type NangoSyncEndpoint = {
    [key in HTTP_VERB]?: string;
};

interface NangoSyncModelField {
    name: string;
    type: string;
    description?: string;
}

export interface NangoSyncModel {
    name: string;
    description?: string;
    fields: NangoSyncModelField[];
}

export interface Flow extends BaseFlow {
    attributes: Record<string, unknown>;
    endpoints: NangoSyncEndpoint[];
    scopes: string[];
    sync_type?: 'FULL' | 'INCREMENTAL';
    is_public: boolean;
    pre_built: boolean;
    version?: string;
    last_deployed?: string;
    input?: NangoSyncModel;
}

interface EnabledFlow {
    provider: string;
    providerConfigKey: string;
    syncs: Flow[];
    actions: Flow[];
}

interface BaseFlow {
    description: string;
    name: string;
    returns: string | string[];
    type: 'sync' | 'action';
    runs?: string;
    track_deletes: boolean;
    auto_start?: boolean;
    endpoint?: string;
    models: Record<string, any>;
}

export interface UnenabledFlow extends BaseFlow {
    input?: string;
    output: string;
}

export interface EndpointResponse {
    enabledFlows: EnabledFlow | null;
    unenabledFlows: UnenabledFlow[];
}

export default function ShowIntegration() {
    const [loaded, setLoaded] = useState(false);
    const [endpoints, setEndpoints] = useState<EndpointResponse>();
    const [integration, setIntegration] = useState<Integration | null>(null);
    const { providerConfigKey } = useParams();
    const [templateLogo, setTemplateLogo] = useState<string>('');
    const [activeTab, setActiveTab] = useState<Tabs>(Tabs.API);
    const getIntegrationDetailsAPI = useGetIntegrationDetailsAPI();
    const getEndpoints = useGetIntegrationEndpointsAPI();

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
                        setEndpoints(endpointData);
                    }
                }
            }
        };

        if (!loaded) {
            setLoaded(true);
            getProviders();
        }
    }, [providerConfigKey, getIntegrationDetailsAPI, loaded, setLoaded, getEndpoints]);

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
                {activeTab === Tabs.API && integration && endpoints && (
                    <APIReference integration={integration} setActiveTab={setActiveTab} endpoints={endpoints} />
                )}
                {activeTab === Tabs.Sync && integration && endpoints && (
                    <SyncConfiguration integration={integration} endpoints={endpoints} />
                )}
                {activeTab === Tabs.Auth && integration && (
                    <AuthSettings integration={integration} />
                )}
            </section>
        </DashboardLayout>
    );
}
