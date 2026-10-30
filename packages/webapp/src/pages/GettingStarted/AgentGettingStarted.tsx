import { ArrowRight, Blocks, Check, CheckCheck, CircleCheck, CircleDashed, Copy, KeySquare, LibraryBig, List, Plug, RotateCcw } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';

import { Button } from '@nangohq/design-system';

import { Spinner } from '../../components/ui/Spinner';
import { Switch } from '../../components/ui/Switch';
import { useApiKeys } from '../../hooks/useApiKeys';
import { useConnectionsCount } from '../../hooks/useConnections';
import { useEnvironment } from '../../hooks/useEnvironment';
import { usePermissions } from '../../hooks/usePermissions';
import { useToast } from '../../hooks/useToast';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { cn } from '../../utils/utils';

// Prototype of the agent-first getting started: https://nangohq.slack.com/archives/C06MTTJHHL1/p1793187394615059
// Progress is local state only, nothing is persisted or tracked yet.

const QUICKSTART_URL = 'https://nango.dev/docs/getting-started/quickstart.md';

function getPrompt(secretKey: string | null) {
    return [`Add Nango to my agent by following the steps here: ${QUICKSTART_URL}`, ...(secretKey ? [`Environment API Key: ${secretKey}`] : [])].join('\n');
}

export const AgentGettingStarted: React.FC = () => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { can } = usePermissions();
    const canReadSecret = can('environment:settings:read_secret');

    const { data: envData } = useEnvironment(env);
    const managedSecretKey = envData?.environmentAndAccount?.managed_secret_key ?? null;
    const { data: apiKeysData } = useApiKeys(env);
    const defaultApiKey = apiKeysData?.data?.find((key) => key.display_name === 'Default - Full access') ?? apiKeysData?.data?.[0];
    const secretKey = canReadSecret ? (managedSecretKey ?? defaultApiKey?.secret ?? null) : null;

    // Demo controls in the header, to show each variant to the team.
    const [showPlaygroundOption, setShowPlaygroundOption] = useState(true);
    const [simulateDone, setSimulateDone] = useState(false);

    const [promptCopied, setPromptCopied] = useState(false);
    // Short-lived "Copied" feedback; the buttons stay usable so the prompt can be copied again.
    const [justCopied, setJustCopied] = useState<'prompt' | 'key' | null>(null);
    useEffect(() => {
        if (!justCopied) {
            return;
        }
        const timer = setTimeout(() => setJustCopied(null), 1500);
        return () => clearTimeout(timer);
    }, [justCopied]);

    // Polls, so the checklist updates while the user tries it out.
    const { data: connectionsCount } = useConnectionsCount(env);
    const progress = [
        { id: 'connection', label: 'Connect an account', done: simulateDone || (connectionsCount?.data.total ?? 0) > 0 },
        // Hard-coded for the prototype: would come from the first action / MCP tool call operation in logs.
        { id: 'tool-call', label: 'Run your first tool call', done: simulateDone }
    ];
    const installDone = promptCopied || simulateDone;
    const tryDone = progress.every((item) => item.done);

    const copy = async (text: string, what: 'prompt' | 'key') => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            toast({ title: 'Could not copy, your browser blocked clipboard access', variant: 'error' });
        }
        // Advance anyway so the flow can be demoed where the clipboard is blocked.
        setJustCopied(what);
        if (what === 'prompt') {
            setPromptCopied(true);
        }
    };

    return (
        <DashboardLayout
            title="Getting started"
            titleActions={
                <div className="flex flex-row items-center gap-4">
                    <label className="flex flex-row items-center gap-2 text-sm text-text-secondary cursor-pointer">
                        <Switch checked={showPlaygroundOption} onCheckedChange={setShowPlaygroundOption} />
                        Playground option
                    </label>
                    <Button
                        variant="outline"
                        size="md"
                        onClick={() => {
                            if (simulateDone) {
                                setPromptCopied(false);
                            }
                            setSimulateDone(!simulateDone);
                        }}
                    >
                        {simulateDone ? <RotateCcw /> : <CheckCheck />}
                        {simulateDone ? 'Reset progress' : 'Mark last step done'}
                    </Button>
                </div>
            }
        >
            <Helmet>
                <title>Getting Started - Nango</title>
            </Helmet>
            <div className="w-full max-w-3xl flex flex-col gap-10">
                <div className="flex flex-col gap-3">
                    <Step index={1} state={installDone ? 'done' : 'active'}>
                        <div className="flex flex-col gap-1.5">
                            <h2 className="text-text-strong text-lg font-semibold">Install Nango</h2>
                            <p className="text-text-muted text-sm">Add integrations with 1,000+ APIs to your agent in minutes.</p>
                        </div>
                        <div className="flex flex-row items-center gap-3">
                            <Button variant={installDone ? 'outline' : 'primary'} size="lg" onClick={() => void copy(getPrompt(secretKey), 'prompt')}>
                                {justCopied === 'prompt' ? <Check /> : <Copy />}
                                {justCopied === 'prompt' ? 'Copied' : installDone ? 'Copy prompt again' : 'Copy prompt for your agent'}
                            </Button>
                            <Button variant="ghost" size="lg" disabled={!secretKey} onClick={() => secretKey && void copy(secretKey, 'key')}>
                                {justCopied === 'key' ? <Check /> : <KeySquare />}
                                {justCopied === 'key' ? 'Copied' : 'Copy API key'}
                            </Button>
                        </div>
                        {showPlaygroundOption && !installDone && (
                            <p className="text-text-muted text-sm">
                                Not ready? Try it first in the{' '}
                                <Link to={`/${env}/playground`} className="text-text-secondary underline hover:text-text-strong">
                                    agent playground
                                </Link>
                                .
                            </p>
                        )}
                    </Step>

                    {/* Step 2 is always listed so it's clear there are only two steps; before step 1 is done it shows its title only, muted. */}
                    <Step index={2} state={!installDone ? 'upcoming' : tryDone ? 'done' : 'active'}>
                        <div className="flex flex-col gap-1.5">
                            <h3 className={cn(installDone ? 'text-base font-semibold text-text-strong' : 'text-sm font-medium text-text-muted')}>
                                Try integrations with your own agent
                            </h3>
                            {installDone && (
                                <p className="text-text-muted text-sm">
                                    Once the install has finished, prompt your agent: &quot;Summarize my latest emails&quot; or &quot;Summarize my open Linear
                                    issues&quot;
                                </p>
                            )}
                        </div>
                        {installDone && (
                            <ul className="flex flex-col gap-3">
                                {progress.map((item) => {
                                    const isCurrent = !item.done && progress.find((other) => !other.done)?.id === item.id;
                                    return (
                                        <li
                                            key={item.id}
                                            className={cn(
                                                'flex flex-row items-center gap-2.5 text-sm',
                                                item.done ? 'text-text-strong' : isCurrent ? 'text-text-secondary' : 'text-text-muted'
                                            )}
                                        >
                                            {item.done ? (
                                                <CircleCheck className="size-4 text-status-success-icon" />
                                            ) : isCurrent ? (
                                                <Spinner className="text-icon-default" />
                                            ) : (
                                                <CircleDashed className="size-4 text-icon-muted" />
                                            )}
                                            {item.label}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {tryDone && <p className="text-text-strong text-base font-semibold">🎉 Congrats!</p>}
                    </Step>
                </div>

                {tryDone && (
                    <div className="flex flex-col gap-2.5">
                        <h4 className="text-s leading-5 text-text-secondary uppercase">Next steps</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <NextStepCard
                                to={`/${env}/integrations`}
                                icon={Blocks}
                                title="Add more integrations"
                                description="Give your agent access to more APIs."
                            />
                            <NextStepCard
                                to={`/${env}/logs`}
                                icon={List}
                                title="View logs"
                                description="See every tool call and API request your agent makes."
                            />
                            <NextStepCard
                                to={`/${env}/connections`}
                                icon={Plug}
                                title="View connections"
                                description="Manage the accounts connected to your integrations."
                            />
                            {/* No catalog page yet, so this one doesn't link anywhere. */}
                            <NextStepCard icon={LibraryBig} title="Explore the catalog" description="Browse pre-built tools your agent can use right away." />
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
};

// One card per step. An upcoming step is only a dashed outline so the active one gets the attention;
// the number is outlined while active and becomes a check when done.
const Step = ({ index, state, children }: { index: number; state: 'upcoming' | 'active' | 'done'; children: React.ReactNode }) => {
    return (
        <div
            className={cn(
                'flex flex-row gap-4 rounded',
                state === 'upcoming' ? 'items-center px-6 py-4 border border-dashed border-border-default' : 'p-6 bg-surface-panel'
            )}
        >
            <div
                className={cn(
                    'shrink-0 size-6 rounded-full flex items-center justify-center text-xs font-semibold',
                    state !== 'upcoming' && 'mt-0.5',
                    state === 'done' && 'bg-interactive-selected-fill text-text-on-accent',
                    state === 'active' && 'border border-border-selected text-text-brand',
                    state === 'upcoming' && 'border border-border-muted text-text-muted'
                )}
            >
                {state === 'done' ? <Check className="size-3.5" /> : index}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-5">{children}</div>
        </div>
    );
};

// Same look as the doc cards on the previous getting started page, for in-app destinations.
const NextStepCard = ({ to, icon, title, description }: { to?: string; icon: React.ElementType; title: string; description: string }) => {
    const IconComponent = icon;
    const className = 'group inline-flex gap-2 px-4 py-6 border border-border-muted rounded hover:bg-surface-page transition-all';
    const content = (
        <>
            <IconComponent className="shrink-0 size-4.5 text-icon-default" />
            <div className="flex flex-col gap-1">
                <h5 className="text-sm font-medium leading-5 text-text-strong">{title}</h5>
                <p className="text-sm leading-5 text-text-muted group-hover:text-text-secondary transition-all">{description}</p>
            </div>
            <ArrowRight className="shrink-0 size-3.5 text-icon-muted ml-auto group-hover:text-icon-default transition-all" />
        </>
    );

    // Looks the same without a destination, so a card can stand in for a page that doesn't exist yet.
    if (!to) {
        return <div className={cn(className, 'cursor-pointer')}>{content}</div>;
    }
    return (
        <Link to={to} className={className}>
            {content}
        </Link>
    );
};
