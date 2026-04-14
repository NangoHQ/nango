import { ExternalLink } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Link, Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom';

import { IntegrationLogoWithProfile } from './components/IntegrationLogoWithProfile';
import { CriticalErrorAlert } from '@/components-v2/CriticalErrorAlert';
import { Tabs, TabsList, TabsTrigger } from '@/components-v2/Tabs';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { useConnection } from '@/hooks/useConnections';
import { useGetIntegration } from '@/hooks/useIntegration';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { getConnectionDisplayName, getEndUserEmail } from '@/utils/endUser';
import { openPlaygroundWithContext } from '@/utils/playground';

import type { GetConnection, GetIntegration } from '@nangohq/types';

export interface ConnectionOutletContext {
    connectionData: GetConnection['Success']['data'];
    integrationData: GetIntegration['Success']['data'];
    providerConfigKey: string;
}

export function useConnectionContext() {
    return useOutletContext<ConnectionOutletContext>();
}

const tabs = [
    { label: 'Auth', segment: 'auth' },
    { label: 'Syncs', segment: 'syncs' },
    { label: 'Records', segment: 'records' },
    { label: 'Settings', segment: 'settings' }
] as const;

export const ConnectionShow = () => {
    const env = useStore((state) => state.env);
    const { connectionId, providerConfigKey } = useParams();
    const location = useLocation();
    const {
        data: connectionResponse,
        error: connectionError,
        isLoading: connectionLoading
    } = useConnection({ env, provider_config_key: providerConfigKey! }, { connectionId: connectionId! });
    const { data: integrationResponse, error: integrationError, isLoading: providerLoading } = useGetIntegration(env, providerConfigKey!);

    if (connectionError || integrationError) {
        return (
            <DashboardLayout>
                <Helmet>
                    <title>Connection - Nango</title>
                </Helmet>
                <CriticalErrorAlert message={connectionError ? 'Failed to load connection data' : 'Failed to load integration data for this connection'} />
            </DashboardLayout>
        );
    }

    if (connectionLoading || providerLoading || !connectionResponse || !integrationResponse) {
        return (
            <DashboardLayout>
                <Helmet>
                    <title>Connection - Nango</title>
                </Helmet>
                <div className="flex flex-col gap-5">
                    <div className="flex gap-4 items-center">
                        <Skeleton className="size-20" />
                        <div className="flex flex-col gap-1">
                            <span className="text-body-large-semi text-text-primary">
                                <Skeleton className="w-64 h-6" />
                            </span>
                            <span className="text-body-medium-regular text-text-secondary">
                                <Skeleton className="w-36 h-5" />
                            </span>
                        </div>
                    </div>

                    <Skeleton className="w-64 h-8 " />
                </div>
            </DashboardLayout>
        );
    }

    const integrationData = integrationResponse.data;
    const providerKey = integrationData.integration.unique_key;

    const displayName = getConnectionDisplayName({
        endUser: connectionResponse.endUser,
        connectionId: connectionResponse.connection.connection_id,
        connectionTags: connectionResponse.connection.tags
    });

    const email = getEndUserEmail(connectionResponse.endUser, connectionResponse.connection.tags);

    const basePath = `/${env}/connections/${encodeURIComponent(providerConfigKey || '')}/${encodeURIComponent(connectionId || '')}`;
    const activeSegment = getActiveTabSegment(location.pathname, basePath);

    const context: ConnectionOutletContext = {
        connectionData: connectionResponse,
        integrationData,
        providerConfigKey: providerKey
    };

    return (
        <DashboardLayout>
            <Helmet>
                <title>{connectionResponse.endUser?.email || connectionResponse.connection.connection_id} - Connection - Nango</title>
            </Helmet>

            <Tabs value={activeSegment}>
                <div className="flex flex-col gap-5">
                    <div className="flex gap-4 items-center">
                        <IntegrationLogoWithProfile providerConfigKey={providerKey} provider={connectionResponse.provider} profile={displayName} />
                        <div className="flex flex-col">
                            <span className="text-body-large-semi text-text-primary">
                                {integrationData.integration.display_name || integrationData.template.display_name} x {displayName}
                            </span>
                            <span className="text-body-medium-regular text-text-secondary">{email ?? connectionResponse.connection.connection_id}</span>
                        </div>
                    </div>

                    <TabsList>
                        {tabs.map((tab) => (
                            <TabsTrigger key={tab.segment} value={tab.segment} asChild>
                                <Link to={`${basePath}/${tab.segment}`}>{tab.label}</Link>
                            </TabsTrigger>
                        ))}
                        <button
                            type="button"
                            className="w-fit px-3 py-2 inline-flex items-center gap-1.5 cursor-pointer text-text-secondary !text-body-medium-medium border-b-2 border-b-transparent transition-colors hover:text-text-primary hover:border-text-tertiary focus-default"
                            onClick={() => {
                                openPlaygroundWithContext({
                                    integration: integrationData.integration.unique_key,
                                    connection: connectionResponse.connection.connection_id
                                });
                            }}
                        >
                            Playground
                            <ExternalLink className="size-4" />
                        </button>
                    </TabsList>
                </div>

                <Outlet context={context} />
            </Tabs>
        </DashboardLayout>
    );
};

function getActiveTabSegment(pathname: string, basePath: string): string {
    const rest = pathname.slice(basePath.length).replace(/^\//, '');
    const segment = rest.split('/')[0];
    return segment || 'auth';
}
