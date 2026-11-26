import { format } from 'date-fns';
import { Globe, MessageSquare } from 'lucide-react';
import { useLayoutEffect, useMemo, useState } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@nangohq/design-system';

import { CodeBlock } from '@/components/ui/CodeBlock';
import { cn, millisecondsToRuntime } from '@/utils/utils';

import type { LogLevel, MessageRow } from '@nangohq/types';

export const LOG_GRID = 'grid grid-cols-[96px_64px_minmax(0,1fr)_56px] items-center gap-2 px-3';

const levelLabels: Record<LogLevel, string> = { error: 'Error', warn: 'Warn', info: 'Info', debug: 'Debug' };

const Level: React.FC<{ level: LogLevel }> = ({ level }) => (
    <span
        className={cn(
            'flex items-center gap-1.5 type-text-regular-xs',
            level === 'error' && 'text-text-danger',
            level === 'warn' && 'text-text-warning',
            level === 'info' && 'text-text-secondary',
            level === 'debug' && 'text-text-muted'
        )}
    >
        <span
            aria-hidden
            className={cn(
                'size-1.5 shrink-0 rounded-full',
                level === 'error' && 'bg-icon-danger',
                level === 'warn' && 'bg-icon-warning',
                level === 'info' && 'bg-border-strong',
                level === 'debug' && 'bg-border-default'
            )}
        />
        {levelLabels[level]}
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

// A callback ref, because the measured span remounts when the row turns into a button.
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

const HttpSummary: React.FC<{ message: MessageRow }> = ({ message }) => {
    const code = message.response?.code;
    return (
        <>
            <span className="text-text-strong">{message.request?.method}</span>{' '}
            {code !== undefined && (
                <>
                    <span className={code >= 400 ? 'text-text-danger' : 'text-text-success'}>{code}</span>{' '}
                </>
            )}
            <span>{message.request?.url.replace(/^https?:\/\//, '')}</span>
        </>
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

    const cells = (
        <>
            <span className="type-code-regular-xs text-text-secondary">{format(new Date(message.createdAt), 'HH:mm:ss.SSS')}</span>
            <Level level={message.level} />
            <span className="flex min-w-0 items-center gap-2">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="flex shrink-0 text-icon-secondary [&>svg]:size-3.5">
                            {isHttp ? <Globe aria-label="HTTP request" /> : <MessageSquare aria-label="Message" />}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>{isHttp ? 'HTTP request' : 'Message'}</TooltipContent>
                </Tooltip>
                <span
                    ref={summaryRef}
                    className={cn('truncate', isHttp ? 'type-code-regular-xs text-text-secondary' : 'type-text-regular-sm text-text-default')}
                    data-ph-mask
                >
                    {isHttp ? <HttpSummary message={message} /> : message.message}
                </span>
            </span>
            <span className="text-right type-code-regular-xs text-text-muted">{isHttp && message.durationMs ? formatDuration(message.durationMs) : null}</span>
        </>
    );

    return (
        <div className="border-b border-border-muted last:border-b-0">
            {expandable ? (
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={onToggle}
                    className={cn(
                        LOG_GRID,
                        'focus-default min-h-8 w-full cursor-pointer text-left outline-none hover:bg-state-hover',
                        open && 'bg-state-selected hover:bg-state-selected'
                    )}
                >
                    {cells}
                </button>
            ) : (
                <div className={cn(LOG_GRID, 'min-h-8')}>{cells}</div>
            )}
            {open && expandable && (
                <div className="flex flex-col gap-2 px-3 pb-3 pt-2">
                    {showFullMessage && (
                        <p className="whitespace-pre-wrap break-words type-text-regular-sm text-text-default" data-ph-mask>
                            {message.message}
                        </p>
                    )}
                    {payload && <CodeBlock bare language="json" code={json} wrapLines data-ph-mask />}
                </div>
            )}
        </div>
    );
};
