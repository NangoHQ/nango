import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';

import { BackendSettings } from './Backend';
import { ConnectUISettings } from './ConnectUISettings';
import { DeprecatedSettings } from './Deprecated';
import { Functions } from './Functions';
import { General } from './General';
import { Logs } from './Logs';
import { Notifications } from './Notifications';
import { SlackAlertsSettings } from './SlackAlerts';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { useTeam } from '../../../hooks/useTeam';
import DashboardLayout from '../../../layout/DashboardLayout';
import { useStore } from '../../../store';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components-v2/Navigation';

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
            <DashboardLayout fullWidth className="flex-col w-[988px] 4xl:w-full px-0 4xl:px-[208px]">
                <Helmet>
                    <title>Environment Settings - Nango</title>
                </Helmet>
                <div className="flex justify-between mb-8 items-center">
                    <div className="flex text-left text-3xl tracking-tight text-white">
                        <h2 className="font-semibold">Environment Settings &mdash;</h2>&nbsp;{env}
                    </div>
                </div>
                <div className="flex gap-2 flex-col">
                    <Skeleton style={{ width: '100%' }} />
                    <Skeleton style={{ width: '100%' }} />
                    <Skeleton style={{ width: '100%' }} />
                </div>
            </DashboardLayout>
        );
    }

    const canSeeDeprecatedAuthorization = new Date(team.created_at) <= new Date('2025-08-25');
    return (
        <DashboardLayout fullWidth className="flex-col w-[988px] 4xl:w-full px-0 4xl:px-[208px]">
            <Helmet>
                <title>Environment Settings - Nango</title>
            </Helmet>

            <div className="flex justify-between mb-8 items-center">
                <div className="flex text-left text-3xl tracking-tight text-white">
                    <h2 className="font-semibold">Environment Settings &mdash;</h2>&nbsp;{env}
                </div>
            </div>
            <div className="flex h-fit" key={env}>
                <Navigation defaultValue="general">
                    <NavigationList className="w-[209px] 4xl:w-[236px]">
                        <NavigationTrigger value={'general'}>General</NavigationTrigger>
                        <NavigationTrigger value={'backend'}>Backend</NavigationTrigger>
                        <NavigationTrigger value={'connect-ui'}>Connect UI</NavigationTrigger>
                        <NavigationTrigger value={'webhooks'}>Notifications</NavigationTrigger>
                        <NavigationTrigger value={'slack-alerts'}>Slack alerts</NavigationTrigger>
                        <NavigationTrigger value={'functions'}>Functions</NavigationTrigger>
                        <NavigationTrigger value={'logs'}>Logs</NavigationTrigger>
                        {canSeeDeprecatedAuthorization && <NavigationTrigger value={'deprecated'}>Deprecated</NavigationTrigger>}
                    </NavigationList>
                    <NavigationContent value={'general'} className="flex flex-col gap-6 w-[715px] 4xl:w-[900px]">
                        <General />
                    </NavigationContent>
                    <NavigationContent value={'backend'} className="flex flex-col gap-6 w-[715px] 4xl:w-[900px] flex-initial">
                        <BackendSettings />
                    </NavigationContent>
                    <NavigationContent value={'connect-ui'} className="flex flex-col gap-6 w-[715px] 4xl:w-[900px] flex-initial">
                        <ConnectUISettings />
                    </NavigationContent>
                    <NavigationContent value={'webhooks'} className="flex flex-col gap-6 w-[715px] 4xl:w-[900px] flex-initial">
                        <Notifications />
                    </NavigationContent>
                    <NavigationContent value={'slack-alerts'} className="flex flex-col gap-6 w-[715px] 4xl:w-[900px] flex-initial">
                        <SlackAlertsSettings />
                    </NavigationContent>
                    <NavigationContent value={'functions'} className="flex flex-col gap-6 w-[715px] 4xl:w-[900px] flex-initial">
                        <Functions />
                    </NavigationContent>
                    <NavigationContent value={'logs'} className="flex flex-col gap-6 w-[715px] 4xl:w-[900px] flex-initial">
                        <Logs />
                    </NavigationContent>
                    {canSeeDeprecatedAuthorization && (
                        <NavigationContent value={'deprecated'} className="flex flex-col gap-6 w-[715px] 4xl:w-[900px] flex-initial">
                            <DeprecatedSettings />
                        </NavigationContent>
                    )}
                </Navigation>
            </div>
        </DashboardLayout>
    );
};
