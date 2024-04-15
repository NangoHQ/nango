import { Prism } from '@mantine/prism';
import { ChevronDown, ChevronRight } from '@geist-ui/icons';
import { Language, Steps, endpointSync, model } from './utils';
import Button from '../../components/ui/button/Button';
import { useEffect, useMemo, useState } from 'react';
import { curlSnippet, nodeSnippet } from '../../utils/language-snippets';
import { useStore } from '../../store';
import CopyButton from '../../components/ui/button/CopyButton';
import Spinner from '../../components/ui/Spinner';
import { Bloc, Tab } from './Bloc';
import { cn } from '../../utils/utils';
import { useAnalyticsTrack } from '../../utils/analytics';
import { CheckCircledIcon, InfoCircledIcon } from '@radix-ui/react-icons';

type Interval = ReturnType<typeof setInterval>;

export const FetchBloc: React.FC<{
    step: Steps;
    providerConfigKey: string;
    connectionId: string;
    secretKey: string;
    records: Record<string, unknown>[];
    onProgress: (records: Record<string, unknown>[]) => void;
}> = ({ step, connectionId, providerConfigKey, secretKey, records, onProgress }) => {
    const analyticsTrack = useAnalyticsTrack();

    const [language, setLanguage] = useState<Language>(Language.Node);
    const [error, setError] = useState<string | null>(null);
    const [pollingInterval, setPollingInterval] = useState<Interval | undefined>(undefined);
    const [show, setShow] = useState(true);

    const baseUrl = useStore((state) => state.baseUrl);

    const snippet = useMemo<string>(() => {
        if (language === Language.Node) {
            return nodeSnippet(model, secretKey, connectionId, providerConfigKey);
        } else if (language === Language.cURL) {
            return curlSnippet(baseUrl, endpointSync, secretKey, connectionId, providerConfigKey);
        }
        return '';
    }, [language, baseUrl, secretKey, connectionId, providerConfigKey]);

    useEffect(() => {
        return () => {
            if (pollingInterval) {
                clearInterval(pollingInterval);
            }
        };
    }, [pollingInterval]);

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
            const json = (await res.json()) as { message?: string };
            setError(json.message ? json.message : 'An unexpected error occurred, please retry');
            analyticsTrack('web:demo:fetch_error');
            setPollingInterval(undefined);
            return;
        }

        const fetchedRecords = (await res.json()) as { records: Record<string, unknown>[] };
        if (fetchedRecords.records.length <= 0) {
            setError('An unexpected error occurred, please retry');
            setPollingInterval(undefined);
            return;
        }

        setError(null);
        onProgress(fetchedRecords.records);
        setPollingInterval(undefined);
    };

    const startPolling = () => {
        if (pollingInterval) {
            return;
        }

        analyticsTrack('web:demo:fetch');

        async function poll() {
            const res = await fetch(`/api/v1/onboarding/sync-status?env=dev`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectionId })
            });

            if (res.status !== 200) {
                clearInterval(pollingInterval);
                setPollingInterval(undefined);

                const json = (await res.json()) as { message?: string };
                setError(json.message ? json.message : 'An unexpected error occurred, please retry');

                analyticsTrack('web:demo:fetch_error');
                return;
            }

            const data = (await res.json()) as { jobStatus: string };

            if (data.jobStatus === 'SUCCESS') {
                analyticsTrack('web:demo:fetch_success');
                clearInterval(pollingInterval);
                void fetchRecords();
            }
        }
        const tmp = setInterval(poll, 1000);
        void poll();
        setPollingInterval(tmp);
    };

    const cleanedRecords = useMemo<string>(() => {
        if (records.length <= 0) {
            return '';
        }

        return JSON.stringify(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            records.map(({ _nango_metadata, ...rest }) => {
                return rest;
            }),
            null,
            2
        );
    }, [records]);

    return (
        <Bloc
            title="Fetch the new data"
            subtitle={
                <>
                    Fetch GitHub{' '}
                    <a
                        href="https://github.com/NangoHQ/interactive-demo/issues?q=is%3Aissue+is%3Aopen+label%3Ademo"
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                    >
                        sample issues
                    </a>{' '}
                    issues in your backend, via Nango.
                </>
            }
            active={step === Steps.Webhooks}
            done={step >= Steps.Fetch}
        >
            <div className="border bg-zinc-900 border-zinc-900 rounded-lg text-white text-sm">
                <div className="flex justify-between items-center px-5 py-4 bg-zinc-900 rounded-lg">
                    <div className="space-x-4">
                        <Tab
                            variant={language === Language.Node ? 'black' : 'zombie'}
                            className={cn('cursor-default', language !== Language.Node && 'cursor-pointer bg-zinc-900 pointer-events-auto')}
                            onClick={() => {
                                setLanguage(Language.Node);
                            }}
                        >
                            Node
                        </Tab>
                        <Tab
                            variant={language === Language.cURL ? 'black' : 'zombie'}
                            className={cn('cursor-default', language !== Language.cURL && 'cursor-pointer bg-zinc-900 pointer-events-auto')}
                            onClick={() => {
                                setLanguage(Language.cURL);
                            }}
                        >
                            cURL
                        </Tab>
                    </div>
                    <CopyButton dark text={snippet} />
                </div>
                <Prism noCopy language="typescript" className="p-3 transparent-code bg-black" colorScheme="dark">
                    {snippet}
                </Prism>
                <div className="px-6 py-4">
                    {step === Steps.Webhooks && !pollingInterval && (
                        <Button type="button" variant="primary" onClick={startPolling}>
                            <img className="h-5" src="/images/chart-icon.svg" alt="" />
                            Retrieve GitHub Issues
                        </Button>
                    )}
                    {pollingInterval && (
                        <div className="flex items-center">
                            <Spinner size={1} />
                            <span className="ml-2">Please wait while &ldquo;Issues&rdquo; are being fetched</span>
                        </div>
                    )}

                    {step > Steps.Webhooks && (
                        <div>
                            <span className="text-emerald-300 text-sm flex items-center h-9 gap-2">
                                <CheckCircledIcon className="h-5 w-5" />
                                {records.length} issues fetched!
                            </span>
                            <button className="my-2 flex text-zinc-400 text-sm gap-2 py-0" onClick={() => setShow(!show)}>
                                {show ? (
                                    <>
                                        <ChevronDown className="h-5 w-5" />
                                        Hide
                                    </>
                                ) : (
                                    <>
                                        <ChevronRight className="h-5 w-5" />
                                        Show
                                    </>
                                )}
                            </button>
                            {show && (
                                <div>
                                    <div className="mb-2 p-1.5 bg-amber-300 bg-opacity-20 rounded justify-center items-center gap-2 inline-flex text-xs">
                                        <InfoCircledIcon className="h-4 w-4" /> Object schemas are customizable and can be unified across APIs.
                                    </div>
                                    <Prism language="json" colorScheme="dark" className="p-1 transparent-code bg-black" noCopy>
                                        {cleanedRecords}
                                    </Prism>
                                </div>
                            )}
                        </div>
                    )}
                    {error && <p className="text-sm text-red-500 py-1">{error}</p>}
                </div>
            </div>
        </Bloc>
    );
};
