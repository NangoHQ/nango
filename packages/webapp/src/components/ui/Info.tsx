import React from 'react';
import { Info as InfoIcon } from '@geist-ui/icons';

interface InfoProps {
    size?: number;
    padding?: string;
    verticallyCenter?: boolean;
    children: React.ReactNode;
    color?: 'orange' | 'blue';
    classNames?: string;
};

export default function Info({ children, size, padding, verticallyCenter = true, classNames = '', color = 'blue' }: InfoProps) {
    const twColor = color === 'blue' ? 'blue-400' : 'amber-500';
    const background = color === 'blue' ? 'bg-[#15202B]' : 'bg-amber-500';
    const border = color === 'blue' ? 'outline outline-1 outline-[#264863]' : 'border border-amber-500';
    const bgOpacity = color === 'blue' ? '' : 'bg-opacity-20';
    const textColor = color === 'blue' ? 'text-[#C3E5FA]' : 'text-white';

    return (
        <div className={`flex ${verticallyCenter ? 'items-center' : ''} ${bgOpacity} grow ${classNames} ${padding ? padding : 'p-4'} ${background} ${border} rounded`}>
            <InfoIcon size={`${size || '36'}`} className={`mr-3 ${verticallyCenter ? '' : 'mt-0.5'} stroke-${twColor}`}></InfoIcon>
            <span className={textColor}>{children}</span>
        </div>
    );
}
