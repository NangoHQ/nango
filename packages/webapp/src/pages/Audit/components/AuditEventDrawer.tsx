import { Prism } from '@mantine/prism';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/Sheet';
import { Tag } from '@/components/ui/Tag';
import { darkModeSelector, useThemeStore } from '@/lib/theme';
import { formatDateToLogFormat } from '@/utils/utils';

import type { ApiAuditTrailEvent, AuditOutcome } from '@nangohq/types';

const outcomeVariant: Record<AuditOutcome, React.ComponentProps<typeof Tag>['variant']> = {
    success: 'success',
    failure: 'alert',
    denied: 'warning'
};

const Meta: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
    <>
        <dt className="text-text-muted">{label}</dt>
        <dd className={mono ? 'font-code break-all' : 'break-all'}>{value}</dd>
    </>
);

export const AuditEventDrawer: React.FC<{ event: ApiAuditTrailEvent; onClose: () => void }> = ({ event, onClose }) => {
    const [open, setOpen] = useState(true);
    const darkMode = useThemeStore(darkModeSelector);
    const json = useMemo(() => JSON.stringify(event, null, 2), [event]);

    return (
        <Sheet
            open={open}
            onOpenChange={(val) => {
                setOpen(val);
                if (!val) {
                    setTimeout(onClose, 300);
                }
            }}
        >
            <SheetContent
                side="right"
                hideCloseButton
                className="w-[720px] max-w-none sm:max-w-none p-0 bg-surface-page text-text-strong border-l-border-muted"
            >
                <SheetTitle className="sr-only">Audit event details</SheetTitle>
                <div className="relative h-full select-text overflow-y-auto p-8">
                    <div className="absolute right-6 top-8 flex items-center gap-1">
                        <SheetClose
                            title="Close"
                            className="bg-transparent text-text-muted hover:text-text-strong focus:text-text-strong transition-colors size-8 flex items-center justify-center"
                        >
                            <X size={16} />
                        </SheetClose>
                    </div>

                    <h2 className="text-xl font-semibold">Audit event</h2>
                    <div className="flex items-center gap-3 mt-3 mb-6">
                        <Tag variant={outcomeVariant[event.outcome]}>{event.outcome}</Tag>
                        <span className="text-text-muted text-s font-code">{formatDateToLogFormat(event.occurredAt)}</span>
                    </div>

                    <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2 text-s mb-6">
                        <Meta label="Actor" value={event.actor.display ?? `${event.actor.type} ${event.actor.id}`} />
                        <Meta label="Action" value={`${event.resource} ${event.action.replace(/_/g, ' ')}`} />
                        <Meta label="Target" value={event.targets.map((target) => target.display ?? `${target.type}:${target.id}`).join(', ') || '—'} />
                        <Meta label="Environment" value={event.environment ? event.environment.display : 'Account-level'} />
                        {event.context.ip && <Meta label="IP" value={event.context.ip} mono />}
                        {event.context.userAgent && <Meta label="User agent" value={event.context.userAgent} />}
                        <Meta label="Event ID" value={event.id} mono />
                        <Meta label="Version" value={event.version} mono />
                    </dl>

                    <h4 className="font-semibold text-sm mb-2">Event</h4>
                    <div className="text-text-muted text-sm bg-surface-panel-inset py-2">
                        <Prism
                            language="json"
                            className="transparent-code"
                            colorScheme={darkMode ? 'dark' : 'light'}
                            styles={() => ({ code: { padding: '0', whiteSpace: 'pre-wrap' } })}
                        >
                            {json}
                        </Prism>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
};
