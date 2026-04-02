import { DeltaChatComponent } from './DeltaChatComponent';
import { ErrorChatComponent } from './ErrorChatComponent';
import { LifecycleChatComponent } from './LifecycleChatComponent';
import { MessageUpdatedChatComponent } from './MessageUpdatedChatComponent';
import { PermissionRequestedChatComponent } from './PermissionRequestedChatComponent';
import { QuestionChatComponent } from './QuestionChatComponent';
import { SessionIdleChatComponent } from './SessionIdleChatComponent';
import { SessionStartedChatComponent } from './SessionStartedChatComponent';
import { ToolUpdatedChatComponent } from './ToolUpdatedChatComponent';

import type { AgentEvent } from '@/hooks/useChat';

interface ChatComponentProps {
    event: AgentEvent;
    onAnswer: (response: string) => void;
}

export const ChatComponent: React.FC<ChatComponentProps> = ({ event, onAnswer }) => {
    switch (event.eventType) {
        case 'agent.lifecycle':
            return <LifecycleChatComponent message={event.message} />;
        case 'agent.session.started':
            return <SessionStartedChatComponent session_id={event.session_id} />;
        case 'agent.delta':
            return <DeltaChatComponent message={event.message} />;
        case 'agent.tool.updated':
            return <ToolUpdatedChatComponent message={event.message} />;
        case 'agent.message.updated':
            return <MessageUpdatedChatComponent message={event.message} />;
        case 'agent.question':
            return <QuestionChatComponent message={event.message} options={event.options} onAnswer={onAnswer} />;
        case 'agent.permission.requested':
            return <PermissionRequestedChatComponent permission={event.permission} patterns={event.patterns} onAnswer={onAnswer} />;
        case 'agent.session.idle':
            return <SessionIdleChatComponent message={event.message} />;
        case 'agent.error':
            return <ErrorChatComponent message={event.message} />;
    }
};
