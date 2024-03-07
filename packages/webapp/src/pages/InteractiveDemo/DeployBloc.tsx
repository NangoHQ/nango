import { CheckCircleIcon } from '@heroicons/react/24/outline';
import Button from '../../components/ui/button/Button';
import { Bloc, Tab } from './Bloc';
import { Steps, endpoint, model, providerConfigKey } from './utils';
import { Prism } from '@mantine/prism';
import { useMemo, useState } from 'react';
import { cn } from '../../utils/utils';

type File = 'sync-github-issues.ts' | 'nango.yaml';

export const DeployBloc: React.FC<{ step: Steps; onProgress: () => void }> = ({ step, onProgress }) => {
    const [file, setFile] = useState<File>('sync-github-issues.ts');
    const snippet = useMemo(() => {
        if (file === 'sync-github-issues.ts') {
            return `function fetchData(nango: NangoSync) {
    // Fetch issues from GitHub.
    const res = await nango.get({ '/repos/NangoHQ/interactive-demo/issues' });

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
        description: |
          Fetches the Github issues from all a user's repositories.
          Details: full sync, doesn't track deletes, metadata is not required.
        scopes: public_repo
        runs: every 5 minutes
        output: ${model}
        endpoint: ${endpoint}
models:
  ${model}:
    id: integer
    owner: string
    repo: string
    issue_number: number
    title: string
    author: string
    author_id: string
    state: string
    date_created: date
    date_last_modified: date
    body: string`;
        }
    }, [file]);

    const onDeploy = () => {
        onProgress();
    };

    return (
        <Bloc
            title="Deploy an integration"
            subtitle={<>The following script will sync GitHub issues (from this showcase repo) to Nango. Scripts run on Nango&apos;s architecture.</>}
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
                            <img className="h-5" src="/images/unlock-icon.svg" alt="" />
                            Deploy GitHub integration
                        </Button>
                    ) : (
                        <span className="mx-2 text-emerald-300 text-sm flex items-center h-9 gap-2">
                            <CheckCircleIcon className="h-5 w-5" />
                            GitHub-to-Nango syncing enabled!
                        </span>
                    )}
                </div>
            </div>
        </Bloc>
    );
};
