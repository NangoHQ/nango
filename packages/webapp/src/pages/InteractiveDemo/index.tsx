import { useState, useEffect } from 'react';

import DashboardLayout from '../../layout/DashboardLayout';
import { LeftNavBarItems } from '../../components/LeftNavBar';

import { useStore } from '../../store';
import { useAnalyticsTrack } from '../../utils/analytics';
import { AuthorizeBloc } from './AuthorizeBloc';
import { FetchBloc } from './FetchBloc';
import { Steps, providerConfigKey } from './utils';
import { NextBloc } from './NextBloc';
import { ActionBloc } from './ActionBloc';
import { WebhookBloc } from './WebhookBloc';
import { DeployBloc } from './DeployBloc';
import Spinner from '../../components/ui/Spinner';
import { useEnvironment } from '../../hooks/useEnvironment';
import type { GetOnboardingStatus } from '@nangohq/types';

export const InteractiveDemo: React.FC = () => {
    const [loaded, setLoaded] = useState(false);
    const [initialLoad, setInitialLoad] = useState(false);
    const [step, setStep] = useState<Steps>(Steps.Start);
    const [connectionId, setConnectionId] = useState('');
    const [onboardingId, setOnboardingId] = useState<number>();
    const [records, setRecords] = useState<Record<string, unknown>[]>([]);
    const analyticsTrack = useAnalyticsTrack();

    const env = useStore((state) => state.env);
    const { environmentAndAccount } = useEnvironment(env);

    useEffect(() => {
        if (env !== 'dev') {
            window.location.href = `/${env}/integrations`;
        }
    }, [env]);

    useEffect(() => {
        if (!environmentAndAccount) {
            return;
        }

        const { email } = environmentAndAccount;

        let strippedEmail = email.includes('@') ? email.split('@')[0] : email;
        strippedEmail = strippedEmail.replace(/[^a-zA-Z0-9]/g, '_');
        setConnectionId(strippedEmail);
        setLoaded(true);
    }, [setLoaded, setConnectionId, environmentAndAccount]);

    useEffect(() => {
        const getProgress = async () => {
            const params = {
                env,
                connection_id: connectionId
            };

            const res = await fetch(`/api/v1/onboarding?${new URLSearchParams(params).toString()}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            setInitialLoad(true);

            if (res.status !== 200) {
                return;
            }

            const json = (await res.json()) as GetOnboardingStatus['Reply'];
            if ('error' in json) {
                return;
            }

            setStep(json.progress || 0);
            setOnboardingId(json.id);

            if (json.records) {
                setRecords(json.records);
            }
        };

        if (connectionId) {
            void getProgress();
        }
    }, [setInitialLoad, connectionId, env]);

    const updateProgress = async (args: { progress: number }) => {
        const res = await fetch(`/api/v1/onboarding?env=${env}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ progress: args.progress })
        });

        if (!res.ok) {
            return;
        }
    };

    useEffect(() => {
        if (!onboardingId) {
            return;
        }

        void updateProgress({ progress: step });
    }, [onboardingId, step, env]);

    const onAuthorize = (id: number) => {
        setOnboardingId(id);
        setStep(Steps.Authorize);
        setTimeout(() => {
            document.getElementById('demo-deploy')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 500); // Wait for the popup to close
    };

    const onDeploy = () => {
        setStep(Steps.Deploy);
        setTimeout(() => {
            document.getElementById('demo-webhook')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 16);
    };

    const onWebhookConfirm = () => {
        analyticsTrack('web:demo:webhook');
        setStep(Steps.Webhooks);
        setTimeout(() => {
            document.getElementById('demo-fetch')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 16);
    };

    const onFetch = (records: Record<string, unknown>[]) => {
        setStep(Steps.Fetch);
        setRecords(records);
        // We don't scroll automatically to let users check their records
    };

    const onActionConfirm = () => {
        setStep(Steps.Write);
        setTimeout(() => {
            document.getElementById('demo-next')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 16);
    };

    const onClickNext = () => {
        analyticsTrack('web:demo:next');
        setStep(Steps.Complete);
    };

    const resetOnboarding = () => {
        setStep(Steps.Start);
    };

    if (!environmentAndAccount) {
        return null;
    }

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.InteractiveDemo}>
            <div className="text-white pb-10">
                <div>
                    <h1 className="text-left text-3xl font-semibold tracking-tight text-white flex items-center gap-4">
                        <span onDoubleClick={resetOnboarding}>Interactive Demo </span>
                        {(!loaded || !initialLoad) && <Spinner size={1.2} />}
                    </h1>
                    <h2 className="mt-2 text-sm text-zinc-400">Using GitHub as an example, discover how to integrate with Nango in 3 minutes.</h2>
                </div>
                <div className="flex flex-col gap-8 mt-10">
                    {loaded && initialLoad && (
                        <>
                            <AuthorizeBloc
                                step={step}
                                connectionId={connectionId}
                                hostUrl={environmentAndAccount.host}
                                providerConfigKey={providerConfigKey}
                                publicKey={environmentAndAccount.environment.secret_key}
                                onProgress={onAuthorize}
                            />

                            <div id="demo-deploy">
                                <DeployBloc step={step} onProgress={onDeploy} />
                            </div>

                            <div id="demo-webhook">
                                <WebhookBloc step={step} connectionId={connectionId} records={records} onProgress={onWebhookConfirm} />
                            </div>

                            <div id="demo-fetch">
                                <FetchBloc
                                    step={step}
                                    connectionId={connectionId}
                                    providerConfigKey={providerConfigKey}
                                    secretKey={environmentAndAccount.environment.secret_key}
                                    records={records}
                                    onProgress={onFetch}
                                />
                            </div>

                            <div id="demo-action">
                                <ActionBloc
                                    step={step}
                                    connectionId={connectionId}
                                    providerConfigKey={providerConfigKey}
                                    secretKey={environmentAndAccount.environment.secret_key}
                                    onProgress={onActionConfirm}
                                />
                            </div>

                            <div id="demo-next">{step >= Steps.Write && <NextBloc onProgress={onClickNext} />}</div>
                        </>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
};
