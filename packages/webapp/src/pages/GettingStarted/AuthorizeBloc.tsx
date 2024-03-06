import { useMemo, useState } from 'react';
import { Prism } from '@mantine/prism';
import Nango, { AuthError } from '@nangohq/frontend';
import { useAnalyticsTrack } from '../../utils/analytics';
import { Steps } from './utils';
import Button from '../../components/ui/button/Button';
import CopyButton from '../../components/ui/button/CopyButton';

export const AuthorizeBloc: React.FC<{
    step: Steps;
    hostUrl: string;
    publicKey: string;
    providerConfigKey: string;
    connectionId: string;
    onProgress: (id: number) => Promise<void>;
}> = ({ step, connectionId, hostUrl, providerConfigKey, publicKey, onProgress }) => {
    const analyticsTrack = useAnalyticsTrack();
    const [error, setError] = useState<string | null>(null);
    const [id, setId] = useState<number | undefined>(undefined);

    const onAuthorize = async () => {
        analyticsTrack('web:getting_started:authorize');
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

                analyticsTrack('web:getting_started:authorize_error');
                return;
            }

            const json = (await res.json()) as { id: number };
            idTmp = json.id;
            setId(idTmp);
        } catch (err) {
            setError(err instanceof Error ? `error: ${err.message}` : 'An unexpected error occurred');
            return;
        }

        try {
            // Start the oauth process
            const nango = new Nango({ host: hostUrl, publicKey });
            await nango.auth(providerConfigKey, connectionId);

            console.log('on progress');
            void onProgress(idTmp);
        } catch (err: unknown) {
            setError(err instanceof AuthError ? `${err.type} error: ${err.message}` : 'An unexpected error occurred');
        }
    };

    const authorizeSnippet = useMemo<string>(() => {
        return `import Nango from '@nangohq/frontend';

const nango = new Nango({ publicKey: '${publicKey}' });

nango.auth('${providerConfigKey}', '${connectionId}')
`;
    }, [publicKey, providerConfigKey, connectionId]);

    return (
        <div className="mt-8 ml-6">
            <div
                className={`p-4 rounded-md relative ${step !== Steps.Authorize ? 'border border-green-900 bg-gradient-to-r from-[#0C1E1A] to-[#0E1115]' : ''}`}
            >
                <div className="absolute left-[-2.22rem] top-4 w-6 h-6 rounded-full ring-black bg-[#0e1014] flex items-center justify-center">
                    <div className={`w-2 h-2 rounded-full ring-1 ${step !== Steps.Authorize ? 'ring-[#318463]' : 'ring-white'} bg-transparent`}></div>
                </div>
                <h2 className="text-xl">Authorize end users</h2>
                <h3 className="text-text-light-gray mb-6">Let users authorize your integration (GitHub in this example) in your frontend.</h3>
                <div className="border border-border-gray rounded-md text-white text-sm py-2">
                    <div className="flex justify-between items-center px-4 py-4 border-b border-border-gray">
                        <Button type="button" variant="black" className="cursor-default pointer-events-none">
                            Frontend
                        </Button>
                        <CopyButton dark text={authorizeSnippet} />
                    </div>
                    <Prism noCopy language="typescript" className="p-3 transparent-code border-b border-border-gray" colorScheme="dark">
                        {authorizeSnippet}
                    </Prism>
                    <div className="px-4 py-4">
                        {step === Steps.Authorize ? (
                            <Button type="button" variant="primary" onClick={onAuthorize}>
                                <img className="h-5" src="/images/unlock-icon.svg" alt="" />
                                Authorize GitHub
                            </Button>
                        ) : (
                            <span className="mx-2 text-[#34A853]">🎉 GitHub Authorized!</span>
                        )}
                    </div>
                    {error && <p className="mt-2 mx-4 text-sm text-red-600">{error}</p>}
                </div>
            </div>
        </div>
    );
};
