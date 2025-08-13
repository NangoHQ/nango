import { IconAnchor, IconKey, IconLockOpen } from '@tabler/icons-react';
import { useEffect } from 'react';
import { Helmet } from 'react-helmet';

import { FirstStep } from './FirstStep';
import { SecondStep } from './SecondStep';
import { ThirdStep } from './ThirdStep';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import VerticalSteps from '../../components/VerticalSteps';
import { patchGettingStarted, useGettingStarted } from '../../hooks/useGettingStarted';
import { useToast } from '../../hooks/useToast';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';

export const GettingStarted: React.FC = () => {
    // const analyticsTrack = useAnalyticsTrack();
    const env = useStore((state) => state.env);
    const { data: gettingStarted, error, mutate, isLoading } = useGettingStarted(env);

    const { toast } = useToast();

    useEffect(() => {
        if (error) {
            toast({ title: 'Failed to get getting started', variant: 'error' });
        }
    }, [error]);

    if (isLoading || !gettingStarted) {
        return <div>Loading...</div>;
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.GettingStarted}>
            <Helmet>
                <title>Getting Started - Nango</title>
            </Helmet>
            <header className="flex items-center mb-8">
                <h2 className="flex text-left text-3xl font-semibold tracking-tight text-text-primary">Try Nango with Google Calendar</h2>
            </header>
            <VerticalSteps
                className="w-full"
                currentStep={gettingStarted.data.connection ? gettingStarted.data.step : 0}
                steps={[
                    {
                        id: 'authorize-google-calendar',
                        content: (
                            <FirstStep
                                connection={gettingStarted.data.connection}
                                integration={gettingStarted.data.meta.integration}
                                onConnected={async (connectionId) => {
                                    await patchGettingStarted(env, { connection_id: connectionId, step: 1 });
                                    await mutate();
                                }}
                                onDisconnected={async () => {
                                    await mutate();
                                }}
                            />
                        ),
                        icon: IconKey
                    },
                    {
                        id: 'access-google-calendar-api',
                        content: (
                            <SecondStep
                                connectionId={gettingStarted.data.connection?.connection_id}
                                providerConfigKey={gettingStarted.data.meta.integration?.unique_key}
                                onExecuted={async () => {
                                    await patchGettingStarted(env, { step: 2 });
                                    await mutate();
                                }}
                                completed={gettingStarted.data.step >= 2}
                            />
                        ),
                        icon: IconLockOpen
                    },
                    ...(gettingStarted.data.step === 2
                        ? [
                              {
                                  id: 'go-deeper',
                                  content: <ThirdStep />,
                                  icon: IconAnchor
                              }
                          ]
                        : [])
                ]}
            />
        </DashboardLayout>
    );
};
