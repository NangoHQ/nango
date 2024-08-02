import type { HTMLAttributes } from 'react';
import { cn } from '../../../utils/utils';

export const Tag: React.FC<{
    children: React.ReactNode;
    bgClassName?: HTMLAttributes<HTMLDivElement>['className'];
    textClassName?: HTMLAttributes<HTMLDivElement>['className'];
}> = ({ children, bgClassName, textClassName }) => {
    return (
        <div className={cn('inline-flex px-1 pt-[1px] bg-pure-black text-gray-400 rounded', bgClassName)}>
            <div className={cn('uppercase text-[11px] leading-[17px]', textClassName)}>{children}</div>
        </div>
    );
};
