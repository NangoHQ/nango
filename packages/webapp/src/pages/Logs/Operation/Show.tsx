import { format } from 'date-fns';
import { Check, Copy, Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useInterval } from 'react-use';

import { Alert, AlertDescription, Button, COPY_BUTTON_RESET_MS, copyText } from '@nangohq/design-system';

import { CodeBlock, COLLAPSED_MAX_LENGTH } from '@/components/ui/CodeBlock';
import { Skeleton } from '@/components/ui/Skeleton';
import { useGetOperation } from '../../../hooks/useLogs';
import { useStore } from '../../../store';
import { APIError } from '../../../utils/api';
import { getRunTime } from '../../../utils/utils';
import { OperationProperties, operationTypeLabel } from '../components/OperationProperties';
import { OperationStatus } from '../components/OperationStatus';
import { Logs } from './components/Logs';

import type { ApiError, OperationRow } from '@nangohq/types';

const PAYLOAD_COLLAPSED_LINES = 9;

const PanelHeader: React.FC<{ actions: React.ReactNode; children?: React.ReactNode }> = ({ actions, children }) => (
    <header className="sticky top-0 z-20 flex items-start gap-3 border-b border-border-muted bg-surface-panel px-6 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
        <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
    </header>
);

const OperationHeading: React.FC<{ operation: OperationRow }> = ({ operation }) => {
    const { type, action } = operationTypeLabel(operation);
    const duration = operation.endedAt && operation.startedAt ? getRunTime(operation.startedAt, operation.endedAt) : null;

    return (
        <>
            <div className="flex type-text-regular-sm text-text-default">
                <OperationStatus state={operation.state} />
            </div>
            <h2 className="flex min-w-0 items-baseline gap-1.5 type-text-medium-md text-text-strong">
                <span className="shrink-0">{type}</span>
                <span className="shrink-0 text-text-secondary">{action}</span>
                {operation.syncConfigName && (
                    <>
                        <span aria-hidden className="text-text-muted">
                            ·
                        </span>
                        <span className="truncate type-code-medium-md">{operation.syncConfigName}</span>
                    </>
                )}
            </h2>
            <div className="flex items-center gap-1.5 type-code-regular-sm text-text-secondary">
                <span>{format(new Date(operation.createdAt), 'MMM d, yyyy, HH:mm:ss.SSS')}</span>
                {duration && (
                    <>
                        <span aria-hidden>·</span>
                        <span>{duration}</span>
                    </>
                )}
            </div>
        </>
    );
};

const CopyTextButton: React.FC<{ value: string; label: string }> = ({ value, label }) => {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);

    const onClick = async () => {
        try {
            await copyText(value);
        } catch {
            return;
        }
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPY_BUTTON_RESET_MS);
    };

    return (
        <>
            <Button variant="ghost" size="xs" aria-label={label} onClick={() => void onClick()}>
                {copied ? <Check /> : <Copy />}
                {copied ? 'Copied' : 'Copy'}
            </Button>
            <span role="status" aria-live="polite" className="sr-only">
                {copied ? 'Copied' : ''}
            </span>
        </>
    );
};

const Payload: React.FC<{ payload: Record<string, unknown> | null }> = ({ payload }) => {
    const [expanded, setExpanded] = useState(false);
    const json = useMemo(() => (payload ? JSON.stringify(payload, null, 2) : ''), [payload]);
    const long = useMemo(() => json.length > COLLAPSED_MAX_LENGTH || json.split('\n').length > PAYLOAD_COLLAPSED_LINES, [json]);

    return (
        <section className="flex flex-col gap-2">
            <div className="flex min-h-7 items-center justify-between gap-2">
                <h3 className="type-label-md text-text-strong">Payload</h3>
                {payload && (
                    <div className="flex items-center gap-1">
                        <CopyTextButton value={json} label="Copy payload" />
                        {long && (
                            <Button variant="ghost" size="xs" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                                {expanded ? <Minimize2 /> : <Maximize2 />}
                                {expanded ? 'Collapse' : 'Expand'}
                            </Button>
                        )}
                    </div>
                )}
            </div>
            {payload ? (
                <CodeBlock
                    bare
                    copyable={false}
                    language="json"
                    code={json}
                    wrapLines
                    constrainHeight={false}
                    collapsedLines={PAYLOAD_COLLAPSED_LINES}
                    expanded={expanded}
                    onExpandedChange={setExpanded}
                />
            ) : (
                <p className="type-text-regular-sm text-text-muted">No payload.</p>
            )}
        </section>
    );
};

export const ShowOperation: React.FC<{ operationId: string; actions: React.ReactNode }> = ({ operationId, actions }) => {
    const env = useStore((state) => state.env);
    const { operation, loading, error, trigger } = useGetOperation(env, { operationId });
    const errorCode = error instanceof APIError ? (error.json as ApiError<string> | undefined)?.error?.code : undefined;
    const isNotFound = errorCode === 'not_found' || errorCode === 'invalid_uri_params';

    const isLive = useMemo(() => {
        if (isNotFound) {
            return false;
        }
        // We keep refreshing N seconds after end to catch logs that could be indexed after the operation is done
        return !operation || !operation.endedAt || new Date(operation.endedAt).getTime() > Date.now() - 160_000;
    }, [operation, isNotFound]);

    const payload = useMemo(() => {
        if (!operation?.meta && !operation?.request && !operation?.response && !operation?.error) {
            return null;
        }

        const pl: Record<string, any> = operation.meta ? { ...operation.meta } : {};
        if (operation.request) {
            pl.request = operation.request;
        }
        if (operation.response) {
            pl.response = operation.response;
        }
        if (operation.error) {
            pl.error = { message: operation.error.message };
            if (operation.error.payload !== undefined) {
                pl.error.payload = operation.error.payload;
            }
        }
        return pl;
    }, [operation?.meta, operation?.request, operation?.response, operation?.error]);

    useInterval(
        () => {
            // Auto refresh
            trigger();
        },
        isLive ? 5000 : null
    );

    if (loading) {
        return (
            <>
                <PanelHeader actions={actions}>
                    <Skeleton className="w-[80px]" />
                    <Skeleton className="w-[220px]" />
                    <Skeleton className="w-[180px]" />
                </PanelHeader>
                <div className="flex flex-col gap-3 px-6 py-5">
                    <Skeleton className="w-[250px]" />
                    <Skeleton className="w-[250px]" />
                    <Skeleton className="w-[250px]" />
                </div>
            </>
        );
    }

    if (isNotFound) {
        return (
            <>
                <PanelHeader actions={actions}>
                    <h2 className="type-heading-sm text-text-strong">Operation not found</h2>
                </PanelHeader>
                <p className="px-6 py-5 type-text-regular-sm text-text-muted">
                    This operation doesn&apos;t exist or has expired. Logs are automatically cleared after the retention period.
                </p>
            </>
        );
    }

    if (error || !operation) {
        return (
            <>
                <PanelHeader actions={actions}>
                    <h2 className="type-heading-sm text-text-strong">Operation details</h2>
                </PanelHeader>
                <div className="px-6 py-5">
                    <Alert variant="danger">
                        <AlertDescription>An error occurred</AlertDescription>
                    </Alert>
                </div>
            </>
        );
    }

    return (
        <>
            <PanelHeader actions={actions}>
                <OperationHeading operation={operation} />
            </PanelHeader>
            <div className="flex flex-col gap-6 px-6 py-5">
                <OperationProperties env={env} operation={operation} />
                <Payload payload={payload} />
                <Logs operation={operation} operationId={operationId} isLive={isLive} />
            </div>
        </>
    );
};
