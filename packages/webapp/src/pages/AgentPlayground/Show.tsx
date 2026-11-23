import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { ArrowUp, CircleAlert, Plus, RotateCcw, Square } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Helmet } from 'react-helmet';
import { useLocation, useNavigate } from 'react-router-dom';

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

import { OpenAIIcon } from '@/assets/OpenAIIcon';
import { PromptCard } from '@/components/patterns/PromptCard';
import { useListIntegrations } from '@/hooks/useIntegration';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions';
import { useUser } from '@/hooks/useUser';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { deleteAgentPlaygroundChat, openAgentPlaygroundChat, saveAgentPlaygroundChat } from '@/store/agentPlaygroundChat';
import { analyticsSessionHeaders, track } from '@/utils/analytics';
import { globalEnv } from '@/utils/env';
import { cn } from '@/utils/utils';
import { approvalProperties, pendingApprovals } from './approvalTracking';
import { describeChatError } from './chatError';
import { HeroIllustration } from './components/HeroIllustration';
import { IntegrationSetupNotice } from './components/IntegrationSetupNotice';
import { Markdown } from './components/Markdown';
import { SessionNotice } from './components/SessionNotice';
import { ToolCallCard } from './components/ToolCallCard';
import { ToolCallGroup } from './components/ToolCallGroup';
import { readPlaygroundDraft } from './draft';
import { hasReplyContent, hasVisibleContent, markStopped, outcomeDisplay, setReplyOutcome } from './replyOutcome';
import { continueOncePerSetUp, createdIntegrationIds, isSetUpPart, providersToAdd, setUpApps, setUpResults } from './setUpTool';
import { providerName, STARTER_PROMPTS } from './starterPrompts';
import { hideTrailingLink } from './streamingMarkdown';
import { integrationLabels, labelFor } from './toolDisplay';
import { groupReplyParts } from './toolGroups';
import { useResumeAfterSetUp } from './useResumeAfterSetUp';

import type { PendingApproval } from './approvalTracking';
import type { PlaygroundDraft } from './draft';
import type { ReplyEntry, ReplyItem } from './toolGroups';
import type { PlaygroundMessage } from '@/store/agentPlaygroundChat';
import type { AgentPlaygroundReplyOutcome } from '@nangohq/types';

export const AgentPlayground: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data: meta } = useMeta();
    const { can } = usePermissions();
    const [toolbarSlot, setToolbarSlot] = useState<HTMLDivElement | null>(null);
    const [chatKey, setChatKey] = useState(0);
    const location = useLocation();
    const navigate = useNavigate();
    const [draft, setDraft] = useState(() => readPlaygroundDraft(location.state));
    if (draft && draft.env !== env) {
        setDraft(undefined);
    }
    useEffect(() => {
        if (readPlaygroundDraft(location.state) !== undefined) {
            // Clears the draft, so a reload doesn't open another new chat with it.
            void navigate(location.pathname + location.search, { replace: true, state: null });
        }
    }, [location, navigate]);

    if (!meta) {
        return null;
    }
    if (!meta.data.agentPlayground) {
        return (
            <DashboardLayout>
                <p className="text-text-secondary">The Agent Playground is not enabled for this account.</p>
            </DashboardLayout>
        );
    }
    if (!can('environment:agent_sessions:write')) {
        return (
            <DashboardLayout>
                <p className="text-text-secondary">{`Your role can't use the Agent Playground in this environment.`}</p>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout width="narrow" className="h-full" actions={<div ref={setToolbarSlot} />}>
            <Helmet>
                <title>Agent Playground - Nango</title>
            </Helmet>
            <Chat
                key={`${env}-${chatKey}`}
                env={env}
                draft={chatKey === 0 && draft?.env === env ? draft : undefined}
                toolbarSlot={toolbarSlot}
                onNewChat={() => setChatKey((key) => key + 1)}
            />
        </DashboardLayout>
    );
};

const Chat: React.FC<{ env: string; draft: PlaygroundDraft | undefined; toolbarSlot: HTMLElement | null; onNewChat: () => void }> = ({
    env,
    draft: playgroundDraft,
    toolbarSlot,
    onNewChat
}) => {
    const { user } = useUser();
    const userId = user?.uuid;
    const draft = playgroundDraft?.text;
    const [{ chatId, messages: storedMessages }] = useState(() =>
        userId && draft === undefined ? openAgentPlaygroundChat(env, userId) : { chatId: crypto.randomUUID(), messages: undefined }
    );

    const sessionId = useRef<string | undefined>(undefined);
    const transport = useMemo(() => {
        const api = new URL(`/api/v1/agent-playground/chat?env=${env}`, globalEnv.dashboardApiUrl);
        return new DefaultChatTransport<PlaygroundMessage>({
            api: api.toString(),
            credentials: 'include',
            prepareSendMessagesRequest: ({ messages }) => ({
                body: { messages, sessionId: sessionId.current, chatId, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                headers: analyticsSessionHeaders(api)
            })
        });
    }, [env, chatId]);
    const onReset = () => {
        deleteAgentPlaygroundChat(chatId);
        onNewChat();
    };
    const failure = useRef<string | undefined>(undefined);
    const leaving = useRef(false);
    const [continuesAfterSetUp] = useState(continueOncePerSetUp);
    const { messages, setMessages, sendMessage, regenerate, status, stop, clearError, addToolApprovalResponse } = useChat<PlaygroundMessage>({
        transport,
        ...(storedMessages ? { messages: storedMessages } : {}),
        sendAutomaticallyWhen: (options) => lastAssistantMessageIsCompleteWithApprovalResponses(options) || continuesAfterSetUp(options),
        onError: (err) => {
            failure.current = err.message;
        },
        onFinish: ({ message, isAbort, isError }) => {
            const error = failure.current ?? '';
            failure.current = undefined;
            if (isAbort || leaving.current) {
                setMessages(markStopped);
            } else if (isError) {
                setMessages((current) => setReplyOutcome(current, { kind: 'failed', error }));
            } else {
                for (const part of pendingApprovals(message)) {
                    track('playground:approval_view', approvalProperties(part, chatId, message.metadata?.sessionId ?? sessionId.current));
                }
            }
        }
    });
    const onApprove = useCallback(
        (part: PendingApproval, approved: boolean) => {
            track('playground:approval_button_click', { ...approvalProperties(part, chatId, sessionId.current), is_approved: approved });
            void addToolApprovalResponse({ id: part.approval.id, approved });
        },
        [addToolApprovalResponse, chatId]
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
            return;
        }
        leaving.current = false;
        // Leaving the page cancels the request, and the SDK reports that as a network error.
        // Chrome cancels it before `pagehide`, so only `beforeunload` comes early enough.
        const onLeave = () => {
            leaving.current = true;
        };
        window.addEventListener('beforeunload', onLeave);
        return () => window.removeEventListener('beforeunload', onLeave);
    }, [busy]);
    useEffect(() => {
        if (userId) {
            // If the page closes mid-reply, the reload shows the reply as stopped.
            saveAgentPlaygroundChat({ chatId, env, userId, messages: busy ? markStopped(messages) : messages });
        }
    }, [chatId, env, userId, messages, busy]);

    const lastMessage = messages.at(-1);
    // A new turn would drop the pending tool call, so the change is never approved or denied.
    const awaitingApproval = lastMessage?.role === 'assistant' && pendingApprovals(lastMessage).length > 0;
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

    const isAwaitingSetUp = providersToAdd(messages.at(-1)).length > 0;
    const { data: integrations, dataUpdatedAt: integrationsUpdatedAt, refetch: refetchIntegrations } = useListIntegrations(env, { watch: isAwaitingSetUp });
    const labels = useMemo(() => (integrations ? integrationLabels(integrations.data) : undefined), [integrations]);
    const refetchedFor = useRef(new Set<string>());
    useEffect(() => {
        const unlabelled = createdIntegrationIds(messages).filter((id) => labels && !labels.has(id) && !refetchedFor.current.has(id));
        if (unlabelled.length > 0) {
            unlabelled.forEach((id) => refetchedFor.current.add(id));
            void refetchIntegrations();
        }
    }, [messages, labels, refetchIntegrations]);
    const addedIntegrations = useMemo(() => {
        // Matches the server's existingIntegrationFor, so the notice links to the integration the agent uses.
        const rank = (key: string, provider: string) => [provider, `pg-${provider}`].indexOf(key) >>> 0;
        const added = new Map<string, string>();
        for (const integration of integrations?.data ?? []) {
            const current = added.get(integration.provider);
            if (
                integration.missing_fields.length === 0 &&
                (!current || rank(integration.unique_key, integration.provider) < rank(current, integration.provider))
            ) {
                added.set(integration.provider, integration.unique_key);
            }
        }
        return added;
    }, [integrations]);
    const integrationNames = useCallback((ids: string[]) => ids.map((id) => labelFor(id, labels).integrationName).join(' and '), [labels]);

    const [pendingConnections, setPendingConnections] = useState<string[]>([]);
    const onConnected = useCallback((integrationId: string) => {
        setPendingConnections((ids) => (ids.includes(integrationId) ? ids : [...ids, integrationId]));
    }, []);
    // Waits for the current reply to finish, so two turns never stream at the same time.
    useEffect(() => {
        if (pendingConnections.length > 0 && !busy && !awaitingApproval) {
            setPendingConnections([]);
            void sendMessage({
                text: `I've connected ${integrationNames(pendingConnections)}.`,
                metadata: { hidden: true, connectedIntegrations: pendingConnections }
            });
        }
    }, [pendingConnections, busy, awaitingApproval, sendMessage, integrationNames]);
    const connectedIntegrations = useMemo(
        () => new Set([...pendingConnections, ...messages.flatMap((message) => message.metadata?.connectedIntegrations ?? [])]),
        [pendingConnections, messages]
    );

    useResumeAfterSetUp({
        messages,
        integrationsLoaded: Boolean(integrations),
        integrationsUpdatedAt,
        addedIntegrations,
        canSend: !busy && !awaitingApproval,
        providerName,
        sendMessage
    });

    const [newLinkRequests, setNewLinkRequests] = useState<string[]>([]);
    const onRequestNewLink = useCallback((integrationId: string) => {
        setNewLinkRequests((ids) => (ids.includes(integrationId) ? ids : [...ids, integrationId]));
    }, []);
    useEffect(() => {
        if (newLinkRequests.length > 0 && !busy && !awaitingApproval) {
            setNewLinkRequests([]);
            void sendMessage({
                text: `My link to connect ${integrationNames(newLinkRequests)} expired. Give me a new Connect button, and don't put the link in your reply.`,
                metadata: { hidden: true }
            });
        }
    }, [newLinkRequests, busy, awaitingApproval, sendMessage, integrationNames]);

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

    const sendFromComposer = (text: string): boolean => {
        // An edited draft may ask about another app. Only an unedited one sets up its starter's integration.
        const isUneditedDraft = messages.length === 0 && playgroundDraft !== undefined && text.trim() === playgroundDraft.text.trim();
        return send(text, isUneditedDraft ? playgroundDraft.starterProvider : undefined);
    };
    const composer = (
        <Composer
            // The composer remounts when the first message appears, so passing the draft after that would refill it.
            draft={messages.length === 0 ? draft : undefined}
            busy={busy}
            awaitingApproval={awaitingApproval}
            onSend={sendFromComposer}
            onStop={() => void stop()}
        />
    );

    if (messages.length === 0) {
        return (
            <div className="flex h-full flex-col">
                <EmptyState composer={composer} suggested={draft !== undefined} onPick={send} />
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            {toolbarSlot &&
                createPortal(
                    <Button onClick={onReset}>
                        <Plus /> New chat
                    </Button>,
                    toolbarSlot
                )}

            <div
                ref={scroller}
                onScroll={onScroll}
                className="-mx-4 flex min-h-0 flex-1 flex-col gap-8 overflow-auto px-4 pt-4 pb-6 [mask-image:linear-gradient(to_bottom,transparent,black_16px,black_calc(100%-16px),transparent)]"
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
                    const sessionCreated = message.metadata?.sessionCreated;
                    const sessionNotice = sessionCreated && <SessionNotice created={sessionCreated} replaced={message.id !== firstSessionMessageId} />;
                    const chatActive = message === lastMessage && busy;
                    const approvalSending = message === lastMessage && status === 'ready';
                    const renderEntry = (entry: ReplyEntry) => {
                        if (entry.kind === 'text') {
                            const { text, state } = entry.part;
                            return <Markdown key={entry.key}>{state === 'streaming' ? hideTrailingLink(text) : text}</Markdown>;
                        }
                        const part = entry.part;
                        return (
                            <ToolCallCard
                                key={entry.key}
                                part={part}
                                labels={labels}
                                chatActive={chatActive}
                                approvalSending={approvalSending}
                                connectedIntegrations={connectedIntegrations}
                                onConnected={onConnected}
                                onRequestNewLink={onRequestNewLink}
                                onApprove={onApprove}
                                onRetryInterrupted={message === lastMessage ? onRetryInterrupted : undefined}
                                onTryAgain={part === stoppedToolCall ? onRetry : undefined}
                            />
                        );
                    };
                    const renderItem = (item: ReplyItem) => {
                        if (item.kind !== 'group') {
                            return renderEntry(item);
                        }
                        return (
                            <ToolCallGroup
                                key={item.key}
                                calls={item.calls}
                                entries={item.entries}
                                labels={labels}
                                chatActive={chatActive}
                                approvalSending={approvalSending}
                                renderEntry={renderEntry}
                            />
                        );
                    };
                    return (
                        <div key={message.id} className={cn('flex flex-col gap-5', messages[index - 1]?.metadata?.hidden && '-mt-3')}>
                            {message.metadata?.integrationSetup && (
                                <IntegrationSetupNotice
                                    env={env}
                                    setup={message.metadata.integrationSetup}
                                    labels={labels}
                                    addedIntegrations={addedIntegrations}
                                    onTryAgain={message.id === lastMessage?.id && !busy ? () => void regenerate() : undefined}
                                />
                            )}
                            {sessionNotice}
                            {groupReplyParts(message.parts, stoppedToolCall).map((item) => {
                                if (item.kind === 'tool' && isSetUpPart(item.part)) {
                                    const part = item.part;
                                    return (
                                        <Fragment key={part.toolCallId}>
                                            {setUpResults(part).map((setup) => (
                                                <IntegrationSetupNotice
                                                    key={setup.provider}
                                                    env={env}
                                                    setup={setup}
                                                    labels={labels}
                                                    addedIntegrations={addedIntegrations}
                                                />
                                            ))}
                                        </Fragment>
                                    );
                                }
                                return renderItem(item);
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

function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Holds the draft itself, so typing doesn't re-render the message list.
const Composer: React.FC<{ draft: string | undefined; busy: boolean; awaitingApproval: boolean; onSend: (text: string) => boolean; onStop: () => void }> = ({
    draft,
    busy,
    awaitingApproval,
    onSend,
    onStop
}) => {
    const [input, setInput] = useState(() => (draft !== undefined && prefersReducedMotion() ? draft : ''));
    const [typing, setTyping] = useState(() => draft !== undefined && !prefersReducedMotion());
    const stopTyping = useRef<() => void>(() => {});
    useEffect(() => {
        if (draft === undefined || prefersReducedMotion()) {
            return;
        }
        let typed = 0;
        const step = Math.max(8, Math.min(20, 450 / draft.length));
        const interval = window.setInterval(() => {
            typed += 1;
            setInput(draft.slice(0, typed));
            if (typed >= draft.length) {
                window.clearInterval(interval);
                setTyping(false);
            }
        }, step);
        stopTyping.current = () => window.clearInterval(interval);
        return () => stopTyping.current();
    }, [draft]);
    const submit = () => {
        if (!typing && onSend(input)) {
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
                    autoFocus={draft !== undefined}
                    onFocus={(e) => {
                        const end = e.currentTarget.value.length;
                        e.currentTarget.setSelectionRange(end, end);
                    }}
                    rows={1}
                    placeholder={awaitingApproval ? 'Approve or deny the change to continue…' : 'Ask the agent to do something…'}
                    onChange={(e) => {
                        stopTyping.current();
                        setTyping(false);
                        setInput(e.target.value);
                    }}
                    onKeyDown={(e) => {
                        // Safari sends the key that ends an IME composition with isComposing false and keyCode 229.
                        const composing = e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229;
                        if (e.key === 'Enter' && !e.shiftKey && !composing) {
                            e.preventDefault();
                            submit();
                        } else if (e.key === 'Escape' && busy && !composing) {
                            e.preventDefault();
                            onStop();
                        }
                    }}
                />
                <InputGroupAddon align="inline-end">
                    {/* TODO: read the model from the server once the playground supports more than one. */}
                    <span className="mr-2 flex items-center gap-1 text-body-small-regular text-text-muted">
                        <OpenAIIcon className="size-3.5" />
                        GPT-6 Luna
                    </span>
                    {/* Separate keys: a reused element turns into the submit button mid-click and sends the draft. */}
                    {busy ? (
                        <InputGroupButton key="stop" label="Stop (Esc)" variant="primary" size="icon-sm" onClick={onStop}>
                            <Square className="size-3 fill-current" />
                        </InputGroupButton>
                    ) : (
                        <InputGroupButton
                            key="send"
                            label="Send"
                            type="submit"
                            variant="primary"
                            size="icon-sm"
                            disabled={!input.trim() || awaitingApproval || typing}
                        >
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
    if (part?.type === 'dynamic-tool' && isSetUpPart(part) && (part.state === 'input-streaming' || part.state === 'input-available')) {
        const apps = setUpApps(part);
        return apps.length > 0 ? `Adding ${apps.map(providerName).join(' and ')}…` : 'Adding integrations…';
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

const EmptyState: React.FC<{ composer: React.ReactNode; suggested: boolean; onPick: (prompt: string, provider: string) => void }> = ({
    composer,
    suggested,
    onPick
}) => {
    return (
        <div className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full flex-[3] flex-col items-center justify-end gap-12 pb-6">
                <HeroIllustration animated={!suggested} />
                <h2 className="text-heading-medium text-text-strong">Explore how Nango works with an agent</h2>
            </div>
            {composer}
            <div className="grid w-full flex-[4] auto-rows-min grid-cols-2 gap-3 pt-6">
                {!suggested &&
                    STARTER_PROMPTS.map(({ prompt, provider, name }) => (
                        <PromptCard key={prompt} prompt={prompt} provider={provider} name={name} action="send" onClick={() => onPick(prompt, provider)} />
                    ))}
            </div>
        </div>
    );
};
