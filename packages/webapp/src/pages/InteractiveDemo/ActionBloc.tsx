import { useMemo, useState } from 'react';
import { Prism } from '@mantine/prism';
import { Language, Steps } from './utils';
import Button from '../../components/ui/button/Button';
import { Bloc, Tab } from './Bloc';
import { cn } from '../../utils/utils';
import CopyButton from '../../components/ui/button/CopyButton';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { useAnalyticsTrack } from '../../utils/analytics';

export const ActionBloc: React.FC<{ step: Steps; providerConfigKey: string; connectionId: string; secretKey: string; onProgress: () => void }> = ({
    step,
    providerConfigKey,
    connectionId,
    secretKey,
    onProgress
}) => {
    const analyticsTrack = useAnalyticsTrack();
    const [language, setLanguage] = useState<Language>(Language.Node);

    const snippet = useMemo(() => {
        return `import { Nango } from '@nangohq/node'

# Find the secret key in your environment settings (must remain confidential).
const nango = new Nango({ secretKey: '${secretKey}' });

const issues = await nango.triggerAction(
    '${providerConfigKey}',
    '${connectionId}',
    'issue',
    { title: 'TBD test issue' }
);`;
    }, [providerConfigKey, connectionId, secretKey]);
    const [error, setError] = useState<string | null>(null);

    const onDeploy = async () => {
        analyticsTrack('web:demo:action');

        try {
            // Deploy the provider
            const res = await fetch(`/api/v1/onboarding/deploy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.status !== 200) {
                const json = (await res.json()) as { message?: string };
                setError(json.message ? json.message : 'An unexpected error occurred');

                analyticsTrack('web:demo:deploy_error');
                return;
            }

            setError(null);
            onProgress();
        } catch (err) {
            setError(err instanceof Error ? `error: ${err.message}` : 'An unexpected error occurred');
            return;
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
            <div className="border bg-zinc-900 border-zinc-800 rounded-lg text-white text-sm">
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
                <div className="px-4 py-4">
                    {step === Steps.Fetch ? (
                        <Button type="button" variant="primary" onClick={onDeploy}>
                            Create GitHub issue
                        </Button>
                    ) : (
                        <span className="mx-2 text-emerald-300 text-sm flex items-center h-9 gap-2">
                            <CheckCircleIcon className="h-5 w-5" />
                            Issue created!
                        </span>
                    )}
                </div>
                {error && <p className="mt-2 mx-4 text-sm text-red-600">{error}</p>}
            </div>
        </Bloc>
    );
};

{
    /* <div className="mt-8 ml-6">
<div className={`p-4 rounded-md relative ${step > Steps.Write ? 'border border-green-900 bg-gradient-to-r from-[#0C1E1A] to-[#0E1115]' : ''}`}>
    <div className="absolute left-[-2.22rem] top-4 w-6 h-6 rounded-full ring-black bg-[#0e1014] flex items-center justify-center">
        <div className={`w-2 h-2 rounded-full ring-1 ${step > Steps.Write ? 'ring-[#318463]' : 'ring-white'} bg-transparent`}></div>
    </div>
    <h2 className={`text-xl${step < Steps.Write ? ' text-text-light-gray' : ''}`}>Write back to APIs</h2>
    {step >= Steps.Write && (
        <>
            <h3 className="text-text-light-gray mb-6">Push updates back to external APIs, with unified & customizable schemas across APIs.</h3>
            <div className="border border-border-gray rounded-md text-white text-sm py-2 mb-5">
                <Prism language="typescript" colorScheme="dark" noCopy className="transparent-code">
                    {actionSnippet}
                </Prism>
            </div>
            {step === Steps.Write && (
                <Button variant="primary" onClick={onProgress}>
                    Got it!
                </Button>
            )}
        </>
    )}
</div>
</div> */
}
