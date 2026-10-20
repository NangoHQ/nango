import { Anchor, BookOpen, GitBranch, LayoutTemplate } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@nangohq/design-system';

import type { FunctionListSource } from '@nangohq/types';

type DisplaySource = FunctionListSource | 'template';

const SOURCE_LABEL: Record<DisplaySource, { label: string; icon: typeof BookOpen; tooltip: string }> = {
    catalog: { label: 'Standalone', icon: Anchor, tooltip: 'Deployed function, the source-code lives in Nango.' },
    standalone: { label: 'Standalone', icon: Anchor, tooltip: 'Deployed function, the source-code lives in Nango.' },
    repo: { label: 'Your repo', icon: GitBranch, tooltip: 'Deployed from the Nango CLI. You own the source-code.' },
    'tools-catalog': {
        label: 'Nango catalog',
        icon: BookOpen,
        tooltip: 'Written and maintained by Nango. Always on the latest version (auto-updates).'
    },
    template: { label: 'Template', icon: LayoutTemplate, tooltip: 'A template you can deploy or customize.' }
};

export function FunctionSourceLabel({ source }: { source: DisplaySource }) {
    const { label, icon: Icon, tooltip } = SOURCE_LABEL[source];
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    className="focus-default inline-flex cursor-help items-center gap-1 rounded-ds-xs type-label-sm text-text-default"
                    onClick={(event) => event.stopPropagation()}
                >
                    <Icon className="size-3 shrink-0" />
                    {label}
                </button>
            </TooltipTrigger>
            <TooltipContent side="left">{tooltip}</TooltipContent>
        </Tooltip>
    );
}
