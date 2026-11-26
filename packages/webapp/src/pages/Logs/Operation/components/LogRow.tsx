import { format } from 'date-fns';
import { Globe, MessageSquare } from 'lucide-react';
import { useLayoutEffect, useMemo, useState } from 'react';

import { StatusIndicator, Tooltip, TooltipContent, TooltipTrigger } from '@nangohq/design-system';

import { CodeBlock } from '@/components/ui/CodeBlock';
import { cn, millisecondsToRuntime } from '@/utils/utils';

import type { StatusIndicatorProps } from '@nangohq/design-system';
import type { LogLevel, MessageRow } from '@nangohq/types';

export const LOG_GRID = 'grid grid-cols-[96px_64px_minmax(0,1fr)_56px] items-center gap-2 px-3';

const levels: Record<LogLevel, { label: string; tone: StatusIndicatorProps['tone'] }> = {
    error: { label: 'Error', tone: 'danger' },
    warn: { label: 'Warn', tone: 'warning' },
    info: { label: 'Info', tone: 'neutral' },
    debug: { label: 'Debug', tone: 'muted' }
};

const Level: React.FC<{ level: LogLevel }> = ({ level }) => (
    <span className="flex h-5 items-center type-text-regular-xs text-text-secondary">
        <StatusIndicator tone={levels[level].tone} size="sm">
            {levels[level].label}
        </StatusIndicator>
    </span>
);

function messagePayload(message: MessageRow): Record<string, unknown> | null {
    if (!message.meta && !message.error && !message.request && !message.response) {
        return null;
    }

    const pl: Record<string, unknown> = message.meta ? { ...message.meta } : {};
    if (message.request) {
        pl.request = message.request;
    }
    if (message.response) {
        pl.response = message.response;
    }
    if (message.retry) {
        pl.retry = message.retry;
    }
    if (message.persistResults) {
        pl.persistResults = message.persistResults;
    }
    if (message.error) {
        pl.error =
            message.error.payload === undefined ? { message: message.error.message } : { message: message.error.message, payload: message.error.payload };
    }
    return pl;
}

// A callback ref, because the measured span only exists while the row is closed.
function useIsTruncated(): [(node: HTMLElement | null) => void, boolean] {
    const [node, setNode] = useState<HTMLElement | null>(null);
    const [truncated, setTruncated] = useState(false);
    useLayoutEffect(() => {
        if (!node) {
            return;
        }
        const check = () => setTruncated(node.scrollWidth > node.clientWidth);
        check();
        const observer = new ResizeObserver(check);
        observer.observe(node);
        return () => observer.disconnect();
    }, [node]);
    return [setNode, truncated];
}

function formatDuration(ms: number): string {
    if (ms < 1000) {
        return `${Math.round(ms)}ms`;
    }
    if (ms < 60_000) {
        return `${(Math.floor(ms / 100) / 10).toFixed(1)}s`;
    }
    return millisecondsToRuntime(ms - (ms % 1000));
}

function splitUrl(url: string): [head: string, lastSegment: string, query: string] {
    const bare = url.replace(/^https?:\/\//, '');
    const queryStart = bare.indexOf('?');
    const path = queryStart === -1 ? bare : bare.slice(0, queryStart);
    const query = queryStart === -1 ? '' : bare.slice(queryStart);
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash <= 0) {
        return [path, '', query];
    }
    return [path.slice(0, lastSlash), path.slice(lastSlash), query];
}

const StatusCode: React.FC<{ code: number }> = ({ code }) => <span className={code >= 400 ? 'text-text-danger' : 'text-text-success'}>{code}</span>;

const HttpSummary: React.FC<{ message: MessageRow }> = ({ message }) => {
    const code = message.response?.code;
    const [head, lastSegment, query] = splitUrl(message.request?.url ?? '');
    return (
        <span className="flex min-w-0 gap-[1ch] whitespace-nowrap type-code-regular-xs text-text-secondary" data-ph-mask>
            <span className="text-text-strong">{message.request?.method}</span>
            {code !== undefined && <StatusCode code={code} />}
            <span className="sr-only">{`${head}${lastSegment}${query}`}</span>
            <span aria-hidden className="flex min-w-0">
                <span className="truncate">{head}</span>
                {lastSegment && <span className="max-w-[60%] shrink-0 truncate">{lastSegment}</span>}
                {query && <span className="min-w-[2ch] shrink-1000 truncate">{query}</span>}
            </span>
        </span>
    );
};

export const LogRow: React.FC<{
    message: MessageRow;
    open: boolean;
    onToggle: () => void;
}> = ({ message, open, onToggle }) => {
    const isHttp = message.type === 'http' && Boolean(message.request);
    const payload = useMemo(() => messagePayload(message), [message]);
    const json = useMemo(() => (payload ? JSON.stringify(payload, null, 2) : ''), [payload]);
    const [summaryRef, truncated] = useIsTruncated();
    const showFullMessage = !isHttp && truncated;
    const expandable = Boolean(payload) || showFullMessage || open;

    const icon = (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className={cn('shrink-0 text-icon-secondary [&>svg]:size-3.5', open ? 'mr-2 inline-flex indent-0 align-[-2px]' : 'flex')}>
                    {isHttp ? <Globe aria-label="HTTP request" /> : <MessageSquare aria-label="Message" />}
                </span>
            </TooltipTrigger>
            <TooltipContent>{isHttp ? 'HTTP request' : 'Message'}</TooltipContent>
        </Tooltip>
    );

    const cells = (
        <>
            <span className="flex h-5 items-center type-code-regular-xs text-text-secondary">{format(new Date(message.createdAt), 'HH:mm:ss.SSS')}</span>
            <Level level={message.level} />
            {open ? (
                <span className={cn('min-w-0 select-text pl-5.5 -indent-5.5', isHttp ? 'type-code-regular-xs' : 'type-text-regular-sm', 'leading-5')}>
                    {icon}
                    {isHttp && message.request ? (
                        <span className="break-all type-code-regular-xs leading-5 text-text-secondary" data-ph-mask>
                            <span className="text-text-strong">{message.request.method}</span>{' '}
                            {message.response?.code !== undefined && (
                                <>
                                    <StatusCode code={message.response.code} />{' '}
                                </>
                            )}
                            {message.request.url}
                        </span>
                    ) : (
                        <span className="whitespace-pre-wrap break-words type-text-regular-sm leading-5 text-text-default" data-ph-mask>
                            {message.message}
                        </span>
                    )}
                </span>
            ) : (
                <span className="flex min-w-0 items-center gap-2">
                    {icon}
                    {isHttp ? (
                        <HttpSummary message={message} />
                    ) : (
                        <span ref={summaryRef} className="truncate type-text-regular-sm text-text-default" data-ph-mask>
                            {message.message}
                        </span>
                    )}
                </span>
            )}
            <span className="flex h-5 items-center justify-end type-code-regular-xs text-text-muted">
                {isHttp && message.durationMs ? formatDuration(message.durationMs) : null}
            </span>
        </>
    );

    return (
        <div className="border-b border-border-muted last:border-b-0">
            {expandable ? (
                // A div, because browsers don't let users select text inside a <button>.
                <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={(event) => {
                        const selection = window.getSelection();
                        if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) {
                            return;
                        }
                        onToggle();
                    }}
                    onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault();
                            onToggle();
                        }
                    }}
                    className={cn(
                        LOG_GRID,
                        'focus-default min-h-8 w-full cursor-pointer text-left outline-none hover:bg-state-hover',
                        open && 'items-start bg-state-selected py-1.5 hover:bg-state-selected'
                    )}
                >
                    {cells}
                </div>
            ) : (
                <div className={cn(LOG_GRID, 'min-h-8')}>{cells}</div>
            )}
            {open && payload && (
                <div className="px-3 pb-3 pt-1">
                    <CodeBlock bare language="json" code={json} wrapLines constrainHeight={false} collapsedLines={40} data-ph-mask />
                </div>
            )}
        </div>
    );
};
