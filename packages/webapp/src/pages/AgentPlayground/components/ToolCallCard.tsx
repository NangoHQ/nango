import { Braces, CheckCircle2, ChevronDown, ChevronUp, CircleSlash, RotateCcw, Table2, Wrench, XCircle } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Badge, Button, SegmentedControl, SegmentedControlItem } from '@nangohq/design-system';

import { LogoInverted } from '@/assets/LogoInverted';
import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/utils';
import { isFailed, isInterrupted, isUnfinished } from '../replyOutcome';
import { describeTool, labelFor, searchSummary, toolArguments } from '../toolDisplay';
import { ConnectCard } from './ConnectCard';

import type { PendingApproval } from '../approvalTracking';
import type { IntegrationLabels, SearchOutput, ToolDisplay } from '../toolDisplay';
import type { BadgeProps } from '@nangohq/design-system';
import type { DynamicToolUIPart } from 'ai';

interface ToolCallCardProps {
    part: DynamicToolUIPart;
    labels: IntegrationLabels | undefined;
    chatActive: boolean;
    approvalSending: boolean;
    connectedIntegrations: ReadonlySet<string>;
    onConnected: (integrationId: string) => void;
    onRequestNewLink: (integrationId: string) => void;
    onApprove: (part: PendingApproval, approved: boolean) => void;
    onRetryInterrupted: ((title: string) => void) | undefined;
    onTryAgain: (() => void) | undefined;
}

type PayloadView = 'table' | 'json';

// Kept outside the card, because a card remounts when its call joins a group.
const runStarts = new Map<string, number>();
const runDurations = new Map<string, number>();

function useRunDuration(toolCallId: string, running: boolean, awaitingApproval: boolean, done: boolean): number | null {
    const [duration, setDuration] = useState<number | null>(() => runDurations.get(toolCallId) ?? null);

    useEffect(() => {
        // The input streams in before the approval card appears, so restart the clock once the user answers.
        if (awaitingApproval) {
            runStarts.delete(toolCallId);
            return;
        }
        if (running && !runStarts.has(toolCallId)) {
            runStarts.set(toolCallId, Date.now());
        }
        const startedAt = runStarts.get(toolCallId);
        if (done && duration === null && startedAt !== undefined) {
            const elapsed = Date.now() - startedAt;
            runDurations.set(toolCallId, elapsed);
            setDuration(elapsed);
        }
    }, [toolCallId, running, awaitingApproval, done, duration]);

    return duration;
}

function formatDuration(ms: number): string {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const METHOD_VARIANT: Record<string, BadgeProps['variant']> = {
    POST: 'success',
    PUT: 'warning',
    PATCH: 'warning',
    DELETE: 'danger'
};

const Subtitle: React.FC<{ display: ToolDisplay }> = ({ display }) => {
    if (display.method || display.path) {
        return (
            <span className="flex min-w-0 items-center gap-2">
                {display.method && <Badge variant={METHOD_VARIANT[display.method] ?? 'default'}>{display.method}</Badge>}
                {display.path && <span className="truncate font-mono text-body-small-regular text-text-secondary">{display.path}</span>}
            </span>
        );
    }
    const text = display.subtitle ?? display.integration?.integrationName;
    return text ? <span className="truncate text-body-small-regular text-text-secondary">{text}</span> : null;
};

const ToolIcon: React.FC<{ display: ToolDisplay }> = ({ display }) => {
    const provider = display.integration?.provider;
    if (provider) {
        // Keyed so a logo that 404'd on a half-streamed id retries once the full id arrives.
        return <IntegrationLogo key={provider} provider={provider} className="size-6 shrink-0 border-0 bg-transparent p-0" />;
    }
    return (
        <span className="flex size-6 shrink-0 items-center justify-center">
            <Wrench className="size-4 text-icon-secondary" />
        </span>
    );
};

export const RowLogo: React.FC<{ provider: string | undefined }> = ({ provider }) => (
    <span className="flex size-4 shrink-0 items-center justify-center">
        {provider ? (
            // Larger than its 16px slot, because integration logo artwork has built-in padding.
            <IntegrationLogo key={provider} provider={provider} className="size-5.5 shrink-0 border-0 bg-transparent p-0" />
        ) : (
            <Wrench className="size-4 text-icon-secondary" />
        )}
    </span>
);

export const StatusIcon: React.FC<{ running: boolean; stopped: boolean; failed: boolean }> = ({ running, stopped, failed }) => {
    if (running) {
        return <Spinner />;
    }
    if (stopped) {
        return <CircleSlash className="size-4 text-icon-secondary" />;
    }
    if (failed) {
        return <XCircle className="size-4 text-icon-danger" />;
    }
    return <CheckCircle2 className="size-4 text-icon-success" />;
};

export const ToolCallCard: React.FC<ToolCallCardProps> = ({
    part,
    labels,
    chatActive,
    approvalSending,
    connectedIntegrations,
    onConnected,
    onRequestNewLink,
    onApprove,
    onRetryInterrupted,
    onTryAgain
}) => {
    const display = describeTool(part.toolName, part.input, labels);
    const awaitingApproval = part.state === 'approval-requested' && !part.approval.isAutomatic;
    const unfinished = isUnfinished(part);
    // An approved call waits a moment for its request to start, so the chat being idle doesn't mean it stopped.
    const stopped = unfinished && !chatActive && !(part.state === 'approval-responded' && approvalSending);
    const running = unfinished && !stopped;
    const done = part.state === 'output-available' || part.state === 'output-error' || part.state === 'output-denied';
    const failed = isFailed(part);
    const duration = useRunDuration(part.toolCallId, running, awaitingApproval, done);

    if (display.kind === 'connect' && part.state === 'output-available') {
        const output = part.output as { connect_url?: string; expires_at?: string; integration?: string; provider?: string };
        if (output.connect_url && output.integration) {
            const label = labelFor(output.integration, labels);
            return (
                <ConnectCard
                    integrationId={output.integration}
                    provider={output.provider ?? label.provider}
                    name={label.name}
                    connectUrl={output.connect_url}
                    expiresAt={output.expires_at}
                    connected={connectedIntegrations.has(output.integration)}
                    onConnected={onConnected}
                    onRequestNewLink={onRequestNewLink}
                />
            );
        }
    }

    if (isInterrupted(part)) {
        return <InterruptedCard display={display} onRetry={onRetryInterrupted} />;
    }

    if (awaitingApproval && part.state === 'approval-requested') {
        return <ApprovalCard part={part} display={display} onApprove={onApprove} />;
    }

    const searchOutput = display.kind === 'search' && part.state === 'output-available' ? (part.output as SearchOutput) : undefined;

    const payload = (
        <Payload
            input={toolArguments(part.toolName, part.input)}
            output={part.state === 'output-available' ? part.output : undefined}
            error={part.state === 'output-error' ? part.errorText : part.state === 'output-denied' ? 'You denied this request.' : undefined}
        />
    );
    const meta = (
        <>
            {duration !== null && part.state !== 'output-denied' && <span className="tabular-nums">{formatDuration(duration)}</span>}
            {stopped && <span>Stopped</span>}
            <StatusIcon running={running} stopped={stopped} failed={failed} />
        </>
    );
    const tryAgain = stopped && onTryAgain && (
        <Button variant="outline" size="sm" onClick={onTryAgain}>
            Try again
        </Button>
    );

    const status = (
        <>
            {searchOutput && <span>{searchSummary(searchOutput)}</span>}
            {meta}
        </>
    );

    const source = display.kind === 'search' ? 'Session' : display.integration?.integrationName;

    let rowSubtitle: React.ReactNode = null;
    if (display.kind === 'search') {
        rowSubtitle = display.subtitle && <span className="min-w-0 truncate text-text-muted">{display.subtitle}</span>;
    } else if (display.method || display.path) {
        rowSubtitle = <Subtitle display={display} />;
    }

    return (
        <Collapsible className="group/card">
            <div className="flex min-h-7 items-center gap-2 pr-[17px] text-body-medium-regular text-text-secondary hover:text-text-default group-data-[state=open]/card:text-text-default">
                <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-ds-xs py-1 text-left focus-visible:outline-offset-4">
                    {display.kind === 'search' ? (
                        <LogoInverted className="size-4 shrink-0 text-text-strong" />
                    ) : (
                        <RowLogo provider={display.integration?.provider} />
                    )}
                    {source && <span className="shrink-0 text-body-medium-medium text-text-default">{source}</span>}
                    <span className={cn('shrink-0', running && 'animate-pulse')}>{display.title}</span>
                    {rowSubtitle}
                    <span className="ml-auto flex shrink-0 items-center gap-2 pl-2 text-body-small-regular">
                        {status}
                        <ChevronDown className="size-4 transition-transform group-data-[state=open]/card:rotate-180" />
                    </span>
                </CollapsibleTrigger>
                {tryAgain}
            </div>
            <CollapsibleContent className="pt-3">
                <div className="mr-[41px] ml-6 rounded-ds-xs border border-border-muted bg-surface-panel px-4 py-3">{payload}</div>
            </CollapsibleContent>
        </Collapsible>
    );
};

const InterruptedCard: React.FC<{ display: ToolDisplay; onRetry: ((title: string) => void) | undefined }> = ({ display, onRetry }) => {
    const [retried, setRetried] = useState(false);

    return (
        <div className="flex items-center gap-3 rounded-ds-xs border border-border-muted bg-surface-panel px-4 py-3">
            <ToolIcon display={display} />
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body-medium-medium text-text-strong">{display.title}</span>
                {(display.method || display.path) && <Subtitle display={display} />}
                <span className="flex items-center gap-1 text-body-small-regular text-text-warning">
                    <CircleSlash className="size-3.5 shrink-0 text-icon-warning" />
                    Interrupted before it finished.
                </span>
            </div>
            {onRetry && (
                <Button
                    size="sm"
                    variant="secondary"
                    disabled={retried}
                    onClick={() => {
                        setRetried(true);
                        onRetry(display.title);
                    }}
                >
                    <RotateCcw /> Check and try again
                </Button>
            )}
        </div>
    );
};

const ApprovalCard: React.FC<{
    part: PendingApproval;
    display: ToolDisplay;
    onApprove: (part: PendingApproval, approved: boolean) => void;
}> = ({ part, display, onApprove }) => {
    const [open, setOpen] = useState(false);
    const bottom = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (open) {
            bottom.current?.scrollIntoView({ block: 'nearest' });
        }
    }, [open]);

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="group/card rounded-ds-xs border border-border-muted bg-surface-panel">
            <div className="flex items-center gap-3 px-4 py-3">
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen((o) => !o)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                >
                    <ToolIcon display={display} />
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-body-medium-medium text-text-strong">The agent wants to make a change</span>
                        <Subtitle
                            display={
                                display.kind === 'integration' && display.integration
                                    ? { ...display, subtitle: `${display.title} · ${display.integration.integrationName}` }
                                    : display
                            }
                        />
                    </span>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => onApprove(part, false)}>
                        Deny
                    </Button>
                    <Button size="sm" onClick={() => onApprove(part, true)}>
                        Approve
                    </Button>
                    <button
                        type="button"
                        aria-label={open ? 'Hide details' : 'Show details'}
                        aria-expanded={open}
                        onClick={() => setOpen((o) => !o)}
                        className="cursor-pointer text-text-secondary"
                    >
                        <ChevronDown className="size-4 transition-transform group-data-[state=open]/card:rotate-180" />
                    </button>
                </div>
            </div>
            <CollapsibleContent className="border-t border-border-muted">
                <div className="p-3">
                    <Payload input={toolArguments(part.toolName, part.input)} output={undefined} error={undefined} />
                </div>
                <div ref={bottom} className="scroll-mb-6" />
            </CollapsibleContent>
        </Collapsible>
    );
};

const Payload: React.FC<{ input: unknown; output: unknown; error: string | undefined }> = ({ input, output, error }) => {
    const [view, setView] = useState<PayloadView>('table');

    return (
        <div className="grid grid-cols-[fit-content(40%)_minmax(0,1fr)] gap-x-6 gap-y-4">
            <Section
                title="Parameters"
                value={input}
                view={view}
                action={
                    <SegmentedControl size="sm" aria-label="Payload view" value={view} onValueChange={(next) => setView(next as PayloadView)}>
                        <SegmentedControlItem value="table" icon={<Table2 />}>
                            Table
                        </SegmentedControlItem>
                        <SegmentedControlItem value="json" icon={<Braces />}>
                            JSON
                        </SegmentedControlItem>
                    </SegmentedControl>
                }
            />
            {(error !== undefined || output !== undefined) && (
                <div className="col-span-2 grid grid-cols-subgrid border-t border-border-muted pt-3">
                    {error !== undefined ? <Section title="Error" value={error} view="json" /> : <Section title="Response" value={output} view={view} />}
                </div>
            )}
        </div>
    );
};

const COLLAPSED_LINES = 20;
const COLLAPSED_LENGTH = 2_000;
// Prism highlights the whole block, so a large response freezes the page while it renders.
const MAX_HIGHLIGHTED_LENGTH = 50_000;

const Value: React.FC<{ value: unknown }> = ({ value }) => {
    if (typeof value === 'boolean') {
        return <Badge variant={value ? 'success' : 'default'}>{String(value)}</Badge>;
    }
    if (value !== null && typeof value === 'object') {
        if (Object.keys(value).length === 0) {
            return <span className="text-body-small-regular text-text-muted">None</span>;
        }
        return <CollapsibleCode language="json" code={JSON.stringify(value, null, 2)} />;
    }
    if (typeof value === 'string' && /\s/.test(value)) {
        return <p className="whitespace-pre-wrap wrap-anywhere text-body-small-regular text-text-default">{value}</p>;
    }
    return (
        <code className="box-decoration-clone whitespace-pre-wrap break-all rounded-ds-xs border border-border-muted bg-surface-panel-muted px-1 py-0.5 font-mono text-[0.9em] text-text-default">
            {String(value)}
        </code>
    );
};

const CollapsibleCode: React.FC<{ code: string; language: 'json' | 'bash'; wrapLines?: boolean }> = ({ code, language, wrapLines = false }) => {
    const [expanded, setExpanded] = useState(false);
    const lines = code.split('\n');
    const long = lines.length > COLLAPSED_LINES || code.length > COLLAPSED_LENGTH;
    // Highlighting runs over every line it is given, so a collapsed block only gets the lines it shows.
    const collapsed = lines.slice(0, COLLAPSED_LINES).join('\n');
    const shown = long && !expanded ? (collapsed.length > COLLAPSED_LENGTH ? `${collapsed.slice(0, COLLAPSED_LENGTH)}…` : collapsed) : code;

    return (
        <div className="flex flex-col items-start gap-2">
            <div className="w-full">
                <CodeBlock
                    bare
                    language={language}
                    code={shown}
                    copyValue={code}
                    constrainHeight={false}
                    wrapLines={wrapLines}
                    syntaxHighlight={shown.length <= MAX_HIGHLIGHTED_LENGTH}
                />
            </div>
            {long && (
                <Button size="xs" variant="outline" onClick={() => setExpanded((open) => !open)}>
                    {expanded ? <ChevronUp /> : <ChevronDown />}
                    {expanded ? 'Show less' : 'Show more'}
                </Button>
            )}
        </div>
    );
};

const Section: React.FC<{ title: string; value: unknown; view: PayloadView; action?: React.ReactNode }> = ({ title, value, view, action }) => {
    const rows = view === 'table' && value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : null;

    return (
        <div className="col-span-2 grid grid-cols-subgrid gap-y-1.5">
            <div className="col-span-2 flex min-h-7 items-center justify-between gap-2">
                <span className="text-body-small-medium text-text-strong">{title}</span>
                {action}
            </div>
            {rows ? (
                <div className="col-span-2 grid grid-cols-subgrid">
                    {rows.length === 0 && <div className="col-span-2 py-2 text-body-small-regular text-text-secondary">Empty</div>}
                    {rows.map(([key, entry]) => (
                        <div key={key} className="col-span-2 grid grid-cols-subgrid border-b border-border-muted py-2 last:border-b-0">
                            <span className="text-body-small-regular text-text-muted">{key}</span>
                            <div className="min-w-0 text-body-small-regular">
                                <Value value={entry} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="col-span-2 min-w-0">
                    <CollapsibleCode
                        language={typeof value === 'string' ? 'bash' : 'json'}
                        code={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)}
                        wrapLines={typeof value === 'string'}
                    />
                </div>
            )}
        </div>
    );
};
