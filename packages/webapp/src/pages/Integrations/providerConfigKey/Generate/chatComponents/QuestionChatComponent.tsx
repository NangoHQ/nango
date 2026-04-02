import { Button } from '@/components-v2/ui/button';

export const QuestionChatComponent: React.FC<{
    message: string;
    options?: string[];
    onAnswer: (response: string) => void;
}> = ({ message, options, onAnswer }) => {
    return (
        <div className="rounded-lg border border-border-default bg-bg-subtle p-4 flex flex-col gap-3 max-w-2xl">
            <p className="text-text-primary text-sm">{message}</p>
            {options && options.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                    {options.map((choice, i) => (
                        <Button key={choice} variant={i === 0 ? 'primary' : 'secondary'} size="sm" onClick={() => onAnswer(choice)}>
                            {choice}
                        </Button>
                    ))}
                </div>
            )}
        </div>
    );
};
