import { ArrowDown, ArrowUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';
import { useKeyPress } from 'react-use';

import { ChatComponent } from './chatComponents/ChatComponent';
import { Button } from '@/components-v2/ui/button';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components-v2/ui/input-group';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { useChat } from '@/hooks/useChat';
import { useGetIntegration } from '@/hooks/useIntegration';
import DashboardLayout from '@/layout/DashboardLayout';
import PageNotFound from '@/pages/PageNotFound';
import { useStore } from '@/store';
import { cn } from '@/utils/utils';

const STICK_THRESHOLD = 40;

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

    // Scroll-to-bottom sticky logic
    const scrollRef = useRef<HTMLDivElement>(null);
    const isSticky = useRef(true);
    const [showScrollButton, setShowScrollButton] = useState(false);

    const scrollToBottom = (smooth = true) => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
    };

    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const atBottom = distanceFromBottom <= STICK_THRESHOLD;
        isSticky.current = atBottom;
        setShowScrollButton(!atBottom);
    };

    // Auto-scroll when new events arrive if sticky
    useEffect(() => {
        if (isSticky.current) {
            scrollToBottom(false);
        }
    }, [events]);

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

            {/** Chat container - takes full size so scrollbar sits at the far right */}
            <div ref={scrollRef} onScroll={handleScroll} className="w-full h-full overflow-y-auto">
                {/* Top gradient - sticky inside scroll container so scrollbar renders above it */}
                {status !== 'idle' && (
                    <div className="sticky top-0 z-10 h-0 w-full pointer-events-none">
                        <div className="h-16 bg-gradient-to-b from-black to-transparent" />
                    </div>
                )}

                {/* Chat messages */}
                <div className="pt-12 pb-36 w-full flex items-start justify-center">
                    <div className="flex-1 w-full max-w-2xl flex flex-col gap-4">
                        {displayEvents.map((event, i) => (
                            <ChatComponent key={i} event={event} isLast={i === displayEvents.length - 1} onAnswer={(response) => void sendAnswer(response)} />
                        ))}
                    </div>
                </div>

                {/* Bottom gradient - sticky inside scroll container so scrollbar renders above it */}
                {status !== 'idle' && (
                    <div className="sticky bottom-0 z-10 h-0 w-full pointer-events-none">
                        <div className="h-36 -mt-36 bg-gradient-to-t from-black to-transparent" />
                    </div>
                )}
            </div>

            {/* Scroll-to-bottom button */}
            <div
                className={cn(
                    'absolute left-1/2 -translate-x-1/2 z-30 transition-all duration-200',
                    positionedAtBottom ? 'bottom-24' : 'bottom-16',
                    showScrollButton && status !== 'idle' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                )}
            >
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                        scrollToBottom();
                        isSticky.current = true;
                        setShowScrollButton(false);
                    }}
                >
                    <ArrowDown /> scroll to bottom
                </Button>
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
