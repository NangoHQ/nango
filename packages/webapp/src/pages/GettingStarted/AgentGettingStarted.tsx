import {
    ArrowRight,
    ArrowUpRight,
    Blocks,
    Check,
    Copy,
    KeyRound,
    List,
    Lock,
    MessageSquareCode,
    PartyPopper,
    RefreshCw,
    RotateCcw,
    Sparkles,
    Wrench
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';

import { Button } from '@nangohq/design-system';

import { ChecklistRow } from '@/components/patterns/ChecklistRow';
import { PromptCard } from '@/components/patterns/PromptCard';
import { CompactStepCard, StepCard, StepList } from '@/components/patterns/StepCard';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAgentGettingStarted, useRestartAgentGettingStarted } from '@/hooks/useAgentGettingStarted';
import { useApiKeys } from '@/hooks/useApiKeys';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { useUser } from '@/hooks/useUser';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { copyText } from '@/utils/clipboard';
import { globalEnv } from '@/utils/env';
import { deriveAgentProgress } from './agentProgress';
import { getInstallPrompt, pickPromptApiKey } from './agentPrompt';

import type { AgentProgress } from './agentProgress';
import type { AnalyticsEventProperties } from '@nangohq/types';
import type { LucideIcon } from 'lucide-react';

const TRY_PROMPTS = [
    { prompt: 'Summarize my last 5 Gmail emails', provider: 'google-mail', name: 'Gmail' },
    { prompt: "What's on my Google Calendar today?", provider: 'google-calendar', name: 'Google Calendar' },
    { prompt: 'Send me "Hello, world!" on Slack', provider: 'slack', name: 'Slack' },
    { prompt: 'Find my most recent Notion pages', provider: 'notion', name: 'Notion' }
];

const COPIED_FEEDBACK_MS = 1600;

type Copied = 'prompt' | 'key' | `try:${string}`;

export const AgentGettingStarted: React.FC = () => {
    const env = useStore((state) => state.env);
    const { user } = useUser();
    const { data: meta } = useMeta();
    const { can } = usePermissions();
    const { toast } = useToast();
    const { confirm, DialogComponent } = useConfirmDialog();

    const canReadSecret = can('environment:settings:read_secret');
    const showPlaygroundLink = Boolean(meta?.data.agentPlayground) && can('environment:agent_sessions:write');
    const { data: apiKeys, isLoading: isLoadingApiKeys, error: apiKeysError } = useApiKeys(canReadSecret ? env : '');
    const { data: environment, isLoading: isLoadingEnvironment, error: environmentError } = useEnvironment(canReadSecret ? env : '');
    // Permissions and keys decide what the prompt contains, so it can't be copied before they're known.
    const isLoadingPrompt = !user || !meta || isLoadingApiKeys || isLoadingEnvironment;
    // Self-hosted instances can pin the key with an env var; it isn't in the API keys list.
    const managedSecretKey = environment?.environmentAndAccount.managed_secret_key ?? null;
    const apiKey = canReadSecret ? (managedSecretKey ?? (apiKeys ? (pickPromptApiKey(apiKeys.data)?.secret ?? null) : null)) : null;

    const { data, error } = useAgentGettingStarted();
    const restartMutation = useRestartAgentGettingStarted();

    const [promptCopied, setPromptCopied] = useState(false);
    const progress = data ? deriveAgentProgress({ progress: data.data, promptCopied }) : null;

    const [justCopied, setJustCopied] = useState<Copied | null>(null);
    useEffect(() => {
        if (!justCopied) {
            return;
        }
        const timer = setTimeout(() => setJustCopied(null), COPIED_FEEDBACK_MS);
        return () => clearTimeout(timer);
    }, [justCopied]);

    const copy = useCallback(
        async (text: string, what: Copied): Promise<boolean> => {
            try {
                await copyText(text);
            } catch {
                toast({ title: 'Could not copy, your browser blocked clipboard access', variant: 'error' });
                return false;
            }
            setJustCopied(what);
            return true;
        },
        [toast]
    );

    const copyPrompt = async () => {
        if (!(await copy(getInstallPrompt({ apiKey, apiUrl: globalEnv.apiUrl }), 'prompt'))) {
            return;
        }
        track('onboarding:copy_prompt_button_click', { has_api_key: apiKey !== null });
        setPromptCopied(true);
    };

    const copyApiKey = async () => {
        if (apiKey && (await copy(apiKey, 'key'))) {
            track('onboarding:copy_api_key_button_click');
        }
    };

    const copyTryPrompt = async (prompt: string, provider: string) => {
        if (await copy(prompt, `try:${provider}`)) {
            track('onboarding:try_prompt_button_click', { integration: provider });
        }
    };

    const restart = () => {
        void confirm({
            title: 'Restart getting started?',
            description: 'This clears the checklist for everyone in your account. Your API key, connections and logs stay as they are.',
            confirmButtonText: 'Restart',
            confirmVariant: 'secondary',
            onConfirm: async () => {
                try {
                    await restartMutation.mutateAsync();
                } catch {
                    toast({ title: 'Could not restart getting started', variant: 'error' });
                    throw new Error('restart_failed');
                }
                track('onboarding:restart_button_click');
                setPromptCopied(false);
            }
        });
    };

    return (
        <DashboardLayout title="Getting started">
            <Helmet>
                <title>Getting started - Nango</title>
            </Helmet>
            <div className="mx-auto flex w-full max-w-[820px] flex-col gap-7">
                <h2 className="text-ds-3xl font-ds-regular leading-ds-tight tracking-ds-tight text-text-strong">Add Nango to your agent</h2>

                {error && !data ? (
                    <p className="type-text-regular-sm text-text-secondary">Could not load your progress. Refresh the page to try again.</p>
                ) : (
                    <StepList label="Setup steps">
                        {!progress || isLoadingPrompt ? (
                            <StepCard state="current" icon={MessageSquareCode} title="Install Nango">
                                <div className="flex gap-2">
                                    <Skeleton className="h-8 w-56" />
                                    <Skeleton className="h-8 w-32" />
                                </div>
                            </StepCard>
                        ) : progress.install === 'done' ? (
                            <CompactStepCard
                                icon={Check}
                                title="Install Nango"
                                summary={promptCopied ? 'Prompt copied' : 'Installed'}
                                actions={
                                    <>
                                        <Button variant="ghost" size="sm" onClick={() => void copyPrompt()}>
                                            {justCopied === 'prompt' ? <Check /> : <Copy />}
                                            {justCopied === 'prompt' ? 'Copied' : 'Copy prompt again'}
                                        </Button>
                                        <CopyApiKeyButton size="sm" disabled={!apiKey} copied={justCopied === 'key'} onClick={() => void copyApiKey()} />
                                    </>
                                }
                            />
                        ) : (
                            <StepCard
                                state="current"
                                icon={MessageSquareCode}
                                title="Install Nango"
                                description="Copy the prompt and paste it into your coding agent. It adds Nango to your agent in a few minutes."
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button variant="primary" size="md" onClick={() => void copyPrompt()}>
                                        {justCopied === 'prompt' ? <Check /> : <Copy />}
                                        {justCopied === 'prompt' ? 'Copied' : 'Copy prompt for your agent'}
                                    </Button>
                                    <CopyApiKeyButton size="md" disabled={!apiKey} copied={justCopied === 'key'} onClick={() => void copyApiKey()} />
                                </div>
                                {!apiKey && (
                                    <p className="flex items-center gap-2 type-text-regular-xs text-text-secondary">
                                        <Lock className="size-3.5 text-icon-secondary" aria-hidden />
                                        {!canReadSecret
                                            ? 'Only admins can view secret keys, so the prompt leaves the key out. Your agent will ask for it.'
                                            : apiKeysError || environmentError
                                              ? 'Could not load your API key, so the prompt leaves it out. Your agent will ask for it.'
                                              : 'No full-access API key in this environment, so the prompt leaves the key out. Your agent will ask for it.'}
                                    </p>
                                )}
                                {showPlaygroundLink && (
                                    <p className="type-text-regular-xs text-text-muted">
                                        Not ready? Try it first in the{' '}
                                        <ButtonLink
                                            to={`/${env}/playground`}
                                            variant="link-accent"
                                            size="xs"
                                            onClick={() => track('onboarding:playground_link_click')}
                                        >
                                            Agent Playground
                                            <ArrowRight />
                                        </ButtonLink>
                                    </p>
                                )}
                            </StepCard>
                        )}

                        <TryIntegrationsStep
                            progress={progress}
                            env={env}
                            justCopied={justCopied}
                            onCopy={(prompt, provider) => void copyTryPrompt(prompt, provider)}
                        />
                    </StepList>
                )}

                {progress?.install === 'done' && (
                    <div className="-mt-4 flex justify-end">
                        <Button variant="ghost" size="sm" onClick={restart}>
                            <RotateCcw />
                            Restart getting started
                        </Button>
                    </div>
                )}

                {progress?.install === 'done' && <GoFurther env={env} />}
            </div>
            {DialogComponent}
        </DashboardLayout>
    );
};

const CopyApiKeyButton: React.FC<{ size: 'sm' | 'md'; disabled: boolean; copied: boolean; onClick: () => void }> = ({ size, disabled, copied, onClick }) => {
    return (
        <Button variant="ghost" size={size} disabled={disabled} onClick={onClick}>
            {copied ? <Check /> : <KeyRound />}
            {copied ? 'Copied' : 'Copy API key'}
        </Button>
    );
};

const TryIntegrationsStep: React.FC<{
    progress: AgentProgress | null;
    env: string;
    justCopied: Copied | null;
    onCopy: (prompt: string, provider: string) => void;
}> = ({ progress, env, justCopied, onCopy }) => {
    const title = 'Try integrations with your own agent';

    if (!progress || progress.tryIntegrations === 'upcoming') {
        return <StepCard state="upcoming" icon={Sparkles} title={title} description="Once your agent has installed Nango, ask it to use an integration." />;
    }

    const isDone = progress.tryIntegrations === 'done';
    const items = [
        {
            done: progress.hasConnection,
            label: progress.hasConnection ? 'Account connected' : 'Connect an account',
            trailing: progress.hasConnection ? (
                <ButtonLink to={`/${env}/connections`} variant="link-neutral" size="xs">
                    View connection
                    <ArrowRight />
                </ButtonLink>
            ) : null
        },
        { done: progress.hasToolCall, label: progress.hasToolCall ? 'First tool call ran' : 'Run your first tool call', trailing: null }
    ];
    const firstPending = items.findIndex((item) => !item.done);

    return (
        <StepCard
            state={isDone ? 'done' : 'current'}
            icon={isDone ? PartyPopper : Sparkles}
            title={title}
            description={
                isDone ? (
                    <>
                        <span className="type-text-medium-sm text-text-strong">Congrats, Nango is live in your agent.</span> It connected an account and ran its
                        first tool call.
                    </>
                ) : (
                    'Once the install has finished, ask your agent one of these. It will ask you to connect the account first.'
                )
            }
        >
            {!isDone && (
                <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                    {TRY_PROMPTS.map(({ prompt, provider, name }) => (
                        <PromptCard
                            key={provider}
                            prompt={prompt}
                            provider={provider}
                            name={name}
                            action="copy"
                            copied={justCopied === `try:${provider}`}
                            onClick={() => onCopy(prompt, provider)}
                        />
                    ))}
                </div>
            )}
            <ul aria-live="polite" className="flex flex-col gap-2.5">
                {items.map((item, index) => (
                    <ChecklistRow
                        key={index}
                        state={item.done ? 'done' : index === firstPending ? 'current' : 'pending'}
                        label={item.label}
                        trailing={item.trailing}
                    />
                ))}
            </ul>
        </StepCard>
    );
};

type GoFurtherDestination = AnalyticsEventProperties<'onboarding:go_further_link_click'>['destination'];

const GoFurther: React.FC<{ env: string }> = ({ env }) => {
    const links: { destination: GoFurtherDestination; icon: LucideIcon; title: string; description: string; to: string; external?: boolean }[] = [
        {
            destination: 'integrations',
            icon: Blocks,
            title: 'Add more integrations',
            description: 'Give your agent access to 1,000+ APIs.',
            to: `/${env}/integrations/create`
        },
        { destination: 'logs', icon: List, title: 'View logs', description: 'Every tool call and API request your agent makes.', to: `/${env}/logs` },
        {
            destination: 'catalog',
            icon: Wrench,
            title: 'Explore the catalog',
            description: 'Pre-built tools your agent can use right away.',
            to: 'https://nango.dev/api-integrations',
            external: true
        },
        {
            destination: 'syncs_docs',
            icon: RefreshCw,
            title: 'Sync data into your app',
            description: 'Keep provider data fresh with scheduled syncs.',
            to: 'https://nango.dev/docs/guides/functions/syncs/sync-functions',
            external: true
        }
    ];

    return (
        <section
            aria-labelledby="go-further-title"
            className="flex flex-col gap-3 pt-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500"
        >
            <h2 id="go-further-title" className="type-text-medium-md text-text-strong">
                Go further
            </h2>
            <div className="grid grid-cols-2 gap-2.5 max-sm:grid-cols-1">
                {links.map(({ destination, icon: Icon, title, description, to, external }) => {
                    const className =
                        'group flex items-start gap-3 rounded-ds-md border-ds-hairline border-border-default bg-surface-panel p-3.5 transition-colors hover:border-border-strong hover:bg-surface-panel-muted';
                    const content = (
                        <>
                            <Icon className="mt-px size-4 shrink-0 text-icon-secondary" aria-hidden />
                            <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="type-text-medium-sm text-text-strong">{title}</span>
                                <span className="type-text-regular-xs text-text-muted">{description}</span>
                            </span>
                            {external ? (
                                <ArrowUpRight
                                    className="ml-auto size-3.5 shrink-0 text-icon-muted transition-[color,transform] group-hover:translate-x-px group-hover:-translate-y-px group-hover:text-icon-default"
                                    aria-hidden
                                />
                            ) : (
                                <ArrowRight
                                    className="ml-auto size-3.5 shrink-0 text-icon-muted transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-icon-default"
                                    aria-hidden
                                />
                            )}
                        </>
                    );
                    const onClick = () => track('onboarding:go_further_link_click', { destination });

                    return external ? (
                        <a key={destination} href={to} target="_blank" rel="noreferrer" className={className} onClick={onClick}>
                            {content}
                        </a>
                    ) : (
                        <Link key={destination} to={to} className={className} onClick={onClick}>
                            {content}
                        </Link>
                    );
                })}
            </div>
        </section>
    );
};
