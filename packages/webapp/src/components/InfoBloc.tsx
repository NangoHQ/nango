import { QuestionMarkCircledIcon } from '@radix-ui/react-icons';
import { Button } from './ui/button/Button';
import * as Tooltip from './ui/Tooltip';
import { cn } from '../utils/utils';

export const InfoBloc: React.FC<{ title: string; help?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
    title,
    children,
    help,
    className
}) => {
    return (
        <div className={cn('flex flex-col gap-1 relative', className)}>
            <div className="flex items-center gap-2">
                <div className="text-gray-400 text-xs uppercase">{title}</div>
                {help && (
                    <Tooltip.Tooltip delayDuration={0}>
                        <Tooltip.TooltipTrigger asChild>
                            <Button variant="icon" size={'xs'}>
                                <QuestionMarkCircledIcon />
                            </Button>
                        </Tooltip.TooltipTrigger>
                        <Tooltip.TooltipContent side="right">
                            <div className="flex text-white text-sm">{help}</div>
                        </Tooltip.TooltipContent>
                    </Tooltip.Tooltip>
                )}
            </div>
            <div className="flex items-center gap-2 text-white text-sm">{children}</div>
        </div>
    );
};
