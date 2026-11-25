import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { IntegrationSetupNotice } from '@/pages/AgentPlayground/components/IntegrationSetupNotice';
import { Markdown } from '@/pages/AgentPlayground/components/Markdown';
import { SessionNotice } from '@/pages/AgentPlayground/components/SessionNotice';
import { ToolCallCard } from '@/pages/AgentPlayground/components/ToolCallCard';
import { ToolCallGroup } from '@/pages/AgentPlayground/components/ToolCallGroup';
import { INTERRUPTED_CALL } from '@/store/agentPlaygroundChat';

import type { IntegrationLabels } from '@/pages/AgentPlayground/toolDisplay';
import type { ReplyEntry } from '@/pages/AgentPlayground/toolGroups';
import type { AgentPlaygroundIntegrationSetup, AgentPlaygroundSessionCreated, PostAgentSessionsBody } from '@nangohq/types';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { DynamicToolUIPart } from 'ai';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const meta: Meta = {
    title: 'App Components/Agent Playground/Chat rows',
    parameters: { layout: 'padded' },
    decorators: [
        (Story) => (
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <div className="mx-auto flex max-w-[768px] flex-col gap-5">
                        <Story />
                    </div>
                </MemoryRouter>
            </QueryClientProvider>
        )
    ]
};
export default meta;
type Story = StoryObj<typeof meta>;

const ENV = 'dev';
const NO_INTEGRATIONS = new Map<string, string>();
const LABELS: IntegrationLabels = new Map([
    ['linear', { provider: 'linear', name: 'Linear', integrationName: 'Linear' }],
    ['pg-github', { provider: 'github', name: 'GitHub', integrationName: 'GitHub' }],
    ['hubspot', { provider: 'hubspot', name: 'HubSpot', integrationName: 'HubSpot' }]
]);
const noop = () => undefined;

const SESSION_REQUEST = {
    toolset: '*',
    meta_tools: { nango_create_connection: { enabled: true, tags: { end_user_id: '1' } } }
} as unknown as PostAgentSessionsBody;

function setup(
    provider: string,
    outcome: AgentPlaygroundIntegrationSetup['outcome'],
    extra: Partial<AgentPlaygroundIntegrationSetup> = {}
): AgentPlaygroundIntegrationSetup {
    return { provider, outcome, ...extra };
}

function call(id: string, toolName: string, input: unknown, extra: Partial<DynamicToolUIPart> = {}): DynamicToolUIPart {
    return { type: 'dynamic-tool', toolName, toolCallId: id, state: 'output-available', input, output: {}, ...extra } as DynamicToolUIPart;
}

const SEARCH = call('search', 'nango_tool_search', { queries: ['list issues assigned to me'] }, { output: { results: [{ matches: [{}, {}] }] } });
const LIST_ISSUES = call('list', 'nango_execute', { tool: 'linear__list_issues', input: { assignee: 'me' } }, { output: { issues: [{ id: 'NAN-1' }] } });
const RUNNING = call('running', 'nango_execute', { tool: 'linear__get_viewer', input: {} }, { state: 'input-available', output: undefined });
const FAILED = call(
    'failed',
    'nango_execute',
    { tool: 'linear__list_issues', input: {} },
    { state: 'output-error', output: undefined, errorText: 'Unexpected response' }
);
const INTERRUPTED = call(
    'interrupted',
    'nango_execute',
    { tool: 'linear__create_issue', input: {} },
    { state: 'output-error', output: undefined, errorText: INTERRUPTED_CALL }
);
const APPROVAL = call('approval', 'nango_execute', { tool: 'linear__create_issue', input: { title: 'Try the playground' } }, {
    state: 'approval-requested',
    output: undefined,
    approval: { id: 'approval', isAutomatic: false }
} as Partial<DynamicToolUIPart>);
const CONNECT = call(
    'connect',
    'nango_create_connection',
    { integration: 'hubspot' },
    {
        output: {
            connect_url: 'https://connect.nango.dev/?session_token=story',
            // setTimeout fires at once past ~24.8 days, so a far-future expiry renders as expired.
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
            integration: 'hubspot',
            provider: 'hubspot'
        }
    }
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="-mb-3 font-mono text-body-small-regular text-text-muted">{children}</span>
);

const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h3 className="mt-6 border-b border-border-muted pb-1 text-body-medium-medium text-text-strong first:mt-0">{children}</h3>
);

const Card: React.FC<{ part: DynamicToolUIPart; chatActive?: boolean }> = ({ part, chatActive = false }) => (
    <ToolCallCard
        part={part}
        labels={LABELS}
        chatActive={chatActive}
        approvalSending={false}
        connectedIntegrations={new Set()}
        onConnected={noop}
        onRequestNewLink={noop}
        onApprove={noop}
        onRetryInterrupted={noop}
        onTryAgain={noop}
    />
);

const renderEntry = (entry: ReplyEntry) =>
    entry.kind === 'text' ? <Markdown key={entry.key}>{entry.part.text}</Markdown> : <Card key={entry.key} part={entry.part} />;

const GROUP_ENTRIES: ReplyEntry[] = [
    { kind: 'tool', key: SEARCH.toolCallId, part: SEARCH },
    { kind: 'tool', key: LIST_ISSUES.toolCallId, part: LIST_ISSUES }
];

const Session: React.FC<{ reason?: AgentPlaygroundSessionCreated['reason']; replaced?: boolean }> = ({ reason, replaced = false }) => (
    <SessionNotice created={{ request: SESSION_REQUEST, ...(reason ? { reason } : {}) }} replaced={replaced} />
);

const Setup: React.FC<{ value: AgentPlaygroundIntegrationSetup; added?: ReadonlyMap<string, string> }> = ({ value, added = NO_INTEGRATIONS }) => (
    <IntegrationSetupNotice env={ENV} setup={value} labels={LABELS} addedIntegrations={added} onTryAgain={noop} />
);

export const AllStates: Story = {
    name: 'All states',
    render: () => (
        <>
            <Heading>Playground: integration set-up</Heading>
            <Label>created, with Nango&apos;s developer app</Label>
            <Setup value={setup('github', 'created', { integrationId: 'pg-github', usesSharedCredentials: true })} />
            <Label>created, with no credentials needed</Label>
            <Setup value={setup('sendgrid', 'created', { integrationId: 'sendgrid', displayName: 'SendGrid' })} />
            <Label>existing</Label>
            <Setup value={setup('linear', 'existing', { integrationId: 'linear' })} />
            <Label>added by you after the card asked</Label>
            <Setup value={setup('hubspot', 'needs_confirmation')} added={new Map([['hubspot', 'hubspot']])} />
            <Label>needs_confirmation</Label>
            <Setup value={setup('hubspot', 'needs_confirmation', { displayName: 'HubSpot' })} />
            <Label>needs_developer_app</Label>
            <Setup value={setup('slack', 'needs_developer_app')} />
            <Label>needs_setup</Label>
            <Setup value={setup('salesforce', 'needs_setup', { displayName: 'Salesforce' })} />
            <Label>not_created</Label>
            <Setup value={setup('zendesk', 'not_created', { displayName: 'Zendesk' })} />
            <Label>missing_credentials</Label>
            <Setup value={setup('google-calendar', 'missing_credentials', { integrationId: 'google-calendar' })} />

            <Heading>Session</Heading>
            <Label>first session</Label>
            <Session />
            <Label>integrations_changed</Label>
            <Session reason="integrations_changed" replaced />
            <Label>connections_changed</Label>
            <Session reason="connections_changed" replaced />
            <Label>expired</Label>
            <Session reason="expired" replaced />

            <Heading>Session tool calls</Heading>
            <Label>search</Label>
            <Card part={SEARCH} />
            <Label>integration tool</Label>
            <Card part={LIST_ISSUES} />
            <Label>running</Label>
            <Card part={RUNNING} chatActive />
            <Label>failed</Label>
            <Card part={FAILED} />
            <Label>interrupted</Label>
            <Card part={INTERRUPTED} />
            <Label>waiting for approval</Label>
            <Card part={APPROVAL} />
            <Label>connect</Label>
            <Card part={CONNECT} />
            <Label>group</Label>
            <ToolCallGroup calls={[SEARCH, LIST_ISSUES]} entries={GROUP_ENTRIES} labels={LABELS} chatActive={false} renderEntry={renderEntry} />
        </>
    )
};

export const MidChatSetUp: Story = {
    name: 'Reply that adds an integration',
    render: () => (
        <>
            <Setup value={setup('sendgrid', 'created', { integrationId: 'sendgrid', displayName: 'SendGrid' })} />
            <Markdown>SendGrid is available now; I&apos;ll look for its email-sending action.</Markdown>
            <Session reason="integrations_changed" replaced />
            <Card part={SEARCH} />
            <Card part={CONNECT} />
            <Markdown>Please connect HubSpot using the Connect button, and I&apos;ll carry on once it&apos;s connected.</Markdown>
        </>
    )
};

export const PlaygroundActions: Story = {
    name: 'Playground actions in a reply',
    render: () => (
        <>
            <Heading>Adds an integration mid-chat</Heading>
            <Setup value={setup('sendgrid', 'created', { integrationId: 'sendgrid', displayName: 'SendGrid' })} />
            <Session reason="integrations_changed" replaced />
            <Card part={SEARCH} />

            <Heading>Uses an existing integration</Heading>
            <Setup value={setup('linear', 'existing', { integrationId: 'linear' })} />
            <Session />
            <ToolCallGroup calls={[SEARCH, LIST_ISSUES]} entries={GROUP_ENTRIES} labels={LABELS} chatActive={false} renderEntry={renderEntry} />

            <Heading>Needs your own developer app</Heading>
            <Session />
            <Setup value={setup('slack', 'needs_developer_app')} />

            <Heading>Production, before the one-click add</Heading>
            <Session />
            <Setup value={setup('sendgrid', 'needs_confirmation', { displayName: 'SendGrid' })} />

            <Heading>Production, after the one-click add</Heading>
            <Session />
            <Setup value={setup('sendgrid', 'needs_confirmation', { displayName: 'SendGrid' })} added={new Map([['sendgrid', 'sendgrid']])} />
            <Session reason="integrations_changed" replaced />
            <Card part={SEARCH} />
            <Card part={CONNECT} />
        </>
    )
};
