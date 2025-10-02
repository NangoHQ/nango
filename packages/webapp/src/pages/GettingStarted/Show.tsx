import { CodeXml, ExternalLink, KeySquare, LockOpen, PartyPopper, RefreshCcw, Waypoints, Webhook } from 'lucide-react';
import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';

import { FirstStep } from './FirstStep';
import { SecondStep } from './SecondStep';
import { ThirdStep } from './ThirdStep';
import VerticalSteps from './components/VerticalSteps';
import { patchGettingStarted, useGettingStarted } from '../../hooks/useGettingStarted';
import { useToast } from '../../hooks/useToast';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { useAnalyticsTrack } from '../../utils/analytics';
import { SlackIcon } from '@/assets/SlackIcon';

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
        <DashboardLayout fullWidth className="flex flex-row p-0 max-h-full">
            <Helmet>
                <title>Getting Started - Nango</title>
            </Helmet>
            <div className="flex-1 flex flex-col p-11 gap-10 overflow-y-auto">
                <header className="flex flex-col gap-3.5">
                    <h2 className="flex text-left text-2xl font-semibold tracking-tight text-text-primary">Getting Started</h2>
                    <p className="text-text-secondary text-sm">Try connecting Nango with Google Calendar to see how integrations work.</p>
                </header>
                <VerticalSteps
                    className="w-full max-w-[800px]"
                    currentStep={currentStep}
                    steps={[
                        {
                            id: 'authorize-google-calendar',
                            icon: KeySquare,
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
                            )
                        },
                        {
                            id: 'access-google-calendar-api',
                            icon: LockOpen,
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
                                    active={currentStep >= 1}
                                    completed={currentStep >= 2}
                                />
                            )
                        },
                        ...(currentStep >= 2
                            ? [
                                  {
                                      id: 'go-deeper',
                                      icon: PartyPopper,
                                      branded: true,
                                      content: <ThirdStep onSetupIntegrationClicked={() => analyticsTrack('web:getting_started:setup-integration-clicked')} />
                                  }
                              ]
                            : [])
                    ]}
                />
            </div>
            <div className="w-[352px] flex flex-col gap-2.5 bg-nav-gradient-50 justify-self-end p-6.5 pt-11">
                <h4 className="text-s leading-5 text-text-secondary uppercase">DISCOVER THE NANGO PLATFORM</h4>

                <div className="flex flex-col gap-5">
                    <DocCard
                        to="https://docs.nango.dev/getting-started/quickstart/embed-in-your-app"
                        icon={CodeXml}
                        title="Embed in your app"
                        description="Let your users authorize 3rd-party APIs seamlessly."
                    />
                    <DocCard
                        to="https://docs.nango.dev/guides/use-cases/proxy"
                        icon={Waypoints}
                        title="Proxy"
                        description="Run authenticated API requests to external APIs."
                    />
                    <DocCard
                        to="https://docs.nango.dev/guides/use-cases/syncs"
                        icon={RefreshCcw}
                        title="Syncs"
                        description="Continously sync data from external APIs."
                    />
                    <DocCard
                        to="https://docs.nango.dev/guides/use-cases/webhooks"
                        icon={Webhook}
                        title="Webhooks"
                        description="Listen to webhooks from external APIs."
                    />
                    <DocCard
                        to="https://nango.dev/slack"
                        icon={SlackIcon}
                        title="Join the Slack community"
                        description="Seek help from the Nango team and the community."
                    />
                </div>
            </div>
        </DashboardLayout>
    );
};

const DocCard = ({ to, icon, title, description }: { to: string; icon: React.ElementType; title: string; description: string }) => {
    const IconComponent = icon;
    return (
        <Link to={to} className="inline-flex gap-2 px-4 py-6 border border-border-muted rounded">
            <IconComponent className="shrink-0 size-4.5 text-icon-primary" />
            <div className="flex flex-col gap-1">
                <h5 className="text-sm font-semibold leading-5 text-text-primary">{title}</h5>
                <p className="text-sm leading-5 text-text-disabled">{description}</p>
            </div>
            <ExternalLink className="shrink-0 size-3.5 text-icon-disabled ml-auto" />
        </Link>
    );
};
