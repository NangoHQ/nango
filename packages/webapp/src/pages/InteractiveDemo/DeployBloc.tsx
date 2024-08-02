import Button from '../../components/ui/button/Button';
import { Bloc, Tab } from './Bloc';
import { Steps, endpointSync, model, providerConfigKey } from './utils';
import { Prism } from '@mantine/prism';
import { useMemo, useState } from 'react';
import { cn } from '../../utils/utils';
import { useAnalyticsTrack } from '../../utils/analytics';
import { CheckCircledIcon } from '@radix-ui/react-icons';
import { apiFetch } from '../../utils/api';

type File = 'github-issues-demo.ts' | 'nango.yaml';

export const DeployBloc: React.FC<{ step: Steps; onProgress: () => void }> = ({ step, onProgress }) => {
    const analyticsTrack = useAnalyticsTrack();

    const [file, setFile] = useState<File>('github-issues-demo.ts');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    const snippet = useMemo(() => {
        if (file === 'github-issues-demo.ts') {
            return `function fetchData(nango: NangoSync) {
    // Fetch issues from GitHub.
    const res = await nango.get({ endpoint: '/repos/NangoHQ/interactive-demo/issues' });

    // Map issues to your preferred schema.
    const issues = res.data.map(issue => ({ id, title, url }));

    // Persist issues to the Nango cache.
    await nango.batchSave(issues, '${model}');
}`;
        } else {
            return `integrations:
  ${providerConfigKey}:
    syncs:
      sync-github-issues:
        description: Fetches the GitHub issues from showcase repository
        scopes: public_repo
        runs: every 5 minutes
        output: ${model}
        endpoint: ${endpointSync}
models:
  ${model}:
    id: integer
    title: string
    url: string`;
        }
    }, [file]);

    const onDeploy = async () => {
        analyticsTrack('web:demo:deploy');
        setLoading(true);

        try {
            // Deploy the provider
            const res = await apiFetch(`/api/v1/onboarding/deploy?env=dev`, {
                method: 'POST'
            });

            if (res.status !== 200) {
                const json = (await res.json()) as { message?: string };
                setError(json.message ? json.message : 'An unexpected error occurred');

                analyticsTrack('web:demo:deploy_error');
                return;
            }

            setError(null);
            analyticsTrack('web:demo:deploy_success');
            onProgress();
        } catch (err) {
            analyticsTrack('web:demo:deploy_error');
            setError(err instanceof Error ? `error: ${err.message}` : 'An unexpected error occurred');
            return;
        } finally {
            setLoading(false);
        }
    };

    return (
        <Bloc
            title="Deploy an integration"
            subtitle={
                <>
                    The following script runs on Nango&apos;s infrastructure & syncs GitHub{' '}
                    <a href="https://github.com/NangoHQ/interactive-demo" target="_blank" rel="noreferrer" className="underline">
                        sample issues
                    </a>{' '}
                    to Nango.
                </>
            }
            active={step === Steps.Authorize}
            done={step >= Steps.Deploy}
        >
            <div className="border bg-zinc-900 border-zinc-900 rounded-lg text-white text-sm">
                <div className="flex justify-between items-center px-5 py-4 bg-zinc-900 rounded-lg">
                    <div className="flex gap-4">
                        <Tab
                            variant={'zombie'}
                            className={cn('cursor-default', file !== 'github-issues-demo.ts' && 'cursor-pointer bg-zinc-900 pointer-events-auto')}
                            onClick={() => {
                                setFile('github-issues-demo.ts');
                            }}
                        >
                            ./github-issues-demo.ts <span className="text-zinc-500">(script)</span>
                        </Tab>
                        <Tab
                            variant={'zombie'}
                            className={cn('cursor-default', file !== 'nango.yaml' && 'cursor-pointer bg-zinc-900 pointer-events-auto')}
                            onClick={() => {
                                setFile('nango.yaml');
                            }}
                        >
                            ./nango.yaml <span className="text-zinc-500">(config)</span>
                        </Tab>
                    </div>
                </div>

                <Prism noCopy language={file === 'nango.yaml' ? 'yaml' : 'typescript'} className="p-3 transparent-code bg-black" colorScheme="dark">
                    {snippet}
                </Prism>
                <div className="px-6 py-4">
                    {step === Steps.Authorize ? (
                        <Button type="button" variant="primary" onClick={onDeploy} isLoading={loading}>
                            Deploy GitHub integration
                        </Button>
                    ) : (
                        <span className="text-emerald-300 text-sm flex items-center h-9 gap-2">
                            <CheckCircledIcon className="h-5 w-5" />
                            Integration deployed!
                        </span>
                    )}
                    {error && <p className="text-sm text-red-500 py-1">{error}</p>}
                </div>
            </div>
        </Bloc>
    );
};
