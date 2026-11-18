import { ChevronDown, Wrench } from 'lucide-react';

import { LogoInverted } from '@/assets/LogoInverted';
import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { cn } from '@/utils/utils';
import { isFailed, isUnfinished } from '../replyOutcome';
import { describeTool } from '../toolDisplay';
import { StatusIcon } from './ToolCallCard';

import type { IntegrationLabels, ToolDisplay } from '../toolDisplay';
import type { ReplyEntry } from '../toolGroups';
import type { DynamicToolUIPart } from 'ai';

const MAX_ICONS = 3;
const NANGO = 'nango';
const OTHER = 'other';

export const ToolCallGroup: React.FC<{
    calls: DynamicToolUIPart[];
    entries: ReplyEntry[];
    labels: IntegrationLabels | undefined;
    chatActive: boolean;
    renderEntry: (entry: ReplyEntry) => React.ReactNode;
}> = ({ calls, entries, labels, chatActive, renderEntry }) => {
    const displays = calls.map((part) => describeTool(part.toolName, part.input, labels));
    const icons = [...new Set(displays.map(iconFor))].slice(0, MAX_ICONS);
    const unfinishedIndex = calls.map(isUnfinished).lastIndexOf(true);
    const running = unfinishedIndex !== -1 && chatActive;
    const stopped = unfinishedIndex !== -1 && !chatActive;
    const failed = calls.filter(isFailed).length;

    const title = running ? displays[unfinishedIndex]?.title : `Ran ${calls.length} tools`;

    return (
        <Collapsible className="group/tools flex flex-col gap-3">
            <CollapsibleTrigger className="flex min-h-7 w-full items-center gap-2 pr-[17px] text-left text-body-medium-regular text-text-secondary hover:text-text-default">
                <span className="flex shrink-0 items-center gap-1">
                    {icons.map((icon) => (
                        <GroupIcon key={icon} icon={icon} />
                    ))}
                </span>
                <span className={cn('min-w-0 truncate', running && 'animate-pulse')}>{title}</span>
                <span className="ml-auto flex shrink-0 items-center gap-2 pl-2 text-body-small-regular">
                    {stopped && <span>Stopped</span>}
                    {failed > 0 && <span>{`${failed} failed`}</span>}
                    <StatusIcon running={running} stopped={stopped} failed={failed > 0} />
                    <ChevronDown className="size-4 transition-transform group-data-[state=open]/tools:rotate-180" />
                </span>
            </CollapsibleTrigger>
            {/* Mounted while closed, so each card still times its run. */}
            <CollapsibleContent forceMount className="ml-2.5 flex flex-col gap-3 border-l border-border-muted pl-4 data-[state=closed]:hidden">
                {entries.map(renderEntry)}
            </CollapsibleContent>
        </Collapsible>
    );
};

function iconFor(display: ToolDisplay): string {
    if (display.kind === 'search') {
        return NANGO;
    }
    return display.integration?.provider ?? OTHER;
}

const GroupIcon: React.FC<{ icon: string }> = ({ icon }) => {
    let content: React.ReactNode;
    if (icon === NANGO) {
        content = <LogoInverted className="size-4 shrink-0 text-text-strong" />;
    } else if (icon === OTHER) {
        content = <Wrench className="size-4 shrink-0 text-icon-secondary" />;
    } else {
        // Larger than its 16px slot, because integration logo artwork has built-in padding.
        content = <IntegrationLogo provider={icon} className="size-5.5 shrink-0 border-0 bg-transparent p-0" />;
    }
    return <span className="flex size-4 items-center justify-center">{content}</span>;
};
