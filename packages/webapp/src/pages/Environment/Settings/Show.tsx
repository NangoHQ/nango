import { Helmet } from 'react-helmet';

import { BackendSettings } from './Backend';
import { ConnectUISettings } from './ConnectUISettings';
import { DeprecatedSettings } from './Deprecated';
import { Functions } from './Functions';
import { General } from './General';
import { Notifications } from './Notifications';
import { SlackAlertsSettings } from './SlackAlerts';
import { Telemetry } from './Telemetry';
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
            <div className="flex-1"></div>
            <div className="max-w-[900px] min-w-[715px] w-full">{children}</div>
        </NavigationContent>
    );
};
export const EnvironmentSettings: React.FC = () => {
    const env = useStore((state) => state.env);
    const { team } = useTeam(env);

    const { environmentAndAccount } = useEnvironment(env);
    const [activeTab, setActiveTab] = useHashNavigation('general');

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
    const canSeeDeprecatedAuthorization = new Date(team.created_at) <= new Date('2025-08-25');

    return (
        <DashboardLayout fullWidth className="flex-col justify-center">
            <Helmet>
                <title>Environment Settings - Nango</title>
            </Helmet>

            <div className="flex mb-8 justify-center">
                <div className="flex text-left text-3xl tracking-tight text-white w-[1153px] gap-2.5">
                    <h2 className="font-semibold">Environment Settings</h2>
                    <Badge size="custom" className="px-3.5 text-title-group">
                        {env}
                    </Badge>
                </div>
            </div>
            <div className="flex h-fit justify-center" key={env}>
                <Navigation value={activeTab} onValueChange={setActiveTab} className="max-w-[1153px] mx-auto">
                    <NavigationList className="w-[209px]">
                        <NavigationTrigger value="general">General</NavigationTrigger>
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
                    <EnvironmentSettingsContent value={'backend'}>
                        <BackendSettings />
                    </EnvironmentSettingsContent>
                    <EnvironmentSettingsContent value={'connect-ui'}>
                        <ConnectUISettings />
                    </EnvironmentSettingsContent>
                    <EnvironmentSettingsContent value={'webhooks'}>
                        <Notifications />
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
