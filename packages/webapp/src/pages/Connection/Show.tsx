import { Bot, Play } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { Link, Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom';

import { Button } from '@nangohq/design-system';

import { CriticalErrorAlert } from '@/components/patterns/CriticalErrorAlert';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useCanUseAgentPlayground } from '@/hooks/useCanUseAgentPlayground';
import { useConnection } from '@/hooks/useConnections';
import { useGetIntegration } from '@/hooks/useIntegration';
import { useUser } from '@/hooks/useUser';
import DashboardLayout from '@/layout/DashboardLayout';
import { integrationPrompt, playgroundDraftState } from '@/pages/AgentPlayground/draft';
import { useStore } from '@/store';
import { getConnectionDisplayName, getEndUserEmail } from '@/utils/endUser';
import { openPlaygroundWithContext, useCanRunFunctions } from '@/utils/playground';
import { IntegrationLogoWithProfile } from './components/IntegrationLogoWithProfile';

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
    const canOpenPlayground = useCanRunFunctions();
    const canUseAgentPlayground = useCanUseAgentPlayground();
    const { user } = useUser();
    const {
        data: connectionResponse,
        error: connectionError,
        isLoading: connectionLoading
    } = useConnection({ env, provider_config_key: providerConfigKey! }, { connectionId: connectionId! });
    const { data: integrationResponse, error: integrationError, isLoading: providerLoading } = useGetIntegration(env, providerConfigKey!);

    if (connectionError || integrationError) {
        return (
            <DashboardLayout width="wide">
                <Helmet>
                    <title>Connection - Nango</title>
                </Helmet>
                <CriticalErrorAlert message={connectionError ? 'Failed to load connection data' : 'Failed to load integration data for this connection'} />
            </DashboardLayout>
        );
    }

    if (connectionLoading || providerLoading || !connectionResponse || !integrationResponse) {
        return (
            <DashboardLayout width="wide">
                <Helmet>
                    <title>Connection - Nango</title>
                </Helmet>
                <div className="flex flex-col gap-5">
                    <div className="flex gap-4 items-center">
                        <Skeleton className="size-20" />
                        <div className="flex flex-col gap-1">
                            <span className="text-body-large-semi text-text-strong">
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
    const integrationName = integrationData.integration.display_name || integrationData.template.display_name;
    // The playground only uses connections tagged with the signed-in user's email.
    const canTryInAgentPlayground = canUseAgentPlayground && connectionResponse.connection.tags?.['end_user_email'] === user?.email;

    const basePath = `/${env}/connections/${encodeURIComponent(providerConfigKey || '')}/${encodeURIComponent(connectionId || '')}`;
    const activeSegment = getActiveTabSegment(location.pathname, basePath);

    const context: ConnectionOutletContext = {
        connectionData: connectionResponse,
        integrationData,
        providerConfigKey: providerKey
    };

    return (
        <DashboardLayout width="wide" hasPageHeading>
            <Helmet>
                <title>{connectionResponse.endUser?.email || connectionResponse.connection.connection_id} - Connection - Nango</title>
            </Helmet>

            <Tabs value={activeSegment}>
                <div className="flex flex-col gap-5">
                    <div className="flex gap-4 items-center">
                        <IntegrationLogoWithProfile providerConfigKey={providerKey} provider={connectionResponse.provider} profile={displayName} />
                        <div className="flex flex-col">
                            <h1 className="text-body-large-semi text-text-strong">
                                {integrationName} x {displayName}
                            </h1>
                            <span className="text-body-medium-regular text-text-secondary">{email ?? connectionResponse.connection.connection_id}</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <TabsList className="w-fit">
                            {tabs.map((tab) => (
                                <TabsTrigger key={tab.segment} value={tab.segment} asChild>
                                    <Link to={`${basePath}/${tab.segment}`}>{tab.label}</Link>
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        <div className="flex items-center gap-2">
                            {canOpenPlayground && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                        openPlaygroundWithContext({
                                            source: 'connection',
                                            integration: integrationData.integration.unique_key,
                                            connection: connectionResponse.connection.connection_id
                                        })
                                    }
                                >
                                    <Play />
                                    Test run
                                </Button>
                            )}
                            {canTryInAgentPlayground && (
                                <Button asChild variant="primary" size="sm">
                                    <Link
                                        to={`/${env}/playground/agent`}
                                        state={playgroundDraftState(integrationPrompt({ provider: connectionResponse.provider, integrationName }))}
                                    >
                                        <Bot />
                                        Try in Playground
                                    </Link>
                                </Button>
                            )}
                        </div>
                    </div>
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
