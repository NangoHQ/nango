export const UserMessageChatComponent: React.FC<{ message: string }> = ({ message }) => {
    return (
        <div className="flex justify-end">
            <span className="bg-bg-subtle text-text-primary text-body-medium-regular rounded-lg px-4 py-2 max-w-xl whitespace-pre-wrap">{message}</span>
        </div>
    );
};
