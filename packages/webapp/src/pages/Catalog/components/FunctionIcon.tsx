import { Eye, Hammer, List, Pencil, Plus, RefreshCw, Search, Send, Trash2 } from 'lucide-react';

import { cn } from '@/utils/utils';
import { getActionVerb } from '../functions';

import type { ActionVerb } from '../functions';
import type { NangoActionFunction, NangoSyncFunction } from '@nangohq/types';
import type { LucideIcon } from 'lucide-react';

const VERB_ICONS: Record<ActionVerb, LucideIcon> = {
    create: Plus,
    update: Pencil,
    delete: Trash2,
    get: Eye,
    list: List,
    search: Search,
    send: Send,
    other: Hammer
};

const VERB_COLORS: Record<ActionVerb, string> = {
    create: 'text-text-brand',
    update: 'text-text-brand',
    send: 'text-text-brand',
    delete: 'text-text-danger',
    get: 'text-text-secondary',
    list: 'text-text-secondary',
    search: 'text-text-secondary',
    other: 'text-text-secondary'
};

export const FunctionIcon = ({ fn }: { fn: NangoSyncFunction | NangoActionFunction }) => {
    const verb = fn.type === 'action' ? getActionVerb(fn.name) : null;
    const Icon = verb ? VERB_ICONS[verb] : RefreshCw;
    return (
        <div className={cn('flex size-12 shrink-0 items-center justify-center rounded-sm', verb ? VERB_COLORS[verb] : 'text-status-success-text')}>
            <Icon className="size-6" />
        </div>
    );
};
