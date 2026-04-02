import { ArrowUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';
import { useKeyPress } from 'react-use';

import { ChatComponent } from './chatComponents/ChatComponent';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components-v2/ui/input-group';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { useChat } from '@/hooks/useChat';
import { useGetIntegration } from '@/hooks/useIntegration';
import DashboardLayout from '@/layout/DashboardLayout';
import PageNotFound from '@/pages/PageNotFound';
import { useStore } from '@/store';
import { cn } from '@/utils/utils';

export const GenerateFunction: React.FC = () => {
    const { providerConfigKey } = useParams();
    const env = useStore((state) => state.env);
    const { data: integrationResponse, isLoading } = useGetIntegration(env, providerConfigKey!);
    const integrationData = integrationResponse?.data;

    const [prompt, setPrompt] = useState('');
    const { status, startSession, sendAnswer, mockQuestion, events } = useChat({
        env,
        integrationId: providerConfigKey!
    });

    const isLocked = status !== 'idle' && status !== 'awaiting_answer';
    const isAwaitingAnswer = status === 'awaiting_answer';
    const inputVisible = status === 'idle' || status === 'awaiting_answer';

    const [positionedAtBottom, setPositionedAtBottom] = useState(false);
    useEffect(() => {
        if (inputVisible) return;
        const t = setTimeout(() => setPositionedAtBottom(true), 300);
        return () => clearTimeout(t);
    }, [inputVisible]);

    const handleSubmit = () => {
        if (!prompt.trim() || isLocked) return;
        if (isAwaitingAnswer) {
            void sendAnswer(prompt);
        } else {
            void startSession(prompt);
        }
        setPrompt('');
    };

    const [isEqualPressed] = useKeyPress('=');
    useEffect(() => {
        if (!isEqualPressed) return;
        mockQuestion();
    }, [isEqualPressed, mockQuestion]);

    const displayEvents = events;

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
        <DashboardLayout fullWidth className="relative h-full p-0">
            <Helmet>
                <title>Generate function - Nango</title>
            </Helmet>

            {/* Gradient overlays - hidden on initial idle state */}
            {status !== 'idle' && (
                <>
                    <div className="pointer-events-none absolute top-0 left-0 right-0 h-16 z-10 bg-gradient-to-b from-black to-transparent" />
                    <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-36 z-10 bg-gradient-to-t from-black to-transparent" />
                </>
            )}

            {/** Chat container - takes full size so scrollbar sits at the far right */}
            <div className="w-full h-full pb-36 pt-12 flex items-start justify-center overflow-y-auto">
                {/* Chat messages */}
                <div className="flex-1 w-full max-w-2xl flex flex-col gap-4">
                    {displayEvents.map((event, i) => (
                        <ChatComponent key={i} event={event} isLast={i === displayEvents.length - 1} onAnswer={(response) => void sendAnswer(response)} />
                    ))}
                </div>
            </div>

            {/* Prompt input — centered on first message, pinned to bottom after */}
            <div
                className={cn(
                    'absolute left-1/2 -translate-x-1/2 w-full flex justify-center z-20 animate-in fade-in transition-opacity duration-300',
                    positionedAtBottom ? 'bottom-4' : 'bottom-1/2 translate-y-1/2',
                    inputVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
            >
                <div className="w-full flex flex-col gap-3 max-w-2xl">
                    <InputGroup className="min-h-12">
                        <InputGroupTextarea
                            placeholder={isAwaitingAnswer ? 'Type your answer...' : 'Describe the function you want to generate...'}
                            value={prompt}
                            disabled={isLocked}
                            onChange={(e) => setPrompt(e.target.value)}
                            rows={4}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit();
                                }
                            }}
                        />
                        <InputGroupAddon align="inline-end" className="self-end">
                            <InputGroupButton size="icon-sm" variant="primary" disabled={!prompt.trim() || isLocked} onClick={handleSubmit}>
                                <ArrowUp />
                            </InputGroupButton>
                        </InputGroupAddon>
                    </InputGroup>
                </div>
            </div>
        </DashboardLayout>
    );
};
