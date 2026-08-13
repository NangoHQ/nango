import { ExternalLink } from 'lucide-react';

import { IconButton } from '@nangohq/design-system';

export const DocsIconLink: React.FC<{ href: string; label: string }> = ({ href, label }) => {
    return (
        <IconButton asChild variant="link" size="xs" label={label}>
            <a href={href} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
            </a>
        </IconButton>
    );
};
