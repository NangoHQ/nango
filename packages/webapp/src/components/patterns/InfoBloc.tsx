import { IconHelpCircle } from '@tabler/icons-react';

import { SimpleTooltip } from './SimpleTooltip';
import { cn } from '../utils/utils';
import { Button } from './ui/button/Button';

export const InfoBloc: React.FC<{ title: string; help?: React.ReactNode; children: React.ReactNode; className?: string; horizontal?: boolean }> = ({
    title,
    children,
    help,
    horizontal,
    className
}) => {
    return (
        <div className={cn('flex flex-col gap-1 relative', horizontal && 'grid grid-cols-2', className)}>
            <div className={cn('flex items-center gap-2')}>
                <div className="text-gray-400 text-s uppercase">{title}</div>
                {help && (
                    <SimpleTooltip delay={0} side="right" tooltipContent={<div className="flex text-white text-sm">{help}</div>}>
                        <Button variant="icon" size={'xs'}>
                            <IconHelpCircle stroke={1} size={18} />
                        </Button>
                    </SimpleTooltip>
                )}
            </div>
            <div className="flex items-center gap-1 text-white text-sm">{children}</div>
        </div>
    );
};
