import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';

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

type Interval = ReturnType<typeof setInterval>;

export const InteractiveDemo: React.FC = () => {
    const [loaded, setLoaded] = useState(false);
    const [step, setStep] = useState<Steps>(Steps.Start);
    const [publicKey, setPublicKey] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [hostUrl, setHostUrl] = useState('');
    const [connectionId, setConnectionId] = useState('');
    const [, setServerErrorMessage] = useState('');
    const [onboardingId, setOnboardingId] = useState<number>();
    const [records, setRecords] = useState<Record<string, unknown>[]>([]);
    const [syncStillRunning, setSyncStillRunning] = useState(true);
    const [pollingInterval, setPollingInterval] = useState<Interval | undefined>(undefined);
    const analyticsTrack = useAnalyticsTrack();

    const env = useStore((state) => state.cookieValue);

    const getProjectInfoAPI = useGetProjectInfoAPI();

    useEffect(() => {
        if (env !== 'dev') {
            window.location.href = `/${env}/integrations`;
        }
    }, [env]);

    useEffect(() => {
        return () => {
            if (pollingInterval) {
                clearInterval(pollingInterval);
            }
        };
    }, [pollingInterval]);

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
                provider_config_key: providerConfigKey,
                connection_id: connectionId,
                model
            };

            const res = await fetch(`/api/v1/onboarding?${new URLSearchParams(params).toString()}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

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
                setSyncStillRunning(false);
            }
        };

        if (connectionId) {
            void getProgress();
        }
    }, [loaded, setLoaded, connectionId]);

    const updateProgress = async (args: { id: number; progress: number }) => {
        const res = await fetch(`/api/v1/onboarding/${args.id}`, {
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

        void updateProgress({ id: onboardingId, progress: step });
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

        const fetchedRecords = (await res.json()) as Record<string, unknown>[];
        setRecords(fetchedRecords);
    };

    const startPolling = () => {
        if (pollingInterval) {
            return;
        }

        const tmp = setInterval(async () => {
            const params = {
                provider_config_key: providerConfigKey,
                connection_id: connectionId
            };
            const response = await fetch(`/api/v1/onboarding/sync-status?${new URLSearchParams(params).toString()}`);

            if (response.status !== 200) {
                clearInterval(pollingInterval);
                setPollingInterval(undefined);

                analyticsTrack('web:demo:fetch_error');
                return;
            }

            const data = (await response.json()) as { jobStatus: string };

            if (data.jobStatus === 'SUCCESS') {
                clearInterval(pollingInterval);
                await fetchRecords();
                setSyncStillRunning(false);
                setPollingInterval(undefined);
            }
        }, 1000);
        setPollingInterval(tmp);
    };

    const onAuthorize = (id: number) => {
        setOnboardingId(id);
        setStep(Steps.Authorize);
    };

    const onDeploy = () => {
        setStep(Steps.Deploy);
    };

    const onWebhookConfirm = () => {
        analyticsTrack('web:demo:webhook');
        setStep(Steps.Webhooks);
    };

    const onFetch = () => {
        analyticsTrack('web:demo:fetch');
        if (records.length === 0) {
            startPolling();
        }
        setStep(Steps.Fetch);
    };

    const onActionConfirm = () => {
        analyticsTrack('web:demo:action');
        setStep(Steps.Write);
    };

    const resetOnboarding = () => {
        setStep(Steps.Start);
    };

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.InteractiveDemo}>
            <div className="text-white">
                <div>
                    <h1 className="text-left text-3xl font-semibold tracking-tight text-white">
                        <span onDoubleClick={resetOnboarding}>Interactive Demo</span>
                    </h1>
                    <h2 className="mt-2 text-sm text-zinc-400">Using GitHub as an example, discover how to integrate with Nango in 3 minutes.</h2>
                </div>
                <div className="flex flex-col gap-8 mt-10">
                    <AuthorizeBloc
                        step={step}
                        connectionId={connectionId}
                        hostUrl={hostUrl}
                        providerConfigKey={providerConfigKey}
                        publicKey={publicKey}
                        onProgress={onAuthorize}
                    />

                    <DeployBloc step={step} onProgress={onDeploy} />

                    <WebhookBloc step={step} records={records} onProgress={onWebhookConfirm} />

                    <FetchBloc
                        step={step}
                        connectionId={connectionId}
                        providerConfigKey={providerConfigKey}
                        secretKey={secretKey}
                        records={records}
                        syncStillRunning={syncStillRunning}
                        onProgress={onFetch}
                    />

                    <ActionBloc step={step} connectionId={connectionId} providerConfigKey={providerConfigKey} onProgress={onActionConfirm} />

                    {step === Steps.Complete && <NextBloc step={step} />}
                </div>
            </div>
            <Helmet>
                <style>{'.no-border-modal footer { border-top: none !important;}'}</style>
            </Helmet>
        </DashboardLayout>
    );
};
