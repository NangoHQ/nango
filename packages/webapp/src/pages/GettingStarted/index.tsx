import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';

import { baseUrl as getBaseUrl } from '../../utils/utils';
import DashboardLayout from '../../layout/DashboardLayout';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import { useGetProjectInfoAPI } from '../../utils/api';

import { useStore } from '../../store';
import { useAnalyticsTrack } from '../../utils/analytics';
import { AuthorizeBloc } from './AuthorizeBloc';
import { SynchronizeBloc } from './SynchronizeBloc';
import { Steps, providerConfigKey, model } from './utils';
import { NextBloc } from './NextBloc';
import { ActionBloc } from './ActionBloc';
import { WebhookBloc } from './WebhookBloc';
import { Account } from '../../types';

type Interval = ReturnType<typeof setInterval>;

export default function GettingStarted() {
    const [loaded, setLoaded] = useState(false);
    const [step, setStep] = useState<Steps>(Steps.Authorize);
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
            window.location.href = '/integrations';
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

            const { progress, id, records: fetchedRecords } = (await res.json()) as { progress: Steps; id?: number; records?: Record<string, unknown>[] };
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

    const updateProgress = async (progress: number) => {
        const res = await fetch(`/api/v1/onboarding/${onboardingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ progress })
        });

        if (!res.ok) {
            const { message } = (await res.json()) as { message: string };
            setServerErrorMessage(message);

            return;
        }
    };

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

                analyticsTrack('web:getting_started:sync_error');
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

    const onAuthorize = async (id: number) => {
        await updateProgress(Steps.Authorize);
        setOnboardingId(id);
        setStep(Steps.Sync);
    };

    const onSynchronize = async () => {
        analyticsTrack('web:getting_started:sync');
        if (records.length === 0) {
            startPolling();
        }
        setStep(Steps.Receive);
        await updateProgress(Steps.Receive);
    };

    const onWebhookConfirm = async () => {
        analyticsTrack('web:getting_started:webhook');
        setStep(Steps.Write);
        await updateProgress(Steps.Write);
    };

    const onActionConfirm = () => {
        analyticsTrack('web:getting_started:action');
        setStep(Steps.Ship);
        void updateProgress(Steps.Ship);
    };

    const resetOnboarding = async () => {
        if (step !== Steps.Authorize) {
            setStep(Steps.Authorize);
            await updateProgress(Steps.Authorize);
        }
    };

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.GettingStarted}>
            <div className="text-white">
                <div>
                    <h1 className="text-left text-4xl font-semibold tracking-tight text-white">
                        How integrations work with <span onDoubleClick={resetOnboarding}>Nango</span>
                    </h1>
                    <h2 className="mt-4 text-xl text-text-light-gray">
                        Using GitHub as an example, follow these steps to synchronize external data with the Nango API.
                    </h2>
                </div>
                <div className="border-l border-border-gray">
                    <AuthorizeBloc
                        step={step}
                        connectionId={connectionId}
                        hostUrl={hostUrl}
                        providerConfigKey={providerConfigKey}
                        publicKey={publicKey}
                        onProgress={onAuthorize}
                    />

                    <SynchronizeBloc
                        step={step}
                        connectionId={connectionId}
                        providerConfigKey={providerConfigKey}
                        secretKey={secretKey}
                        records={records}
                        syncStillRunning={syncStillRunning}
                        onProgress={onSynchronize}
                    />

                    <WebhookBloc step={step} records={records} onProgress={onWebhookConfirm} />

                    <ActionBloc step={step} connectionId={connectionId} providerConfigKey={providerConfigKey} onProgress={onActionConfirm} />

                    <NextBloc step={step} />
                </div>
            </div>
            <Helmet>
                <style>{'.no-border-modal footer { border-top: none !important;}'}</style>
            </Helmet>
        </DashboardLayout>
    );
}
