export const EmptyCard: React.FC<{ content: string }> = ({ content }) => {
    return (
        <div className="h-65 flex flex-col items-center justify-center gap-5 p-20 bg-bg-elevated rounded-md">
            <span className="text-text-secondary text-body-medium-regular">{content}</span>
        </div>
    );
};
