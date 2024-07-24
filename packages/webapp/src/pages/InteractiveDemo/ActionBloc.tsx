import { useEffect, useMemo, useState } from 'react';
import { Prism } from '@mantine/prism';
import { Language, Steps, actionName, endpointAction } from './utils';
import Button from '../../components/ui/button/Button';
import { Bloc, Tab } from './Bloc';
import { cn } from '../../utils/utils';
import { CopyButton } from '../../components/ui/button/CopyButton';
import { useAnalyticsTrack } from '../../utils/analytics';
import { CheckCircledIcon, ExternalLinkIcon } from '@radix-ui/react-icons';
import { curlSnippet, nodeActionSnippet } from '../../utils/language-snippets';
import { useStore } from '../../store';
import { useMeta } from '../../hooks/useMeta';
import { apiFetch } from '../../utils/api';
import type { NangoModel } from '@nangohq/types';
import { useUser } from '../../hooks/useUser';

export const ActionBloc: React.FC<{ step: Steps; providerConfigKey: string; connectionId: string; secretKey: string; onProgress: () => void }> = ({
    step,
    providerConfigKey,
    connectionId,
    secretKey,
    onProgress
}) => {
    const analyticsTrack = useAnalyticsTrack();
    const { meta } = useMeta();
    const { user: me } = useUser();

    const [language, setLanguage] = useState<Language>(Language.Node);
    const [title, setTitle] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    const baseUrl = useStore((state) => state.baseUrl);

    const snippet = useMemo(() => {
        const model: NangoModel = { name: 'CreateIssue', fields: [{ name: 'title', value: title }] };
        if (language === Language.Node) {
            return nodeActionSnippet({
                actionName,
                secretKey,
                connectionId,
                providerConfigKey,
                input: model
            });
        } else {
            return curlSnippet(baseUrl, endpointAction, secretKey, connectionId, providerConfigKey, model, 'POST');
        }
    }, [title, providerConfigKey, connectionId, secretKey, language, baseUrl]);

    useEffect(() => {
        if (meta && title === '') {
            setTitle(`${me!.email.split('@')[0]}'s example issue`);
        }
    }, [meta, title]);

    const onDeploy = async () => {
        analyticsTrack('web:demo:action');
        setLoading(true);

        try {
            // Deploy the provider
            const res = await apiFetch(`/api/v1/onboarding/action?env=dev`, {
                method: 'POST',
                body: JSON.stringify({ connectionId, title })
            });

            const json = (await res.json()) as { message?: string } | { action: { url: string } };
            if (res.status !== 200 || 'message' in json || !('action' in json)) {
                setError('message' in json && json.message ? json.message : 'An unexpected error occurred');

                analyticsTrack('web:demo:action_error');
                return;
            }

            setError(null);
            analyticsTrack('web:demo:action_success');
            setUrl(json.action.url);
            onProgress();
        } catch (err) {
            analyticsTrack('web:demo:action_error');
            setError(err instanceof Error ? `error: ${err.message}` : 'An unexpected error occurred');
            return;
        } finally {
            setLoading(false);
        }
    };

    return (
        <Bloc
            title="Write back or perform workflows"
            subtitle={<>Create a sample GitHub issue from your backend, via Nango.</>}
            active={step === Steps.Fetch}
            done={step >= Steps.Write}
            noTrack
        >
            {step === Steps.Fetch && (
                <div className="flex items-center gap-4 mb-4">
                    <div className="border-l pl-4 h-10 flex items-center">Issue Title</div>
                    <div className="flex-grow">
                        <input
                            type="text"
                            value={title}
                            placeholder="Enter a GitHub issue title"
                            onChange={(e) => setTitle(e.target.value)}
                            className="border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-10 w-1/2 appearance-none rounded-md border px-3 py-2 text-sm placeholder-gray-400 shadow-sm focus:outline-none"
                        />
                    </div>
                </div>
            )}
            <div className="border bg-zinc-900 border-zinc-900 rounded-lg text-white text-sm">
                <div className="flex justify-between items-center px-5 py-4 bg-zinc-900 rounded-lg">
                    <div className="flex gap-4">
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
                    <CopyButton text={snippet} />
                </div>
                <Prism noCopy language="typescript" className="p-3 transparent-code bg-black" colorScheme="dark">
                    {snippet}
                </Prism>
                <div className="px-6 py-4">
                    {step === Steps.Fetch ? (
                        <Button type="button" variant="primary" onClick={onDeploy} disabled={!title} isLoading={loading}>
                            Create GitHub issue
                        </Button>
                    ) : (
                        <span className=" text-emerald-300 text-sm flex items-center h-9 gap-2">
                            <CheckCircledIcon className="h-5 w-5" />
                            Issue created!
                            <a href={url || 'https://github.com/NangoHQ/interactive-demo/issues'} target="_blank" rel="noreferrer">
                                <Button variant="secondary">
                                    View <ExternalLinkIcon />
                                </Button>
                            </a>
                        </span>
                    )}
                    {error && <p className="mt-2 text-sm text-red-500 py-1 px-1">{error}</p>}
                </div>
            </div>
        </Bloc>
    );
};
