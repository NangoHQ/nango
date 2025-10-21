import { ExternalLink, LinkIcon } from 'lucide-react';
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
    title?: string;
}

export const StyledLink: React.FC<StyledLinkProps> = ({ to, children, type = 'internal', icon = false, className = '', onClick, title }) => {
    if (type === 'external') {
        return (
            <a
                href={to}
                className={cn(`w-fit text-text-primary text-sm underline inline-flex items-center cursor-pointer`, className)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClick}
                title={title}
            >
                {children} {icon && <ExternalLink className="w-3.5 h-3.5 ml-1 text-icon-tertiary" />}
            </a>
        );
    }

    return (
        <Link
            to={to}
            className={cn(`w-fit text-text-primary text-sm underline inline-flex items-center cursor-pointer`, className)}
            onClick={onClick}
            title={title}
        >
            {children} {icon && <LinkIcon className="w-3.5 h-3.5 ml-1 text-icon-tertiary" />}
        </Link>
    );
};
