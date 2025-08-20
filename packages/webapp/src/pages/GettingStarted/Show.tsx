import { IconAnchor, IconKey, IconLockOpen } from '@tabler/icons-react';
import { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';

import { FirstStep } from './FirstStep';
import { SecondStep } from './SecondStep';
import { ThirdStep } from './ThirdStep';
import VerticalSteps from './components/VerticalSteps';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import { patchGettingStarted, useGettingStarted } from '../../hooks/useGettingStarted';
import { useToast } from '../../hooks/useToast';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { useAnalyticsTrack } from '../../utils/analytics';

export const GettingStarted: React.FC = () => {
    const analyticsTrack = useAnalyticsTrack();
    const env = useStore((state) => state.env);
    const { data: gettingStartedResult, error, refetch, isLoading } = useGettingStarted(env);
    const gettingStarted = gettingStartedResult?.data;

    const navigate = useNavigate();
    const { toast } = useToast();

    useEffect(() => {
        if (error) {
            toast({ title: 'Failed to get getting started', variant: 'error' });
            navigate('/');
        }
    }, [error, navigate, toast]);

    let currentStep = gettingStarted?.connection ? (gettingStarted?.step ?? 0) : 0;
    if (isLoading || !gettingStarted) {
        // Just disable every step while loading.
        currentStep = -1;
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
                currentStep={currentStep}
                steps={[
                    {
                        id: 'authorize-google-calendar',
                        renderTitle: (status) => {
                            if (status === 'completed') {
                                return <h3 className="text-success-4 text-lg font-semibold">Google Calendar Authorized!</h3>;
                            }
                            return <h3 className="text-text-primary text-lg font-semibold">Experience the user&apos;s auth flow</h3>;
                        },
                        content: (
                            <FirstStep
                                connection={gettingStarted?.connection ?? null}
                                integration={gettingStarted?.meta.integration ?? null}
                                onConnectClicked={() => analyticsTrack('web:getting_started:connect-clicked')}
                                onConnected={async (connectionId) => {
                                    try {
                                        analyticsTrack('web:getting_started:connection-created');
                                        const { res } = await patchGettingStarted(env, { connection_id: connectionId, step: 1 });
                                        if (!res.ok) {
                                            throw new Error('Failed to patch getting started');
                                        }
                                        await refetch();
                                    } catch {
                                        toast({ title: 'Something went wrong with the getting started flow', variant: 'error' });
                                    }
                                }}
                                onDisconnected={async () => {
                                    try {
                                        analyticsTrack('web:getting_started:connection-disconnected');
                                        await refetch();
                                    } catch {
                                        toast({ title: 'Something went wrong with the getting started flow', variant: 'error' });
                                    }
                                }}
                            />
                        ),
                        icon: IconKey
                    },
                    {
                        id: 'access-google-calendar-api',
                        renderTitle: () => {
                            return <h3 className="text-text-primary text-lg font-semibold">Use Nango as a proxy to make requests to Google Calendar</h3>;
                        },
                        content: (
                            <SecondStep
                                connectionId={gettingStarted?.connection?.connection_id}
                                providerConfigKey={gettingStarted?.meta.integration?.unique_key}
                                onExecuted={async () => {
                                    try {
                                        analyticsTrack('web:getting_started:code-snippet-executed');
                                        const { res } = await patchGettingStarted(env, { step: 2 });
                                        if (!res.ok) {
                                            throw new Error('Failed to patch getting started');
                                        }
                                        await refetch();
                                    } catch {
                                        toast({ title: 'Something went wrong with the getting started flow', variant: 'error' });
                                    }
                                }}
                                completed={currentStep >= 2}
                            />
                        ),
                        icon: IconLockOpen
                    },
                    {
                        id: 'go-deeper',
                        renderTitle: () => {
                            return <h3 className="text-text-primary text-lg font-semibold">Go deeper</h3>;
                        },
                        content: (
                            <ThirdStep
                                onDocumentationLinkClicked={(link) => analyticsTrack(`web:getting_started:documentation-link-clicked`, { link })}
                                onSlackLinkClicked={() => analyticsTrack('web:getting_started:slack-community-link-clicked')}
                            />
                        ),
                        icon: IconAnchor
                    }
                ]}
            />
        </DashboardLayout>
    );
};
