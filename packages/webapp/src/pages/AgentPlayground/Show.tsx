import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { ArrowUp, ArrowUpRight, BookOpen, ChevronDown, CircleAlert, Plus, RotateCcw, Settings2, Square } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

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
import { ButtonLink } from '@/components/ui/ButtonLink';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { useUser } from '@/hooks/useUser';
import { usePlaygroundToolbarSlot } from '@/pages/Playground/Show';
import { useStore } from '@/store';
import { clearAgentPlaygroundChat, loadAgentPlaygroundChat, saveAgentPlaygroundChat } from '@/store/agentPlaygroundChat';
import { globalEnv } from '@/utils/env';
import { cn } from '@/utils/utils';
import { describeChatError } from './chatError';
import { Markdown } from './components/Markdown';
import { ToolCallCard } from './components/ToolCallCard';
import { hasReplyContent, hasVisibleContent, markStopped, outcomeDisplay, setReplyOutcome } from './replyOutcome';
import { hideTrailingLink } from './streamingMarkdown';
import { humanize } from './toolDisplay';

import type { PlaygroundMessage } from '@/store/agentPlaygroundChat';
import type { AgentPlaygroundIntegrationSetup, AgentPlaygroundReplyOutcome, AgentPlaygroundSessionCreated } from '@nangohq/types';

const STARTER_PROMPTS: { prompt: string; provider: string; name: string }[] = [
    { prompt: "What's on my Google Calendar today?", provider: 'google-calendar', name: 'Google Calendar' },
    { prompt: 'Summarize my latest unread emails in Gmail', provider: 'google-mail', name: 'Gmail' },
    { prompt: "Star Nango's GitHub repo", provider: 'github', name: 'GitHub' },
    { prompt: 'Send me a Slack message saying "Hello, world!"', provider: 'slack', name: 'Slack' },
    { prompt: 'What Linear issues are assigned to me?', provider: 'linear', name: 'Linear' },
    { prompt: 'Show my 5 newest HubSpot contacts', provider: 'hubspot', name: 'HubSpot' }
];

function providerName(provider: string): string {
    return STARTER_PROMPTS.find((starter) => starter.provider === provider)?.name ?? humanize(provider);
}

export const AgentPlayground: React.FC = () => {
    const env = useStore((state) => state.env);
    const toolbarSlot = usePlaygroundToolbarSlot();
    const [chatKey, setChatKey] = useState(0);

    return (
        <Chat
            key={`${env}-${chatKey}`}
            env={env}
            toolbarSlot={toolbarSlot}
            onReset={() => {
                clearAgentPlaygroundChat();
                setChatKey((key) => key + 1);
            }}
        />
    );
};

const Chat: React.FC<{ env: string; toolbarSlot: HTMLElement | null; onReset: () => void }> = ({ env, toolbarSlot, onReset }) => {
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

    const { user } = useUser();
    const userId = user?.uuid;
    const [storedMessages] = useState(() => (userId ? loadAgentPlaygroundChat(env, userId) : undefined));
    const failure = useRef<string | undefined>(undefined);
    const { messages, setMessages, sendMessage, regenerate, status, stop, clearError, addToolApprovalResponse } = useChat<PlaygroundMessage>({
        transport,
        ...(storedMessages ? { messages: storedMessages } : {}),
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
        onError: (err) => {
            failure.current = err.message;
        },
        onFinish: ({ isAbort, isError }) => {
            const error = failure.current ?? '';
            failure.current = undefined;
            if (isAbort) {
                setMessages(markStopped);
            } else if (isError) {
                setMessages((current) => setReplyOutcome(current, { kind: 'failed', error }));
            }
        }
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
        if (!busy && userId) {
            saveAgentPlaygroundChat(env, userId, messages);
        }
    }, [env, userId, messages, busy]);

    const lastMessage = messages.at(-1);
    // A new turn would drop the pending tool call, so the change is never approved or denied.
    const awaitingApproval =
        lastMessage?.role === 'assistant' &&
        lastMessage.parts.some((part) => part.type === 'dynamic-tool' && part.state === 'approval-requested' && !part.approval.isAutomatic);
    const answeredApprovalPending =
        lastMessage?.role === 'assistant' && lastMessage.parts.some((part) => part.type === 'dynamic-tool' && part.state === 'approval-responded');
    const send = (text: string, starterProvider?: string): boolean => {
        const trimmed = text.trim();
        if (!trimmed || busy || awaitingApproval) {
            return false;
        }
        pinnedToBottom.current = true;
        void sendMessage({ text: trimmed, ...(starterProvider ? { metadata: { starterProvider } } : {}) });
        return true;
    };

    const retry = () => {
        clearError();
        if (awaitingApproval) {
            return;
        }
        // The SDK only sends an answered approval when the last message is still the assistant's.
        if (answeredApprovalPending) {
            setMessages((current) => setReplyOutcome(current, undefined));
            void sendMessage();
            return;
        }
        // Regenerating would replace the assistant message, and with it every tool call that already ran.
        if (lastMessage?.role === 'assistant') {
            if (!hasReplyContent(lastMessage)) {
                setMessages((current) => setReplyOutcome(current, undefined));
            }
            void sendMessage({ text: 'Continue.', metadata: { hidden: true } });
        } else {
            setMessages((current) => setReplyOutcome(current, undefined));
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
    }, [messages]);

    const firstSessionMessageId = messages.find((message) => message.metadata?.sessionCreated)?.id;

    const composer = <Composer busy={busy} awaitingApproval={awaitingApproval} onSend={send} onStop={() => void stop()} />;

    if (messages.length === 0) {
        return (
            <div className="mx-auto flex h-full max-w-[800px] flex-col">
                <EmptyState composer={composer} onPick={send} />
            </div>
        );
    }

    return (
        <div className="mx-auto flex h-full max-w-3xl flex-col">
            {toolbarSlot &&
                createPortal(
                    <div className="ml-auto">
                        <Button variant="outline" size="lg" onClick={onReset}>
                            <Plus /> New chat
                        </Button>
                    </div>,
                    toolbarSlot
                )}

            <div
                ref={scroller}
                onScroll={onScroll}
                className="flex min-h-0 flex-1 flex-col gap-8 overflow-auto pt-4 pb-6 [mask-image:linear-gradient(to_bottom,transparent,black_16px,black_calc(100%-16px),transparent)]"
            >
                {messages.map((message, index) => {
                    const onRetry = message.id === lastMessage?.id && !busy ? retry : undefined;
                    const { notice, stoppedToolCall } = outcomeDisplay(message);
                    const outcome = notice && <ReplyOutcomeNotice outcome={notice} onRetry={onRetry} onReset={onReset} />;
                    if (message.role === 'user') {
                        return (
                            <Fragment key={message.id}>
                                {!message.metadata?.hidden && (
                                    <div className="max-w-[80%] self-end whitespace-pre-wrap rounded-ds-xs bg-surface-panel-inset px-4 py-2.5 text-body-medium-regular text-text-default">
                                        {message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('')}
                                    </div>
                                )}
                                {outcome}
                            </Fragment>
                        );
                    }
                    if (!hasVisibleContent(message)) {
                        return null;
                    }
                    return (
                        <div key={message.id} className={cn('flex flex-col gap-5', messages[index - 1]?.metadata?.hidden && '-mt-3')}>
                            {message.metadata?.integrationSetup && (
                                <IntegrationSetupNotice
                                    env={env}
                                    setup={message.metadata.integrationSetup}
                                    onTryAgain={message.id === lastMessage?.id && !busy ? () => void regenerate() : undefined}
                                />
                            )}
                            {message.metadata?.sessionCreated && (
                                <SessionNotice created={message.metadata.sessionCreated} replaced={message.id !== firstSessionMessageId} />
                            )}
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
                                            chatActive={message === lastMessage && busy}
                                            approvalSending={message === lastMessage && status === 'ready'}
                                            connectedIntegrations={connectedIntegrations}
                                            onConnected={onConnected}
                                            onRequestNewLink={onRequestNewLink}
                                            onApprove={onApprove}
                                            onRetryInterrupted={message === lastMessage ? onRetryInterrupted : undefined}
                                            onTryAgain={part === stoppedToolCall ? onRetry : undefined}
                                        />
                                    );
                                }
                                return null;
                            })}
                            {outcome}
                        </div>
                    );
                })}

                {busy && <WorkingIndicator messages={messages} />}
                <div ref={bottom} />
            </div>

            {composer}
        </div>
    );
};

// Holds the draft itself, so typing doesn't re-render the message list.
const Composer: React.FC<{ busy: boolean; awaitingApproval: boolean; onSend: (text: string) => boolean; onStop: () => void }> = ({
    busy,
    awaitingApproval,
    onSend,
    onStop
}) => {
    const [input, setInput] = useState('');
    const submit = () => {
        if (onSend(input)) {
            setInput('');
        }
    };

    return (
        <form
            className="w-full"
            onSubmit={(e) => {
                e.preventDefault();
                submit();
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
                            submit();
                        }
                    }}
                />
                <InputGroupAddon align="inline-end">
                    {/* TODO: read the model from the server once the playground supports more than one. */}
                    <span className="mr-2 flex items-center gap-1 text-body-small-regular text-text-muted">
                        <img src="/images/template-logos/openai.svg" alt="" className="size-4.5" />
                        GPT-6 Luna
                    </span>
                    {busy ? (
                        <InputGroupButton label="Stop" variant="secondary" size="icon-sm" onClick={onStop}>
                            <Square className="size-3 fill-current" />
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
};

const ReplyOutcomeNotice: React.FC<{
    outcome: AgentPlaygroundReplyOutcome;
    onRetry: (() => void) | undefined;
    onReset: () => void;
}> = ({ outcome, onRetry, onReset }) => {
    if (outcome.kind === 'stopped') {
        return (
            <div className="flex items-center justify-between gap-3">
                <span className="text-body-medium-regular text-text-secondary">Response stopped.</span>
                {onRetry && (
                    <Button variant="outline" size="sm" onClick={onRetry}>
                        Continue
                    </Button>
                )}
            </div>
        );
    }

    const { title, detail, action } = describeChatError(outcome.error);
    return (
        <Alert variant="danger">
            <CircleAlert />
            <AlertTitle>{title}</AlertTitle>
            {detail && <AlertDescription>{detail}</AlertDescription>}
            {onRetry && action !== 'none' && (
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
    if (last?.role === 'user' && last.metadata?.starterProvider) {
        return `Setting up ${providerName(last.metadata.starterProvider)}…`;
    }
    const part = last?.role === 'assistant' ? last.parts.at(-1) : undefined;

    if (part?.type === 'text') {
        return null;
    }
    if (part?.type === 'dynamic-tool') {
        if (
            part.state === 'approval-requested' ||
            part.state === 'input-streaming' ||
            part.state === 'input-available' ||
            part.state === 'approval-responded'
        ) {
            return null;
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

const IntegrationSetupNotice: React.FC<{ env: string; setup: AgentPlaygroundIntegrationSetup; onTryAgain?: (() => void) | undefined }> = ({
    env,
    setup,
    onTryAgain
}) => {
    const name = providerName(setup.provider);
    const href = setup.integrationId ? `/${env}/integrations/${setup.integrationId}` : `/${env}/integrations/create/${setup.provider}`;

    if (setup.outcome === 'created' || setup.outcome === 'existing') {
        return (
            <div className="flex min-h-7 items-center gap-2 pr-[17px] text-body-medium-regular text-text-secondary" role="status">
                <IntegrationLogo provider={setup.provider} className="-mx-0.5 size-5 shrink-0 border-0 bg-transparent p-0" />
                <span className="min-w-0 truncate">{setup.outcome === 'created' ? `Created the ${name} integration` : `Using your ${name} integration`}</span>
                <span className="ml-auto flex shrink-0 items-center gap-2 pl-2">
                    <ButtonLink to={href} variant="outline" size="sm">
                        View integration
                    </ButtonLink>
                </span>
            </div>
        );
    }

    return (
        <Alert variant="warning">
            <CircleAlert />
            <AlertTitle>
                {setup.outcome === 'missing_credentials' ? `Finish setting up your ${name} integration` : `Create a ${name} integration to continue`}
            </AlertTitle>
            <AlertDescription>
                {setup.outcome === 'missing_credentials'
                    ? "It's missing its client ID or secret. Add them, then retry the prompt."
                    : `This session needs a ${name} integration in this environment.`}
            </AlertDescription>
            <AlertActions>
                <AlertButton asChild>
                    <Link to={href}>
                        {setup.outcome === 'missing_credentials' ? (
                            <>
                                <Settings2 /> Open integration
                            </>
                        ) : (
                            <>
                                <Plus /> Create integration
                            </>
                        )}
                    </Link>
                </AlertButton>
                {onTryAgain && (
                    <AlertButton onClick={onTryAgain}>
                        <RotateCcw /> Retry prompt
                    </AlertButton>
                )}
            </AlertActions>
        </Alert>
    );
};

function sessionNoticeText(reason: AgentPlaygroundSessionCreated['reason'], replaced: boolean): string {
    switch (reason) {
        case 'integrations_changed':
            return 'Started a new agent session to pick up your integration changes';
        case 'connections_changed':
            return 'Started a new agent session to pick up your new connections';
        case 'expired':
            return 'Started a new agent session because the last one expired';
        default:
            return replaced ? 'Started a new agent session' : 'Started an agent session';
    }
}

const SessionNotice: React.FC<{ created: AgentPlaygroundSessionCreated; replaced: boolean }> = ({ created, replaced }) => {
    return (
        <Collapsible className="group/session flex flex-col gap-3">
            <CollapsibleTrigger className="flex min-h-7 w-full items-center gap-2 pr-[17px] text-left text-body-medium-regular text-text-secondary hover:text-text-default">
                <LogoInverted className="size-4 shrink-0 text-text-strong" />
                <span className="min-w-0 truncate">{sessionNoticeText(created.reason, replaced)}</span>
                <span className="ml-auto flex shrink-0 items-center gap-2 pl-2 text-body-small-regular">
                    <span className="group-data-[state=open]/session:hidden">POST /sessions</span>
                    <ChevronDown className="size-4 transition-transform group-data-[state=open]/session:rotate-180" />
                </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <CodeBlock
                    title="POST /sessions"
                    language="json"
                    code={JSON.stringify(created.request, null, 2)}
                    constrainHeight={false}
                    headerElement={
                        <a
                            href="https://nango.dev/docs/guides/agent-sessions"
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-s text-text-muted hover:text-text-default"
                        >
                            <BookOpen className="size-3.5" />
                            Agent sessions docs
                            <ArrowUpRight className="size-3.5" />
                        </a>
                    }
                />
            </CollapsibleContent>
        </Collapsible>
    );
};

const EmptyState: React.FC<{ composer: React.ReactNode; onPick: (prompt: string, provider: string) => void }> = ({ composer, onPick }) => {
    return (
        <div className="flex flex-1 flex-col items-center text-center">
            {/* Equal-basis halves above and below keep the composer centred, whatever sits around it. */}
            <div className="flex w-full flex-1 basis-0 flex-col items-center justify-end pb-6">
                {/* Relies on LogoInverted's path order: hides the disc and eye, fills the wolf. */}
                <LogoInverted
                    aria-hidden
                    className="pointer-events-none -mb-28 size-96 text-text-strong opacity-[0.06] [mask-image:linear-gradient(to_bottom,black_30%,transparent_70%)] [&_path:nth-child(-n+2)]:hidden [&_path:nth-child(3)]:fill-current"
                />
                <h2 className="relative text-heading-medium text-text-strong">Explore how Nango works with an agent</h2>
            </div>
            {composer}
            <div className="grid w-full flex-1 basis-0 auto-rows-min grid-cols-2 gap-3 pt-6">
                {STARTER_PROMPTS.map(({ prompt, provider }) => (
                    <button
                        key={prompt}
                        type="button"
                        onClick={() => onPick(prompt, provider)}
                        className="group flex items-center gap-2.5 rounded-ds-xs border-ds-hairline border-border-muted bg-surface-panel px-3 py-3 text-left text-body-medium-regular text-text-default transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-container-panel"
                    >
                        <IntegrationLogo provider={provider} className="size-5 shrink-0 border-0 bg-transparent p-0" />
                        <span className="flex-1">{prompt}</span>
                        <ArrowUpRight className="size-4 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                ))}
            </div>
        </div>
    );
};
