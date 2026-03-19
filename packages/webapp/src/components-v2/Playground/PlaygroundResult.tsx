import { Braces, CheckCircle2, ExternalLink, Info, XCircle } from 'lucide-react';

import { CodeBlock } from '../CodeBlock';
import { JSON_DISPLAY_LIMIT } from './types';
import { Alert, AlertActions, AlertButtonLink, AlertDescription } from '../ui/alert';
import { Separator } from '../ui/separator';
import { useStore } from '@/store';
import { getLogsUrl } from '@/utils/logs';

// TODO: set to true once the records list page is ready
const showRecordsButton = false;

interface Props {
    env: string;
    isSync: boolean;
}

export const PlaygroundResult: React.FC<Props> = ({ env, isSync }) => {
    const result = useStore((s) => s.playground.result);
    const playgroundIntegration = useStore((s) => s.playground.integration);
    const playgroundConnection = useStore((s) => s.playground.connection);
    const playgroundFunction = useStore((s) => s.playground.function);
    const setPlaygroundOpen = useStore((s) => s.setPlaygroundOpen);

    if (!result) return null;

    let resultJson = '';
    try {
        resultJson = JSON.stringify(result.data, null, 2);
    } catch {
        resultJson = String(result.data);
    }
    if (resultJson.length >= JSON_DISPLAY_LIMIT) {
        resultJson = 'Result too large to display';
    }

    return (
        <>
            <Separator className="bg-border-muted" />
            <div className="flex flex-col gap-3">
                <p className="text-text-primary text-body-small-semi">Results</p>

                <Alert variant={result.state === 'waiting' || result.state === 'running' ? 'info' : result.success ? 'success' : 'error'} className="px-3 py-2">
                    {result.state === 'waiting' || result.state === 'running' ? (
                        <Info className="size-4" />
                    ) : result.success ? (
                        <CheckCircle2 className="size-4" />
                    ) : (
                        <XCircle className="size-4" />
                    )}
                    <AlertDescription className="text-body-small-regular">
                        {result.state === 'invalid_input'
                            ? 'Invalid input (see details below)'
                            : result.state === 'metadata_update_failed'
                              ? 'Failed to update connection metadata'
                              : result.state === 'waiting' || result.state === 'running'
                                ? `Running for ${(result.durationMs / 1000).toFixed(1)}s`
                                : result.success
                                  ? `Ran in ${(result.durationMs / 1000).toFixed(1)}s`
                                  : `Failed after ${(result.durationMs / 1000).toFixed(1)}s`}
                    </AlertDescription>
                    <AlertActions>
                        {isSync && playgroundIntegration && playgroundConnection && showRecordsButton && (
                            <AlertButtonLink
                                to={`/${env}/connections/${playgroundIntegration}/${encodeURIComponent(playgroundConnection)}`}
                                variant={result.success ? 'success-secondary' : 'error-secondary'}
                                onClick={() => setPlaygroundOpen(false)}
                            >
                                Records
                            </AlertButtonLink>
                        )}
                        {playgroundIntegration && playgroundConnection && playgroundFunction && (
                            <AlertButtonLink
                                to={getLogsUrl({
                                    env,
                                    ...(result.operationId ? { operationId: result.operationId } : {}),
                                    integrations: playgroundIntegration,
                                    connections: playgroundConnection,
                                    syncs: playgroundFunction,
                                    live: true
                                })}
                                variant={result.success ? 'success' : 'error'}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Logs <ExternalLink />
                            </AlertButtonLink>
                        )}
                    </AlertActions>
                </Alert>

                <CodeBlock language="json" displayLanguage="JSON" icon={<Braces />} code={resultJson} constrainHeight={false} />
            </div>
        </>
    );
};
