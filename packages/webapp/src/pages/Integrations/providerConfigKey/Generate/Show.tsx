import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';

import { ChatComponent } from './chatComponents/ChatComponent';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { Button } from '@/components-v2/ui/button';
import { InputGroup, InputGroupTextarea } from '@/components-v2/ui/input-group';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { useChat } from '@/hooks/useChat';
import { useGetIntegration } from '@/hooks/useIntegration';
import DashboardLayout from '@/layout/DashboardLayout';
import PageNotFound from '@/pages/PageNotFound';
import { useStore } from '@/store';

import type { AgentEvent } from '@/hooks/useChat';

const MOCK_EVENTS: AgentEvent[] = [
    { eventType: 'agent.lifecycle', type: 'progress', message: 'Spinning up workspace...' },
    { eventType: 'agent.session.started', type: 'session', session_id: 'sess_abc123' },
    { eventType: 'agent.delta', type: 'progress', message: 'Reading existing syncs...' },
    { eventType: 'agent.tool.updated', type: 'debug', message: '[tool] read_file: completed' },
    { eventType: 'agent.message.updated', type: 'debug', message: '[message] assistant msg_xyz (2 parts)' },
    { eventType: 'agent.delta', type: 'progress', message: 'Writing fetch-contacts.ts...' },
    { eventType: 'agent.tool.updated', type: 'debug', message: '[tool] write_file: completed' },
    {
        eventType: 'agent.question',
        type: 'question',
        question_id: 'q_1',
        message: 'Should I create a new file or overwrite the existing fetch-contacts.ts?',
        options: ['Create new file', 'Overwrite existing', 'Cancel']
    },
    {
        eventType: 'agent.permission.requested',
        type: 'question',
        question_id: 'q_2',
        permission: 'Write files',
        patterns: ['/home/user/nango-integrations/hubspot/fetch-contacts.ts']
    },
    { eventType: 'agent.session.idle', type: 'done', message: 'Agent finished its current run.' },
    { eventType: 'agent.error', type: 'error', message: 'Workspace failed to compile: unexpected token at line 12' }
];

export const GenerateFunction: React.FC = () => {
    const { providerConfigKey } = useParams();
    const env = useStore((state) => state.env);
    const { data: integrationResponse, isLoading } = useGetIntegration(env, providerConfigKey!);
    const integrationData = integrationResponse?.data;

    const [prompt, setPrompt] = useState('');
    const { status, startSession, sendAnswer } = useChat({
        env,
        integrationId: providerConfigKey!
    });

    const isSessionActive = status === 'starting' || status === 'streaming' || status === 'awaiting_answer';

    // TODO: replace MOCK_EVENTS with `events` from useAiChat once chat rendering is designed
    const displayEvents = MOCK_EVENTS;

    if (isLoading) {
        return (
            <DashboardLayout>
                <Helmet>
                    <title>Nango</title>
                </Helmet>
                <div className="flex flex-col h-full">
                    <div className="inline-flex items-center gap-2.5 p-6">
                        <Skeleton className="bg-bg-subtle size-7" />
                        <Skeleton className="bg-bg-subtle w-36 h-5" />
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    if (!integrationData) {
        return <PageNotFound />;
    }

    return (
        <DashboardLayout className="h-full">
            <Helmet>
                <title>Generate function - Nango</title>
            </Helmet>
            <div className="flex flex-col h-full gap-6">
                <div className="inline-flex items-center gap-2">
                    <IntegrationLogo provider={integrationData.integration.provider} className="size-15" />
                    <span className="text-text-primary text-body-large-semi">
                        {integrationData.integration.display_name ?? integrationData.template.display_name}
                    </span>
                </div>

                <div className="flex flex-col flex-1 h-full max-h-full overflow-y-scroll">
                    {/* Chat messages */}
                    <div className="flex-1 flex flex-col gap-4 overflow-y-auto">
                        {displayEvents.map((event, i) => (
                            <ChatComponent key={i} event={event} onAnswer={(response) => void sendAnswer(response)} />
                        ))}
                    </div>

                    {/* Prompt input */}
                    <div className="flex justify-center">
                        <div className="w-full flex flex-col gap-3 max-w-2xl">
                            <InputGroup className="min-h-12">
                                <InputGroupTextarea
                                    placeholder="Describe the function you want to generate..."
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    rows={3}
                                />
                            </InputGroup>
                            <div className="flex justify-end">
                                <Button
                                    variant="primary"
                                    disabled={!prompt.trim() || isSessionActive}
                                    onClick={() => {
                                        void startSession(prompt);
                                        setPrompt('');
                                    }}
                                >
                                    <Sparkles /> Generate
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
};
