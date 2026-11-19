import { Bot, ChevronDown } from 'lucide-react';

import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';

interface PlaygroundEventProps {
    provider: string;
    text: string;
    link?: { label: string; to: string } | undefined;
    details?: React.ReactNode;
}

export const PlaygroundIcons: React.FC<{ provider: string }> = ({ provider }) => (
    <span className="flex shrink-0 items-center gap-1">
        <Bot className="size-4 shrink-0 text-icon-secondary" />
        <span className="flex size-4 items-center justify-center">
            {/* Larger than its 16px slot, because integration logo artwork has built-in padding. */}
            <IntegrationLogo provider={provider} className="size-5.5 shrink-0 border-0 bg-transparent p-0" />
        </span>
    </span>
);

const EventLabel: React.FC<{ provider: string; text: string }> = ({ provider, text }) => (
    <>
        <PlaygroundIcons provider={provider} />
        <span className="min-w-0 truncate">
            <span className="text-body-medium-medium text-text-default">Playground</span> {text}
        </span>
    </>
);

export const PlaygroundEvent: React.FC<PlaygroundEventProps> = ({ provider, text, link, details }) => {
    const button = link && (
        <span className="shrink-0">
            <ButtonLink to={link.to} variant="outline" size="sm">
                {link.label}
            </ButtonLink>
        </span>
    );
    if (!details) {
        return (
            <div className="mr-[17px] flex min-h-7 items-center gap-2 text-body-medium-regular text-text-secondary" role="status">
                <EventLabel provider={provider} text={text} />
                <span className="ml-auto flex shrink-0 pl-2">{button}</span>
            </div>
        );
    }
    return (
        <Collapsible className="group/event flex flex-col gap-3">
            <div className="mr-[17px] flex min-h-7 items-center gap-2 text-body-medium-regular text-text-secondary" role="status">
                <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-ds-xs text-left hover:text-text-default focus-visible:outline-offset-4">
                    <EventLabel provider={provider} text={text} />
                </CollapsibleTrigger>
                {button}
                <CollapsibleTrigger tabIndex={-1} aria-hidden className="flex cursor-pointer items-center self-stretch hover:text-text-default">
                    <ChevronDown className="size-4 shrink-0 transition-transform group-data-[state=open]/event:rotate-180" />
                </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="flex flex-col gap-3">{details}</CollapsibleContent>
        </Collapsible>
    );
};

export const PlaygroundEventExplanation: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="text-body-small-regular text-text-secondary">{children}</p>
);
