import type React from 'react';
import { Info as InfoIcon } from '@geist-ui/icons';

interface InfoProps {
    size?: number;
    padding?: string;
    verticallyCenter?: boolean;
    children: React.ReactNode;
    color?: 'orange' | 'blue' | 'red';
    showIcon?: boolean;
    classNames?: string;
}

export default function Info({ children, size, padding, verticallyCenter = true, classNames = '', color = 'blue', showIcon = true }: InfoProps) {
    const iconClasses = color === 'blue' ? 'stroke-blue-400' : color === 'red' ? 'stroke-red-500' : 'stroke-amber-500';
    const background = color === 'blue' ? 'bg-[#15202B]' : color === 'red' ? 'bg-[#EF665B]/[.35]' : 'bg-amber-500';
    const border = color === 'blue' ? 'outline outline-1 outline-[#264863]' : color === 'red' ? 'border border-[#97423D]' : 'border border-amber-500';
    const bgOpacity = color === 'blue' ? '' : color === 'red' ? '' : 'bg-opacity-20';
    const textColor = color === 'blue' ? 'text-[#C3E5FA]' : color === 'red' ? 'text-red-base' : 'text-white';

    return (
        <div
            className={`flex ${verticallyCenter ? 'items-center' : ''} ${bgOpacity} grow ${classNames} ${padding ? padding : 'p-4'} ${background} ${border} rounded`}
        >
            {showIcon && <InfoIcon size={`${size || 36}`} className={`mr-3 ${verticallyCenter ? '' : 'mt-0.5'} ${iconClasses}`}></InfoIcon>}
            <span className={textColor}>{children}</span>
        </div>
    );
}
