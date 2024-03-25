import { useMemo, useState } from 'react';
import { Prism } from '@mantine/prism';
import Nango, { AuthError } from '@nangohq/frontend';
import { useAnalyticsTrack } from '../../utils/analytics';
import { Steps } from './utils';
import Button from '../../components/ui/button/Button';
import CopyButton from '../../components/ui/button/CopyButton';
import { Bloc, Tab } from './Bloc';
import { CheckCircledIcon, GitHubLogoIcon } from '@radix-ui/react-icons';

export const AuthorizeBloc: React.FC<{
    step: Steps;
    hostUrl: string;
    publicKey: string;
    providerConfigKey: string;
    connectionId: string;
    onProgress: (id: number) => Promise<void> | void;
}> = ({ step, connectionId, hostUrl, providerConfigKey, publicKey, onProgress }) => {
    const analyticsTrack = useAnalyticsTrack();
    const [error, setError] = useState<string | null>(null);
    const [id, setId] = useState<number | undefined>(undefined);

    const onAuthorize = async () => {
        analyticsTrack('web:demo:authorize');
        let idTmp = id;

        try {
            // Setup the onboarding process
            const res = await fetch(`/api/v1/onboarding`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.status !== 201) {
                const json = (await res.json()) as { message?: string };
                setError(json.message ? json.message : 'An unexpected error occurred');

                analyticsTrack('web:demo:authorize_error');
                return;
            }

            const json = (await res.json()) as { id: number };
            idTmp = json.id;
            setId(idTmp);
        } catch (err) {
            analyticsTrack('web:demo:authorize_error');
            setError(err instanceof Error ? `error: ${err.message}` : 'An unexpected error occurred');
            return;
        }

        try {
            // Start the oauth process
            const nango = new Nango({ host: hostUrl, publicKey });
            await nango.auth(providerConfigKey, connectionId);

            setError(null);
            analyticsTrack('web:demo:authorize_success');
            void onProgress(idTmp);
        } catch (err: unknown) {
            analyticsTrack('web:demo:authorize_error');
            setError(err instanceof AuthError ? `${err.type} error: ${err.message}` : 'An unexpected error occurred');
        }
    };

    const snippet = useMemo<string>(() => {
        return `import Nango from '@nangohq/frontend';

// Find the public key in your environment settings (safe to reveal).
const nango = new Nango({ publicKey: '${publicKey}' });

nango.auth('${providerConfigKey}', '${connectionId}')
`;
    }, [publicKey, providerConfigKey, connectionId]);

    return (
        <Bloc title="Authorize an API" subtitle={<>Let users authorize GitHub in your frontend.</>} active={step === Steps.Start} done={step !== Steps.Start}>
            <div className="border bg-zinc-900 border-zinc-900 rounded-lg text-white text-sm">
                <div className="flex justify-between items-center px-5 py-4 bg-zinc-900 rounded-lg">
                    <Tab>Frontend</Tab>
                    <CopyButton dark text={snippet} />
                </div>
                <Prism noCopy language="typescript" className="p-3 transparent-code bg-black font-['Roboto Mono']" colorScheme="dark">
                    {snippet}
                </Prism>
                <div className="px-6 py-4 bg-zinc-900 rounded-lg">
                    {step === Steps.Start ? (
                        <Button type="button" variant="primary" onClick={onAuthorize}>
                            <GitHubLogoIcon />
                            Authorize GitHub
                        </Button>
                    ) : (
                        <span className="text-emerald-300 text-sm flex items-center h-9 gap-2">
                            <CheckCircledIcon className="h-5 w-5" />
                            GitHub Authorized!
                        </span>
                    )}
                    {error && <p className="text-sm text-red-500 py-1">{error}</p>}
                </div>
            </div>
        </Bloc>
    );
};
