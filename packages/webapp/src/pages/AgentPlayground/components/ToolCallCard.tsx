import { Braces, CheckCircle2, ChevronDown, ChevronUp, Table2, Wrench, XCircle } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Badge, Button } from '@nangohq/design-system';

import { LogoInverted } from '@/assets/LogoInverted';
import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/utils';
import { describeTool, humanize, providerFor, toolArguments } from '../toolDisplay';
import { ConnectCard } from './ConnectCard';

import type { ToolDisplay } from '../toolDisplay';
import type { BadgeProps } from '@nangohq/design-system';
import type { DynamicToolUIPart } from 'ai';

interface ToolCallCardProps {
    part: DynamicToolUIPart;
    onConnected: (integrationId: string) => void;
    onApprove: (approvalId: string, approved: boolean) => void;
}

type PayloadView = 'table' | 'json';

function useRunDuration(running: boolean, awaitingApproval: boolean, done: boolean): number | null {
    const startedAt = useRef<number | null>(null);
    const [duration, setDuration] = useState<number | null>(null);

    useEffect(() => {
        // The input streams in before the approval card appears, so restart the clock once the user answers.
        if (awaitingApproval) {
            startedAt.current = null;
            return;
        }
        if (running && startedAt.current === null) {
            startedAt.current = Date.now();
        }
        if (done && duration === null && startedAt.current !== null) {
            setDuration(Date.now() - startedAt.current);
        }
    }, [running, awaitingApproval, done, duration]);

    return duration;
}

function formatDuration(ms: number): string {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function searchSummary(matches: number, related: number): string {
    if (matches > 0) {
        return matches === 1 ? '1 match' : `${matches} matches`;
    }
    if (related > 0) {
        return related === 1 ? '1 related tool' : `${related} related tools`;
    }
    return 'No tool found';
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
    const text = display.subtitle ?? (display.integrationId && humanize(display.integrationId));
    return text ? <span className="truncate text-body-small-regular text-text-secondary">{text}</span> : null;
};

const IconBox: React.FC<{ display: ToolDisplay }> = ({ display }) => {
    const provider = display.integrationId ? providerFor(display.integrationId) : undefined;
    if (provider) {
        // Keyed so a logo that 404'd on a half-streamed id retries once the full id arrives.
        return <IntegrationLogo key={provider} provider={provider} className="size-8" />;
    }
    if (display.kind === 'search') {
        return <NangoBox />;
    }
    return (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-sm border-[0.5px] border-border-muted bg-surface-raised">
            <Wrench className="size-4 text-icon-secondary" />
        </div>
    );
};

const NangoBox: React.FC = () => (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-sm border-[0.5px] border-border-muted bg-surface-raised">
        <LogoInverted className="size-4 text-text-strong" />
    </div>
);

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ part, onConnected, onApprove }) => {
    const display = describeTool(part.toolName, part.input);
    const running = part.state === 'input-streaming' || part.state === 'input-available' || part.state === 'approval-responded';
    const awaitingApproval = part.state === 'approval-requested';
    const done = part.state === 'output-available' || part.state === 'output-error' || part.state === 'output-denied';
    const failed = part.state === 'output-error' || part.state === 'output-denied';
    const duration = useRunDuration(running, awaitingApproval, done);

    if (display.kind === 'connect' && part.state === 'output-available') {
        const output = part.output as { connect_url?: string; integration?: string; provider?: string };
        if (output.connect_url && output.integration) {
            return (
                <ConnectCard
                    integrationId={output.integration}
                    provider={output.provider ?? providerFor(output.integration)}
                    connectUrl={output.connect_url}
                    onConnected={onConnected}
                />
            );
        }
    }

    if (awaitingApproval && !part.approval.isAutomatic) {
        return <ApprovalCard part={part} display={display} onApprove={onApprove} approvalId={part.approval.id} />;
    }

    const searchOutput =
        display.kind === 'search' && part.state === 'output-available' ? (part.output as { matches?: unknown[]; related?: unknown[] }) : undefined;

    return (
        <Collapsible className="group/card rounded-ds-xs border border-border-muted bg-surface-panel">
            <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <IconBox display={display} />
                <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body-medium-medium text-text-strong">{display.title}</span>
                    <Subtitle display={display} />
                </div>
                <div className="flex shrink-0 items-center gap-2 text-body-small-regular text-text-secondary">
                    {searchOutput && <span>{searchSummary(searchOutput.matches?.length ?? 0, searchOutput.related?.length ?? 0)}</span>}
                    {duration !== null && part.state !== 'output-denied' && <span className="font-mono">{formatDuration(duration)}</span>}
                    {running ? <Spinner /> : failed ? <XCircle className="size-4 text-icon-danger" /> : <CheckCircle2 className="size-4 text-icon-success" />}
                    <ChevronDown className="size-4 transition-transform group-data-[state=open]/card:rotate-180" />
                </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t border-border-muted">
                <div className="p-3">
                    <Payload
                        input={toolArguments(part.toolName, part.input)}
                        output={part.state === 'output-available' ? part.output : undefined}
                        error={part.state === 'output-error' ? part.errorText : part.state === 'output-denied' ? 'You denied this request.' : undefined}
                    />
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
};

const ApprovalCard: React.FC<{
    part: DynamicToolUIPart;
    display: ToolDisplay;
    onApprove: (approvalId: string, approved: boolean) => void;
    approvalId: string;
}> = ({ part, display, onApprove, approvalId }) => {
    const [open, setOpen] = useState(false);
    const bottom = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (open) {
            bottom.current?.scrollIntoView({ block: 'nearest' });
        }
    }, [open]);

    return (
        <Collapsible open={open} onOpenChange={setOpen} className="group/card rounded-ds-xs border border-border-muted bg-surface-panel">
            <div
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        setOpen((o) => !o);
                    }
                }}
                className="flex cursor-pointer items-center gap-3 px-4 py-3 text-left"
            >
                <IconBox display={display} />
                <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body-medium-medium text-text-strong">The agent wants to make a change</span>
                    <Subtitle
                        display={
                            display.kind === 'integration' && display.integrationId
                                ? { ...display, subtitle: `${display.title} · ${humanize(display.integrationId)}` }
                                : display
                        }
                    />
                </div>
                <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="secondary" onClick={() => onApprove(approvalId, false)}>
                        Deny
                    </Button>
                    <Button size="sm" onClick={() => onApprove(approvalId, true)}>
                        Approve
                    </Button>
                    <ChevronDown className="size-4 text-text-secondary transition-transform group-data-[state=open]/card:rotate-180" />
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
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-end">
                <SegmentedControl<PayloadView>
                    aria-label="Payload view"
                    value={view}
                    onChange={setView}
                    options={[
                        { value: 'table', label: 'Table', Icon: Table2 },
                        { value: 'json', label: 'JSON', Icon: Braces }
                    ]}
                />
            </div>
            <Section title="Parameters" value={input} view={view} />
            {error !== undefined ? (
                <Section title="Error" value={error} view="json" />
            ) : output !== undefined ? (
                <Section title="Response" value={output} view={view} />
            ) : null}
        </div>
    );
};

const COLLAPSED_LINES = 20;

const Value: React.FC<{ value: unknown }> = ({ value }) => {
    if (typeof value === 'boolean') {
        return <Badge variant={value ? 'success' : 'default'}>{String(value)}</Badge>;
    }
    if (value !== null && typeof value === 'object') {
        return <CollapsibleCode language="json" code={JSON.stringify(value, null, 2)} />;
    }
    if (typeof value === 'string' && value.length > 80) {
        return <p className="whitespace-pre-wrap wrap-anywhere text-body-small-regular text-text-default">{value}</p>;
    }
    return <code className="whitespace-pre-wrap break-all font-mono text-body-small-regular text-text-default">{String(value)}</code>;
};

const CollapsibleCode: React.FC<{ code: string; language: 'json' | 'bash' }> = ({ code, language }) => {
    const [expanded, setExpanded] = useState(false);
    const long = code.split('\n').length > COLLAPSED_LINES;

    return (
        <div className="flex flex-col items-start gap-2">
            <div className={cn('w-full', long && !expanded && 'max-h-96 overflow-hidden')}>
                <CodeBlock language={language} code={code} constrainHeight={false} />
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

const Section: React.FC<{ title: string; value: unknown; view: PayloadView }> = ({ title, value, view }) => {
    const rows = view === 'table' && value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : null;

    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-body-small-medium text-text-strong">{title}</span>
            {rows ? (
                <div className="overflow-hidden rounded-ds-xs border border-border-muted">
                    {rows.length === 0 && <div className="px-3 py-2 text-body-small-regular text-text-secondary">Empty</div>}
                    {rows.map(([key, entry]) => (
                        <div key={key} className="grid grid-cols-[minmax(120px,25%)_1fr] border-b border-border-muted last:border-b-0">
                            <span className="border-r border-border-muted px-3 py-2 text-body-small-regular text-text-secondary">{key}</span>
                            <div className="min-w-0 px-3 py-2 text-body-small-regular">
                                <Value value={entry} />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <CollapsibleCode
                    language={typeof value === 'string' ? 'bash' : 'json'}
                    code={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                />
            )}
        </div>
    );
};
