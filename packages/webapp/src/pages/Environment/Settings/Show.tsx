import { useEffect, useState } from 'react';
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

export const EnvironmentSettings: React.FC = () => {
    const env = useStore((state) => state.env);
    const { team } = useTeam(env);

    const { environmentAndAccount } = useEnvironment(env);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        if (!environmentAndAccount || scrolled) {
            return;
        }

        setScrolled(true);
        const hash = window.location.hash.slice(1); // Remove the '#' character from the hash
        if (!hash) {
            return;
        }

        const element = document.getElementById(hash);
        if (!element) {
            return;
        }

        element.scrollIntoView({ behavior: 'smooth' });
    }, [environmentAndAccount]);

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
                    <Skeleton className="w-[209px] 4xl:w-[236px]" />
                    <Skeleton className="h-full w-full" />
                </div>
            </DashboardLayout>
        );
    }

    const canSeeDeprecatedAuthorization = new Date(team.created_at) <= new Date('2025-08-25');
    return (
        <DashboardLayout className="flex-col">
            <Helmet>
                <title>Environment Settings - Nango</title>
            </Helmet>

            <div className="flex justify-between mb-8 items-center">
                <div className="flex text-left text-3xl tracking-tight text-white gap-2.5">
                    <h2 className="font-semibold">Environment Settings</h2>
                    <Badge size="custom" className="px-3.5 text-title-group">
                        {env}
                    </Badge>
                </div>
            </div>
            <div className="flex h-fit" key={env}>
                <Navigation defaultValue="general">
                    <NavigationList className="w-[209px] 4xl:w-[236px]">
                        <NavigationTrigger value={'general'}>General</NavigationTrigger>
                        <NavigationTrigger value={'backend'}>Backend</NavigationTrigger>
                        <NavigationTrigger value={'connect-ui'}>Connect UI</NavigationTrigger>
                        <NavigationTrigger value={'webhooks'}>Webhooks</NavigationTrigger>
                        <NavigationTrigger value={'slack-alerts'}>Slack alerts</NavigationTrigger>
                        <NavigationTrigger value={'functions'}>Functions</NavigationTrigger>
                        <NavigationTrigger value={'telemetry'}>Telemetry</NavigationTrigger>
                        {canSeeDeprecatedAuthorization && <NavigationTrigger value={'deprecated'}>Deprecated</NavigationTrigger>}
                    </NavigationList>
                    <NavigationContent value={'general'} className="h-fit flex flex-col gap-6 flex-initial w-full">
                        <General />
                    </NavigationContent>
                    <NavigationContent value={'backend'} className="h-fit flex flex-col gap-6 flex-initial w-full">
                        <BackendSettings />
                    </NavigationContent>
                    <NavigationContent value={'connect-ui'} className="h-fit flex flex-col gap-6 flex-initial w-full">
                        <ConnectUISettings />
                    </NavigationContent>
                    <NavigationContent value={'webhooks'} className="h-fit flex flex-col gap-6 flex-initial w-full">
                        <Notifications />
                    </NavigationContent>
                    <NavigationContent value={'slack-alerts'} className="h-fit flex flex-col gap-6 flex-initial w-full">
                        <SlackAlertsSettings />
                    </NavigationContent>
                    <NavigationContent value={'functions'} className="h-fit flex flex-col gap-6 flex-initial w-full">
                        <Functions />
                    </NavigationContent>
                    <NavigationContent value={'telemetry'} className="h-fit flex flex-col gap-6 flex-initial w-full">
                        <Telemetry />
                    </NavigationContent>
                    {canSeeDeprecatedAuthorization && (
                        <NavigationContent value={'deprecated'} className="h-fit flex flex-col gap-6 flex-initial w-full">
                            <DeprecatedSettings />
                        </NavigationContent>
                    )}
                </Navigation>
            </div>
        </DashboardLayout>
    );
};
