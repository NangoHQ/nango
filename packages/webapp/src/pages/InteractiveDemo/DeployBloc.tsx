import { CheckCircleIcon } from '@heroicons/react/24/outline';
import Button from '../../components/ui/button/Button';
import { Bloc, Tab } from './Bloc';
import { Steps, endpoint, model, providerConfigKey } from './utils';
import { Prism } from '@mantine/prism';
import { useMemo, useState } from 'react';
import { cn } from '../../utils/utils';
import { useAnalyticsTrack } from '../../utils/analytics';

type File = 'sync-github-issues.ts' | 'nango.yaml';

export const DeployBloc: React.FC<{ step: Steps; onProgress: () => void }> = ({ step, onProgress }) => {
    const analyticsTrack = useAnalyticsTrack();

    const [file, setFile] = useState<File>('sync-github-issues.ts');
    const [error, setError] = useState<string | null>(null);

    const snippet = useMemo(() => {
        if (file === 'sync-github-issues.ts') {
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
        endpoint: ${endpoint}
models:
  ${model}:
    id: integer
    title: string
    url: string`;
        }
    }, [file]);

    const onDeploy = async () => {
        analyticsTrack('web:demo:deploy');

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
            title="Deploy an integration"
            subtitle={
                <>
                    The following script will sync GitHub issues (from this{' '}
                    <a href="https://github.com/NangoHQ/interactive-demo" target="_blank" rel="noreferrer" className="underline">
                        showcase repo
                    </a>
                    ) to Nango. Scripts run on Nango&apos;s architecture.
                </>
            }
            active={step === Steps.Authorize}
            done={step >= Steps.Deploy}
        >
            <div className="border bg-zinc-900 border-zinc-800 rounded-lg text-white text-sm">
                <div className="flex justify-between items-center px-5 py-4 bg-zinc-900 rounded-lg">
                    <div className="space-x-4">
                        <Tab
                            variant={'zombie'}
                            className={cn('cursor-default', file !== 'sync-github-issues.ts' && 'cursor-pointer bg-zinc-900 pointer-events-auto')}
                            onClick={() => {
                                setFile('sync-github-issues.ts');
                            }}
                        >
                            ./sync-github-issues.ts <span className="text-zinc-500">(script)</span>
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
                <div className="flex items-center px-4 py-4">
                    {step === Steps.Authorize ? (
                        <Button type="button" variant="primary" onClick={onDeploy}>
                            Deploy GitHub integration
                        </Button>
                    ) : (
                        <span className="mx-2 text-emerald-300 text-sm flex items-center h-9 gap-2">
                            <CheckCircleIcon className="h-5 w-5" />
                            GitHub-to-Nango syncing enabled!
                        </span>
                    )}
                </div>
                {error && <p className="mt-2 mx-4 text-sm text-red-600">{error}</p>}
            </div>
        </Bloc>
    );
};
