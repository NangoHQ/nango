import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';

import { AuthTab } from './components/AuthTab';
import { IntegrationLogoWithProfile } from './components/IntegrationLogoWithProfile';
import { ErrorPageComponent } from '@/components/ErrorComponent';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components-v2/Tabs';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { useConnection } from '@/hooks/useConnections';
import { useGetIntegration } from '@/hooks/useIntegration';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { getConnectionDisplayName, getEndUserEmail } from '@/utils/endUser';

export const ConnectionShow = () => {
    const env = useStore((state) => state.env);
    const { connectionId, providerConfigKey } = useParams();

    const {
        data: connectionData,
        error: connectionError,
        loading: connectionLoading
    } = useConnection({ env, provider_config_key: providerConfigKey! }, { connectionId: connectionId! });
    const { data: integrationData, error: integrationError, loading: providerLoading } = useGetIntegration(env, providerConfigKey!);

    if (connectionError || integrationError) {
        return <ErrorPageComponent title="Connection" />;
    }

    if (connectionLoading || providerLoading || !connectionData || !integrationData) {
        return (
            <DashboardLayout fullWidth>
                <Helmet>
                    <title>Connection - Nango</title>
                </Helmet>
                <Skeleton className="size-15" />
            </DashboardLayout>
        );
    }

    const displayName = getConnectionDisplayName({
        endUser: connectionData.endUser,
        connectionId: connectionData.connection.connection_id,
        connectionTags: connectionData.connection.tags
    });

    const email = getEndUserEmail(connectionData.endUser, connectionData.connection.tags);

    return (
        <DashboardLayout>
            <Helmet>
                <title>{connectionData.endUser?.email || connectionData.connection.connection_id} - Connection - Nango</title>
            </Helmet>

            <div className="flex flex-col gap-5">
                <div className="flex gap-4 items-center">
                    <IntegrationLogoWithProfile provider={connectionData.provider} profile={displayName} />
                    <div className="flex flex-col">
                        <span className="text-body-large-semi text-text-primary">
                            {integrationData.integration.display_name || integrationData.template.display_name} x {displayName}
                        </span>
                        <span className="text-body-medium-regular text-text-secondary">{email ?? connectionData.connection.connection_id}</span>
                    </div>
                </div>

                <Tabs defaultValue="auth">
                    <TabsList>
                        <TabsTrigger value="auth">Auth</TabsTrigger>
                        <TabsTrigger value="syncs">Syncs</TabsTrigger>
                        <TabsTrigger value="settings">Settings</TabsTrigger>
                    </TabsList>
                    <TabsContent value="auth">
                        <AuthTab connectionData={connectionData} />
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    );
};
