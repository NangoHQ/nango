import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { ArrowUp, CircleAlert, Plus, RotateCcw, Square } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';

import {
    Alert,
    AlertActions,
    AlertButton,
    AlertDescription,
    AlertTitle,
    Button,
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupTextarea
} from '@nangohq/design-system';

import { LogoInverted } from '@/assets/LogoInverted';
import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { clearAgentPlaygroundChat, loadAgentPlaygroundChat, saveAgentPlaygroundChat } from '@/store/agentPlaygroundChat';
import { globalEnv } from '@/utils/env';
import { describeChatError } from './chatError';
import { Markdown } from './components/Markdown';
import { ToolCallCard } from './components/ToolCallCard';
import { hideTrailingLink } from './streamingMarkdown';
import { describeTool, humanize } from './toolDisplay';

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
    const { can } = usePermissions();
    const [chatKey, setChatKey] = useState(0);

    if (meta && !meta.data.agentPlayground) {
        return (
            <DashboardLayout title="Agent Playground">
                <p className="text-text-secondary">The Agent Playground is not enabled for this account.</p>
            </DashboardLayout>
        );
    }
    if (meta && !can('environment:agent_sessions:write')) {
        return (
            <DashboardLayout title="Agent Playground">
                <p className="text-text-secondary">{`Your role can't use the Agent Playground in this environment.`}</p>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout fullWidth title="Agent Playground" className="h-full">
            <Helmet>
                <title>Agent Playground - Nango</title>
            </Helmet>
            <Chat
                key={`${env}-${chatKey}`}
                env={env}
                onReset={() => {
                    clearAgentPlaygroundChat();
                    setChatKey((key) => key + 1);
                }}
            />
        </DashboardLayout>
    );
};

const Chat: React.FC<{ env: string; onReset: () => void }> = ({ env, onReset }) => {
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

    const [storedMessages] = useState(() => loadAgentPlaygroundChat(env));
    const { messages, sendMessage, regenerate, status, stop, error, clearError, addToolApprovalResponse } = useChat<PlaygroundMessage>({
        transport,
        ...(storedMessages ? { messages: storedMessages } : {}),
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
    useEffect(() => {
        if (!busy) {
            saveAgentPlaygroundChat(env, messages);
        }
    }, [env, messages, busy]);

    const lastMessage = messages.at(-1);
    // A new turn would drop the pending tool call, so the change is never approved or denied.
    const awaitingApproval =
        lastMessage?.role === 'assistant' && lastMessage.parts.some((part) => part.type === 'dynamic-tool' && part.state === 'approval-requested');
    const [input, setInput] = useState('');

    const send = (text: string) => {
        const trimmed = text.trim();
        if (!trimmed || busy || awaitingApproval) {
            return;
        }
        setInput('');
        pinnedToBottom.current = true;
        void sendMessage({ text: trimmed });
    };

    const retry = () => {
        clearError();
        // Regenerating would replace the assistant message, and with it every tool call that already ran.
        if (lastMessage?.role === 'assistant') {
            void sendMessage({ text: 'Continue.', metadata: { hidden: true } });
        } else {
            void regenerate();
        }
    };

    const [pendingConnections, setPendingConnections] = useState<string[]>([]);
    const onConnected = useCallback((integrationId: string) => {
        setPendingConnections((ids) => (ids.includes(integrationId) ? ids : [...ids, integrationId]));
    }, []);
    // Waits for the current reply to finish, so two turns never stream at the same time.
    useEffect(() => {
        if (pendingConnections.length > 0 && !busy && !awaitingApproval) {
            setPendingConnections([]);
            void sendMessage({
                text: `I've connected ${pendingConnections.map(humanize).join(' and ')}.`,
                metadata: { hidden: true, connectedIntegrations: pendingConnections }
            });
        }
    }, [pendingConnections, busy, awaitingApproval, sendMessage]);
    const connectedIntegrations = useMemo(
        () => new Set([...pendingConnections, ...messages.flatMap((message) => message.metadata?.connectedIntegrations ?? [])]),
        [pendingConnections, messages]
    );

    const [newLinkRequests, setNewLinkRequests] = useState<string[]>([]);
    const onRequestNewLink = useCallback((integrationId: string) => {
        setNewLinkRequests((ids) => (ids.includes(integrationId) ? ids : [...ids, integrationId]));
    }, []);
    useEffect(() => {
        if (newLinkRequests.length > 0 && !busy && !awaitingApproval) {
            setNewLinkRequests([]);
            void sendMessage({
                text: `My link to connect ${newLinkRequests.map(humanize).join(' and ')} expired. Give me a new Connect button, and don't put the link in your reply.`,
                metadata: { hidden: true }
            });
        }
    }, [newLinkRequests, busy, awaitingApproval, sendMessage]);

    const [retryRequests, setRetryRequests] = useState<string[]>([]);
    const onRetryInterrupted = useCallback((title: string) => {
        setRetryRequests((titles) => (titles.includes(title) ? titles : [...titles, title]));
    }, []);
    useEffect(() => {
        if (retryRequests.length > 0 && !busy && !awaitingApproval) {
            setRetryRequests([]);
            void sendMessage({
                text: `${retryRequests.join(' and ')} was interrupted after I approved it. Check whether the change already happened. If it did, tell me; if not, make it again.`,
                metadata: { hidden: true }
            });
        }
    }, [retryRequests, busy, awaitingApproval, sendMessage]);

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
    }, [messages, error]);

    const composer = (
        <form
            className="w-full"
            onSubmit={(e) => {
                e.preventDefault();
                send(input);
            }}
        >
            <InputGroup size="composer">
                <InputGroupTextarea
                    value={input}
                    rows={1}
                    placeholder={awaitingApproval ? 'Approve or deny the change to continue…' : 'Ask the agent to do something…'}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
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
                        <InputGroupButton label="Send" type="submit" variant="primary" size="icon-sm" disabled={!input.trim() || awaitingApproval}>
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
                                            chatActive={busy}
                                            connectedIntegrations={connectedIntegrations}
                                            onConnected={onConnected}
                                            onRequestNewLink={onRequestNewLink}
                                            onApprove={onApprove}
                                            onRetryInterrupted={message === lastMessage ? onRetryInterrupted : undefined}
                                        />
                                    );
                                }
                                return null;
                            })}
                        </div>
                    )
                )}

                {busy && <WorkingIndicator messages={messages} />}
                {error && <ErrorNotice error={error} onRetry={retry} onReset={onReset} />}
                <div ref={bottom} />
            </div>

            {composer}
        </div>
    );
};

const ErrorNotice: React.FC<{ error: Error; onRetry: () => void; onReset: () => void }> = ({ error, onRetry, onReset }) => {
    const { title, detail, action } = describeChatError(error);

    return (
        <Alert variant="danger">
            <CircleAlert />
            <AlertTitle>{title}</AlertTitle>
            {detail && <AlertDescription>{detail}</AlertDescription>}
            {action !== 'none' && (
                <AlertActions>
                    {action === 'retry' ? (
                        <AlertButton onClick={onRetry}>
                            <RotateCcw /> Try again
                        </AlertButton>
                    ) : (
                        <AlertButton onClick={onReset}>
                            <Plus /> New chat
                        </AlertButton>
                    )}
                </AlertActions>
            )}
        </Alert>
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
