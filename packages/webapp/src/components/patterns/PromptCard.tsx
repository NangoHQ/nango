import { ArrowRight, Check, Copy } from 'lucide-react';

import { GithubLogo } from '@/assets/GithubLogo';
import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { cn } from '@/utils/utils';

interface PromptCardProps {
    prompt: string;
    provider: string;
    /** The app's name as it appears in the prompt, shown in medium weight. */
    name: string;
    /** `send` runs the prompt right away; `copy` puts it on the clipboard for another agent. */
    action: 'send' | 'copy';
    /** Shows the copy confirmation. Only used with `copy`. */
    copied?: boolean;
    onClick: () => void;
}

/**
 * An example prompt for an integration, as a clickable card.
 */
export const PromptCard: React.FC<PromptCardProps> = ({ prompt, provider, name, action, copied = false, onClick }) => {
    const ActionIcon = action === 'send' ? ArrowRight : copied ? Check : Copy;

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={action === 'copy' ? `Copy prompt: ${prompt}` : undefined}
            className={cn(
                'group flex gap-3 rounded-ds-xs border-ds-hairline border-border-muted px-3 py-[13px] text-left type-text-regular-sm text-text-default transition-[background-color,border-color,box-shadow] hover:border-border-strong hover:bg-surface-panel hover:shadow-container-panel',
                action === 'send' ? 'items-center' : 'items-start'
            )}
        >
            {/* Template logos pad their artwork, so a 25px box draws an 18px logo. */}
            {provider === 'github' ? (
                <GithubLogo className="-m-[3.5px] size-[25px] shrink-0 text-text-strong" />
            ) : (
                <IntegrationLogo provider={provider} className="-m-[3.5px] size-[25px] shrink-0 border-0 bg-transparent p-0" />
            )}
            <span className="flex-1">
                <PromptText prompt={prompt} name={name} />
            </span>
            {action === 'copy' && (
                <span className="sr-only" aria-live="polite">
                    {copied ? 'Copied' : ''}
                </span>
            )}
            <ActionIcon
                aria-hidden
                className={cn(
                    'size-3.5 shrink-0 transition-colors',
                    action === 'copy' && 'mt-[3px]',
                    copied ? 'text-status-success-icon' : 'text-text-muted group-hover:text-text-default'
                )}
            />
        </button>
    );
};

const PromptText: React.FC<{ prompt: string; name: string }> = ({ prompt, name }) => {
    const start = prompt.indexOf(name);
    if (start === -1) {
        return prompt;
    }
    return (
        <>
            {prompt.slice(0, start)}
            <span className="type-text-medium-sm">{name}</span>
            {prompt.slice(start + name.length)}
        </>
    );
};
