import { DeltaChatComponent } from './DeltaChatComponent';
import { ErrorChatComponent } from './ErrorChatComponent';
import { LifecycleChatComponent } from './LifecycleChatComponent';
import { PermissionRequestedChatComponent } from './PermissionRequestedChatComponent';
import { QuestionChatComponent } from './QuestionChatComponent';
import { SessionIdleChatComponent } from './SessionIdleChatComponent';
import { SessionStartedChatComponent } from './SessionStartedChatComponent';
import { UserMessageChatComponent } from './UserMessageChatComponent';

import type { AgentEvent } from '@/hooks/useChat';

interface ChatComponentProps {
    event: AgentEvent;
    isLast: boolean;
    onAnswer: (response: string) => void;
}

export const ChatComponent: React.FC<ChatComponentProps> = ({ event, isLast, onAnswer }) => {
    let inner: React.ReactNode;
    switch (event.eventType) {
        case 'agent.lifecycle':
            inner = <LifecycleChatComponent message={event.message} isDone={!isLast} />;
            break;
        case 'agent.session.started':
            inner = <SessionStartedChatComponent session_id={event.session_id} />;
            break;
        case 'agent.delta':
            inner = <DeltaChatComponent message={event.message} />;
            break;
        case 'agent.question':
            inner = <QuestionChatComponent message={event.message} options={event.options} onAnswer={onAnswer} />;
            break;
        case 'agent.permission.requested':
            inner = <PermissionRequestedChatComponent permission={event.permission} patterns={event.patterns} onAnswer={onAnswer} />;
            break;
        case 'agent.session.idle':
            inner = <SessionIdleChatComponent message={event.message} />;
            break;
        case 'agent.error':
            inner = <ErrorChatComponent message={event.message} />;
            break;
        case 'user.message':
            inner = <UserMessageChatComponent message={event.message} />;
            break;
        default:
            return null;
        // case 'agent.tool.updated':
        //     inner = <ToolUpdatedChatComponent tool={event.tool} status={event.status} input={event.input} title={event.title} duration={event.duration} />;
        //     break;
        // case 'agent.message.updated':
        //     inner = <MessageUpdatedChatComponent tokens={event.tokens} cost={event.cost} finish={event.finish} duration={event.duration} />;
        //     break;
    }
    return <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">{inner}</div>;
};
