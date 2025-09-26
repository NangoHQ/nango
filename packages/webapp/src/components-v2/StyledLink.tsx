import { IconExternalLink, IconLink } from '@tabler/icons-react';
import React from 'react';
import { Link } from 'react-router-dom';

import { cn } from '../utils/utils';

interface StyledLinkProps {
    to: string;
    children: React.ReactNode;
    type?: 'internal' | 'external';
    icon?: boolean;
    className?: string;
    onClick?: () => void;
}

export const StyledLink: React.FC<StyledLinkProps> = ({ to, children, type = 'internal', icon = false, className = '', onClick }) => {
    if (type === 'external') {
        return (
            <a
                href={to}
                className={cn(`text-text-primary text-sm underline inline-flex items-center cursor-pointer`, className)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClick}
            >
                {children} {icon && <IconExternalLink className="w-4 h-4 ml-1" />}
            </a>
        );
    }

    return (
        <Link to={to} className={cn(`text-text-primary text-sm underline inline-flex items-center cursor-pointer`, className)} onClick={onClick}>
            {children} {icon && <IconLink className="w-4 h-4 ml-1" />}
        </Link>
    );
};
