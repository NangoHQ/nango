import { Braces, CheckCircle2, ExternalLink, Info, XCircle } from 'lucide-react';
import { useMemo } from 'react';

import { CodeBlock } from '../CodeBlock';
import { JSON_DISPLAY_LIMIT } from './types';
import { Alert, AlertActions, AlertButtonLink, AlertDescription } from '../ui/alert';
import { Separator } from '../ui/separator';
import { usePlaygroundStore } from '@/store/playground';
import { getLogsUrl } from '@/utils/logs';

// TODO: set to true once the records list page is ready
const showRecordsButton = false;

interface Props {
    env: string;
    isSync: boolean;
}

export const PlaygroundResult: React.FC<Props> = ({ env, isSync }) => {
    const result = usePlaygroundStore((s) => s.result);
    const playgroundIntegration = usePlaygroundStore((s) => s.integration);
    const playgroundConnection = usePlaygroundStore((s) => s.connection);
    const playgroundFunction = usePlaygroundStore((s) => s.function);
    const setPlaygroundOpen = usePlaygroundStore((s) => s.setOpen);

    const resultJson = useMemo(() => {
        if (!result) return '';
        try {
            const json = JSON.stringify(result.data, null, 2);
            return json.length >= JSON_DISPLAY_LIMIT ? 'Result too large to display' : json;
        } catch {
            return String(result.data);
        }
    }, [result]);

    if (!result) return null;

    return (
        <>
            <div className="flex flex-col gap-3">
                <Separator className="bg-border-muted" />
                <p className="text-text-primary text-body-small-semi">Results</p>

                <Alert
                    variant={
                        result.state === 'waiting' || result.state === 'running' || result.state === 'operation_not_found'
                            ? 'info'
                            : result.success
                              ? 'success'
                              : 'error'
                    }
                    className="px-3 py-2"
                >
                    {result.state === 'waiting' || result.state === 'running' || result.state === 'operation_not_found' ? (
                        <Info />
                    ) : result.success ? (
                        <CheckCircle2 />
                    ) : (
                        <XCircle />
                    )}
                    <AlertDescription className="text-body-small-regular">
                        {result.state === 'invalid_input'
                            ? 'Invalid input (see details below)'
                            : result.state === 'operation_not_found'
                              ? 'Triggered successfully but could not track the operation'
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
                                    syncs: isSync ? playgroundFunction : undefined,
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
