import { useState } from 'react';
import { Helmet } from 'react-helmet';

import { ApiKeys } from './ApiKeys';
import { BackendSettings } from './Backend';
import { ConnectUISettings } from './ConnectUISettings';
import { DeprecatedSettings } from './Deprecated';
import { Functions } from './Functions';
import { General } from './General';
import { SlackAlertsSettings } from './SlackAlerts';
import { Telemetry } from './Telemetry';
import { Webhooks } from './Webhooks';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { useTeam } from '../../../hooks/useTeam';
import DashboardLayout from '../../../layout/DashboardLayout';
import { useStore } from '../../../store';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components-v2/Navigation';
import { Badge } from '@/components-v2/ui/badge';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { useHashNavigation } from '@/hooks/useHashNavigation';

import type { ReactNode } from 'react';

const EnvironmentSettingsContent: React.FC<{ value: string; children: ReactNode }> = ({ value, children }) => {
    return (
        <NavigationContent value={value} className="h-fit flex w-full">
            <div className="w-full">{children}</div>
        </NavigationContent>
    );
};
export const EnvironmentSettings: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: teamData } = useTeam(env);
    const team = teamData?.data;

    const { data } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const isProd = environmentAndAccount?.environment?.is_production || false;
    const [activeTab, setActiveTab] = useHashNavigation('general');
    const [apiKeysResetKey, setApiKeysResetKey] = useState(0);

    if (!environmentAndAccount || !team) {
        return (
            <DashboardLayout className="flex-col">
                <Helmet>
                    <title>Environment Settings - Nango</title>
                </Helmet>
                <div className="flex justify-between mb-8 items-center">
                    <div className="flex text-left text-3xl tracking-tight text-white">
                        <h2 className="font-semibold">Environment Settings &mdash;</h2>&nbsp;{env}
                    </div>
                </div>
                <div className="flex gap-6 h-[280px]">
                    <Skeleton className="w-[209px]" />
                    <Skeleton className="h-full w-full" />
                </div>
            </DashboardLayout>
        );
    }
    const canSeeDeprecatedAuthorization = new Date(team.account.created_at) <= new Date('2025-08-25');

    return (
        <DashboardLayout fullWidth className="flex flex-col gap-8">
            <Helmet>
                <title>Environment Settings - Nango</title>
            </Helmet>

            <div className="flex flex-col gap-2.5">
                <h2 className="text-title-subsection text-text-primary">Environment settings</h2>
                <div className="flex gap-2.5">
                    <span className="text-heading-sm text-text-secondary">{env}</span>
                    {isProd && (
                        <Badge variant="secondary" className="text-heading-sm text-text-secondary">
                            Prod
                        </Badge>
                    )}
                </div>
            </div>

            <div className="flex h-fit justify-center" key={env}>
                <Navigation value={activeTab} onValueChange={setActiveTab}>
                    <NavigationList className="w-[209px]">
                        <NavigationTrigger value="general">General</NavigationTrigger>
                        <NavigationTrigger value="api-keys" onClick={() => setApiKeysResetKey((k) => k + 1)}>
                            API Keys
                        </NavigationTrigger>
                        <NavigationTrigger value="backend">Backend</NavigationTrigger>
                        <NavigationTrigger value="connect-ui">Connect UI</NavigationTrigger>
                        <NavigationTrigger value="webhooks">Webhooks</NavigationTrigger>
                        <NavigationTrigger value="slack-alerts">Slack alerts</NavigationTrigger>
                        <NavigationTrigger value="functions">Functions</NavigationTrigger>
                        <NavigationTrigger value="telemetry">Telemetry</NavigationTrigger>
                        {canSeeDeprecatedAuthorization && <NavigationTrigger value="deprecated">Deprecated</NavigationTrigger>}
                    </NavigationList>
                    <EnvironmentSettingsContent value={'general'}>
                        <General />
                    </EnvironmentSettingsContent>
                    <EnvironmentSettingsContent value={'api-keys'}>
                        <ApiKeys key={apiKeysResetKey} />
                    </EnvironmentSettingsContent>
                    <EnvironmentSettingsContent value={'backend'}>
                        <BackendSettings />
                    </EnvironmentSettingsContent>
                    <EnvironmentSettingsContent value={'connect-ui'}>
                        <ConnectUISettings />
                    </EnvironmentSettingsContent>
                    <EnvironmentSettingsContent value={'webhooks'}>
                        <Webhooks />
                    </EnvironmentSettingsContent>
                    <EnvironmentSettingsContent value={'slack-alerts'}>
                        <SlackAlertsSettings />
                    </EnvironmentSettingsContent>
                    <EnvironmentSettingsContent value={'functions'}>
                        <Functions />
                    </EnvironmentSettingsContent>
                    <EnvironmentSettingsContent value={'telemetry'}>
                        <Telemetry />
                    </EnvironmentSettingsContent>
                    {canSeeDeprecatedAuthorization && (
                        <EnvironmentSettingsContent value={'deprecated'}>
                            <DeprecatedSettings />
                        </EnvironmentSettingsContent>
                    )}
                </Navigation>
            </div>
        </DashboardLayout>
    );
};
