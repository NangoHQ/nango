import { useState, useEffect } from 'react';

import { baseUrl as getBaseUrl } from '../../utils/utils';
import DashboardLayout from '../../layout/DashboardLayout';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import { useGetProjectInfoAPI } from '../../utils/api';

import { useStore } from '../../store';
import { useAnalyticsTrack } from '../../utils/analytics';
import { AuthorizeBloc } from './AuthorizeBloc';
import { FetchBloc } from './FetchBloc';
import { Steps, providerConfigKey, model } from './utils';
import { NextBloc } from './NextBloc';
import { ActionBloc } from './ActionBloc';
import { WebhookBloc } from './WebhookBloc';
import { Account, OnboardingStatus } from '../../types';
import { DeployBloc } from './DeployBloc';
import Spinner from '../../components/ui/Spinner';

export const InteractiveDemo: React.FC = () => {
    const [loaded, setLoaded] = useState(false);
    const [initialLoad, setInitialLoad] = useState(false);
    const [step, setStep] = useState<Steps>(Steps.Start);
    const [publicKey, setPublicKey] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [hostUrl, setHostUrl] = useState('');
    const [connectionId, setConnectionId] = useState('');
    const [, setServerErrorMessage] = useState<string | null>(null);
    const [onboardingId, setOnboardingId] = useState<number>();
    const [records, setRecords] = useState<Record<string, unknown>[]>([]);
    const analyticsTrack = useAnalyticsTrack();

    const env = useStore((state) => state.cookieValue);

    const getProjectInfoAPI = useGetProjectInfoAPI();

    useEffect(() => {
        if (env !== 'dev') {
            window.location.href = `/${env}/integrations`;
        }
    }, [env]);

    useEffect(() => {
        const getAccount = async () => {
            const res = await getProjectInfoAPI();

            if (res?.status !== 200) {
                return;
            }

            const account = ((await res.json()) as { account: Account })['account'];
            setPublicKey(account.public_key);
            setSecretKey(account.secret_key);
            setHostUrl(account.host || getBaseUrl());

            const email = account.email;
            let strippedEmail = email.includes('@') ? email.split('@')[0] : email;
            strippedEmail = strippedEmail.replace(/[^a-zA-Z0-9]/g, '_');
            setConnectionId(strippedEmail);
        };

        if (!loaded) {
            setLoaded(true);
            void getAccount();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded, setLoaded, getProjectInfoAPI, setPublicKey, setSecretKey]);

    useEffect(() => {
        const getProgress = async () => {
            const params = {
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

            const { progress, id, records: fetchedRecords } = (await res.json()) as OnboardingStatus;
            setStep(progress || 0);
            if (id) {
                setOnboardingId(id);
            }

            if (fetchedRecords) {
                setRecords(fetchedRecords);
            }
        };

        if (connectionId) {
            void getProgress();
        }
    }, [setInitialLoad, connectionId]);

    const updateProgress = async (args: { progress: number }) => {
        const res = await fetch(`/api/v1/onboarding`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ progress: args.progress })
        });

        if (!res.ok) {
            const { message } = (await res.json()) as { message: string };
            setServerErrorMessage(message);

            return;
        }
    };

    useEffect(() => {
        if (!onboardingId) {
            return;
        }

        void updateProgress({ progress: step });
    }, [onboardingId, step]);

    const fetchRecords = async () => {
        const params = { model };

        const res = await fetch(`/records?${new URLSearchParams(params).toString()}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${secretKey}`,
                'Content-Type': 'application/json',
                'Provider-Config-Key': providerConfigKey,
                'Connection-Id': connectionId
            }
        });

        if (res.status !== 200) {
            const { message } = (await res.json()) as { message: string };
            setServerErrorMessage(message);
            return;
        }

        const fetchedRecords = (await res.json()) as { records: Record<string, unknown>[] };
        setRecords(fetchedRecords.records);
    };

    const onAuthorize = (id: number) => {
        setOnboardingId(id);
        setStep(Steps.Authorize);
        setTimeout(() => {
            document.getElementById('demo-deploy')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 16);
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

    const onFetch = () => {
        void fetchRecords();
        setStep(Steps.Fetch);
        setTimeout(() => {
            document.getElementById('demo-action')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 16);
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
                                hostUrl={hostUrl}
                                providerConfigKey={providerConfigKey}
                                publicKey={publicKey}
                                onProgress={onAuthorize}
                            />

                            <div id="demo-deploy">
                                <DeployBloc step={step} onProgress={onDeploy} />
                            </div>

                            <div id="demo-webhook">
                                <WebhookBloc step={step} records={records} onProgress={onWebhookConfirm} />
                            </div>

                            <div id="demo-fetch">
                                <FetchBloc
                                    step={step}
                                    connectionId={connectionId}
                                    providerConfigKey={providerConfigKey}
                                    secretKey={secretKey}
                                    records={records}
                                    onProgress={onFetch}
                                />
                            </div>

                            <div id="demo-action">
                                <ActionBloc
                                    step={step}
                                    connectionId={connectionId}
                                    providerConfigKey={providerConfigKey}
                                    secretKey={secretKey}
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
