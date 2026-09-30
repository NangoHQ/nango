import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { ArrowUp, Plus, RotateCcw, Square, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';

import { Button, InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@nangohq/design-system';

import { LogoInverted } from '@/assets/LogoInverted';
import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { useConnections } from '@/hooks/useConnections';
import { useMeta } from '@/hooks/useMeta';
import { useUser } from '@/hooks/useUser';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { globalEnv } from '@/utils/env';
import { describeChatError } from './chatError';
import { Markdown } from './components/Markdown';
import { ToolCallCard } from './components/ToolCallCard';
import { hideTrailingLink } from './streamingMarkdown';
import { describeTool, humanize, PLAYGROUND_INTEGRATION_IDS, PLAYGROUND_INTEGRATION_PREFIX, PLAYGROUND_USER_TAG_KEY } from './toolDisplay';

import type { AgentPlaygroundMessageMetadata } from '@nangohq/types';
import type { UIMessage } from 'ai';

type PlaygroundMessage = UIMessage<AgentPlaygroundMessageMetadata>;

const STARTER_PROMPTS: { prompt: string; icon: React.ReactNode }[] = [
    { prompt: "What's on my calendar today?", icon: <IntegrationLogo provider="google-calendar" className="size-8" /> },
    { prompt: "Star Nango's GitHub repo", icon: <IntegrationLogo provider="github" className="size-8" /> }
];

export const AgentPlaygroundShow: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: meta } = useMeta();
    const [chatKey, setChatKey] = useState(0);

    if (meta && !meta.data.agentPlayground) {
        return (
            <DashboardLayout title="Agent Playground">
                <p className="text-text-secondary">The Agent Playground is not enabled for this account.</p>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout fullWidth title="Agent Playground" className="h-full">
            <Helmet>
                <title>Agent Playground - Nango</title>
            </Helmet>
            <Chat key={`${env}-${chatKey}`} env={env} onReset={() => setChatKey((key) => key + 1)} />
        </DashboardLayout>
    );
};

const Chat: React.FC<{ env: string; onReset: () => void }> = ({ env, onReset }) => {
    const { user } = useUser();
    const { data: connectionsData, refetch: refetchConnections } = useConnections({ env, integrationIds: PLAYGROUND_INTEGRATION_IDS });
    const connections = useMemo(
        () =>
            (connectionsData?.pages.flatMap((page) => page.data) ?? []).filter((connection) => user && connection.tags[PLAYGROUND_USER_TAG_KEY] === user.uuid),
        [connectionsData, user]
    );

    const providerFor = useCallback(
        (integrationId: string) =>
            connections.find((connection) => connection.provider_config_key === integrationId)?.provider ??
            (integrationId.startsWith(PLAYGROUND_INTEGRATION_PREFIX) ? integrationId.slice(PLAYGROUND_INTEGRATION_PREFIX.length) : integrationId),
        [connections]
    );

    const sessionId = useRef<string | undefined>(undefined);
    const transport = useMemo(
        () =>
            new DefaultChatTransport<PlaygroundMessage>({
                api: new URL(`/api/v1/agent-playground/chat?env=${env}`, globalEnv.dashboardApiUrl).toString(),
                credentials: 'include',
                prepareSendMessagesRequest: ({ messages }) => ({
                    body: { messages, sessionId: sessionId.current, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
                })
            }),
        [env]
    );

    const { messages, sendMessage, regenerate, status, stop, error, clearError, addToolApprovalResponse } = useChat<PlaygroundMessage>({
        transport,
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses
    });
    const onApprove = useCallback(
        (approvalId: string, approved: boolean) => void addToolApprovalResponse({ id: approvalId, approved }),
        [addToolApprovalResponse]
    );

    useEffect(() => {
        const latest = [...messages].reverse().find((message) => message.metadata?.sessionId);
        if (latest?.metadata?.sessionId) {
            sessionId.current = latest.metadata.sessionId;
        }
    }, [messages]);

    const busy = status === 'submitted' || status === 'streaming';
    const [input, setInput] = useState('');

    const send = (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || busy) {
            return;
        }
        setInput('');
        pinnedToBottom.current = true;
        void sendMessage({ text: trimmed });
    };

    const onConnected = useCallback(
        (integrationId: string) => {
            void refetchConnections();
            void sendMessage({ text: `I've connected ${humanize(integrationId)}.`, metadata: { hidden: true } });
        },
        [refetchConnections, sendMessage]
    );

    const scroller = useRef<HTMLDivElement>(null);
    const bottom = useRef<HTMLDivElement>(null);
    const pinnedToBottom = useRef(true);
    const onScroll = () => {
        const el = scroller.current;
        if (el) {
            pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }
    };
    useEffect(() => {
        if (pinnedToBottom.current) {
            bottom.current?.scrollIntoView({ block: 'end' });
        }
    }, [messages]);

    const composer = (
        <form
            className="w-full [&_[data-align=inline-end]]:self-end [&_[data-align=inline-end]]:pb-2 [&_textarea]:max-h-48 [&_textarea]:min-h-20 [&_textarea]:resize-none [&_textarea]:[field-sizing:content]"
            onSubmit={(e) => {
                e.preventDefault();
                send(input);
            }}
        >
            <InputGroup>
                <InputGroupTextarea
                    value={input}
                    rows={1}
                    placeholder="Ask the agent to do something…"
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            send(input);
                        }
                    }}
                />
                <InputGroupAddon align="inline-end">
                    {busy ? (
                        <InputGroupButton label="Stop" variant="secondary" size="icon-sm" onClick={() => void stop()}>
                            <Square />
                        </InputGroupButton>
                    ) : (
                        <InputGroupButton label="Send" type="submit" variant="primary" size="icon-sm" disabled={!input.trim()}>
                            <ArrowUp />
                        </InputGroupButton>
                    )}
                </InputGroupAddon>
            </InputGroup>
        </form>
    );

    if (messages.length === 0) {
        return (
            <div className="mx-auto flex h-full max-w-3xl flex-col">
                <EmptyState composer={composer} onPick={send} />
            </div>
        );
    }

    return (
        <div className="mx-auto flex h-full max-w-3xl flex-col">
            <div className="flex items-center pb-4">
                <Button variant="secondary" size="sm" onClick={onReset}>
                    <Plus /> New chat
                </Button>
            </div>

            <div ref={scroller} onScroll={onScroll} className="flex min-h-0 flex-1 flex-col gap-8 overflow-auto pb-6">
                {messages.map((message) =>
                    message.metadata?.hidden ? null : message.role === 'user' ? (
                        <div
                            key={message.id}
                            className="max-w-[80%] self-end whitespace-pre-wrap rounded-ds-xs bg-surface-panel-inset px-4 py-2.5 text-body-medium-regular text-text-default"
                        >
                            {message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('')}
                        </div>
                    ) : (
                        <div key={message.id} className="flex flex-col gap-5">
                            {message.parts.map((part, index) => {
                                if (part.type === 'text') {
                                    return part.text ? (
                                        <Markdown key={index}>{part.state === 'streaming' ? hideTrailingLink(part.text) : part.text}</Markdown>
                                    ) : null;
                                }
                                if (part.type === 'dynamic-tool') {
                                    return (
                                        <ToolCallCard
                                            key={part.toolCallId}
                                            part={part}
                                            providerFor={providerFor}
                                            onConnected={onConnected}
                                            onApprove={onApprove}
                                        />
                                    );
                                }
                                return null;
                            })}
                        </div>
                    )
                )}

                {busy && <WorkingIndicator messages={messages} />}
                {error && (
                    <ErrorNotice
                        error={error}
                        onRetry={() => {
                            clearError();
                            void regenerate();
                        }}
                        onReset={onReset}
                    />
                )}
                <div ref={bottom} />
            </div>

            {composer}
        </div>
    );
};

const ErrorNotice: React.FC<{ error: Error; onRetry: () => void; onReset: () => void }> = ({ error, onRetry, onReset }) => {
    const { title, detail, action } = describeChatError(error);

    return (
        <div className="flex items-center gap-3 rounded-ds-xs border border-border-muted bg-surface-panel px-4 py-3" role="alert">
            <XCircle className="size-5 shrink-0 text-icon-danger" />
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-medium-medium text-text-strong">{title}</span>
                {detail && <span className="line-clamp-2 break-words text-body-small-regular text-text-secondary">{detail}</span>}
            </div>
            {action === 'retry' && (
                <Button size="sm" variant="secondary" onClick={onRetry}>
                    <RotateCcw /> Try again
                </Button>
            )}
            {action === 'new-chat' && (
                <Button size="sm" variant="secondary" onClick={onReset}>
                    <Plus /> New chat
                </Button>
            )}
        </div>
    );
};

function workingLabel(messages: PlaygroundMessage[]): string | null {
    const last = messages.at(-1);
    const part = last?.role === 'assistant' ? last.parts.at(-1) : undefined;

    if (part?.type === 'text') {
        return null;
    }
    if (part?.type === 'dynamic-tool') {
        if (part.state === 'approval-requested') {
            return null;
        }
        if (part.state === 'input-streaming' || part.state === 'input-available' || part.state === 'approval-responded') {
            return `${describeTool(part.toolName, part.input).title}…`;
        }
    }
    return 'Thinking…';
}

const WorkingIndicator: React.FC<{ messages: PlaygroundMessage[] }> = ({ messages }) => {
    const label = workingLabel(messages);
    if (!label) {
        return null;
    }

    return (
        <div className="flex items-center gap-2 text-body-medium-regular text-text-secondary" role="status">
            <span className="flex gap-1">
                {[0, 150, 300].map((delay) => (
                    <span key={delay} className="size-1.5 animate-bounce rounded-full bg-text-secondary" style={{ animationDelay: `${delay}ms` }} />
                ))}
            </span>
            <span className="animate-pulse">{label}</span>
        </div>
    );
};

const EmptyState: React.FC<{ composer: React.ReactNode; onPick: (prompt: string) => void }> = ({ composer, onPick }) => {
    return (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 pb-8 text-center">
            <div className="relative flex w-full justify-center">
                <LogoInverted
                    aria-hidden
                    className="pointer-events-none absolute bottom-[calc(100%+16px)] left-1/2 size-40 -translate-x-1/2 text-text-strong opacity-[0.05] [mask-image:radial-gradient(circle,black_45%,transparent_75%)]"
                />
                <h2 className="relative text-heading-medium text-text-strong">Explore how Nango works with an agent</h2>
            </div>
            {composer}
            <div className="grid w-full grid-cols-2 gap-3">
                {STARTER_PROMPTS.map(({ prompt, icon }) => (
                    <button
                        key={prompt}
                        type="button"
                        onClick={() => onPick(prompt)}
                        className="flex items-center gap-3 rounded-ds-xs border-ds-hairline border-border-input bg-surface-panel px-3 py-2.5 text-left text-body-medium-regular text-text-default transition-colors hover:border-border-input-hover"
                    >
                        {icon}
                        {prompt}
                    </button>
                ))}
            </div>
        </div>
    );
};
