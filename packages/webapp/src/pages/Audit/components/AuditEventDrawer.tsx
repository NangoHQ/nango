import { Prism } from '@mantine/prism';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@nangohq/design-system';

import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/Sheet';
import { darkModeSelector, useThemeStore } from '@/lib/theme';
import { formatDateToLogFormat } from '@/utils/utils';
import { actorLabel, environmentLabel, eventLabel, viaLabel } from '../constants';
import { OutcomeTag } from './OutcomeTag';

import type { ApiAuditTrailEvent } from '@nangohq/types';

// Chosen so an ordinary event shows in full: outside function deploys, nothing in production carries more
// than ten targets, and a single-target event's JSON runs to about thirty lines.
const TARGETS_SHOWN_COLLAPSED = 10;
const JSON_LINES_SHOWN_COLLAPSED = 40;

const ShowAll: React.FC<{ hidden: number; noun: string; onClick: () => void }> = ({ hidden, noun, onClick }) => (
    <Button variant="link-accent" size="sm" onClick={onClick}>
        Show {hidden.toLocaleString()} more {noun}
    </Button>
);

const Meta: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
    <>
        <dt className="uppercase text-text-muted">{label}</dt>
        <dd className={mono ? 'font-code break-all' : 'break-all'}>{value}</dd>
    </>
);

export const AuditEventDrawer: React.FC<{ event: ApiAuditTrailEvent; onClose: () => void }> = ({ event, onClose }) => {
    const [open, setOpen] = useState(true);
    const [allTargets, setAllTargets] = useState(false);
    const [allJson, setAllJson] = useState(false);
    const darkMode = useThemeStore(darkModeSelector);
    const json = useMemo(() => JSON.stringify(event, null, 2), [event]);
    const jsonLines = useMemo(() => json.split('\n'), [json]);
    const jsonHiddenLines = Math.max(jsonLines.length - JSON_LINES_SHOWN_COLLAPSED, 0);
    const shownJson = allJson || jsonHiddenLines === 0 ? json : jsonLines.slice(0, JSON_LINES_SHOWN_COLLAPSED).join('\n');

    const targetsHidden = Math.max(event.targets.length - TARGETS_SHOWN_COLLAPSED, 0);
    const shownTargets = allTargets || targetsHidden === 0 ? event.targets : event.targets.slice(0, TARGETS_SHOWN_COLLAPSED);
    const via = viaLabel(event.via);

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
                className="w-full sm:w-[720px] max-w-none sm:max-w-none p-0 bg-surface-page text-text-strong border-l-border-muted"
            >
                <SheetTitle className="sr-only">Audit event details</SheetTitle>
                <div className="h-full select-text overflow-y-auto">
                    <div className="flex h-14 items-center justify-between border-b border-border-muted px-6">
                        <h2 className="text-lg font-semibold">Audit event</h2>
                        <SheetClose
                            title="Close"
                            className="-mr-2 flex size-8 items-center justify-center bg-transparent text-text-muted transition-colors hover:text-text-strong focus:text-text-strong"
                        >
                            <X size={16} />
                        </SheetClose>
                    </div>

                    <div className="flex h-14 items-center justify-between border-b border-border-muted px-6">
                        <span className="font-code text-s">{formatDateToLogFormat(event.occurredAt)}</span>
                        <OutcomeTag outcome={event.outcome} />
                    </div>

                    <dl className="grid grid-cols-[180px_1fr] gap-x-4 gap-y-5 px-6 py-6 text-s">
                        <Meta label="Actor" value={actorLabel(event.actor)} />
                        {via && <Meta label="Via" value={via} />}
                        <Meta label="Event" value={eventLabel(event)} />
                        <dt className="uppercase text-text-muted">
                            {event.targets.length > 1 ? `Targets · ${event.targets.length.toLocaleString()}` : 'Target'}
                        </dt>
                        <dd className="break-all">
                            {event.targets.length === 0 ? (
                                '—'
                            ) : (
                                <>
                                    <ul>
                                        {shownTargets.map((target, index) => (
                                            <li key={`${target.type}:${target.id}:${index}`}>{target.display ?? target.id}</li>
                                        ))}
                                    </ul>
                                    {targetsHidden > 0 && !allTargets && <ShowAll hidden={targetsHidden} noun="targets" onClick={() => setAllTargets(true)} />}
                                </>
                            )}
                        </dd>
                        <Meta label="Environment" value={environmentLabel(event)} />
                        {event.context.ip && <Meta label="IP" value={event.context.ip} mono />}
                        {event.context.userAgent && <Meta label="User agent" value={event.context.userAgent} />}
                        <Meta label="Event ID" value={event.id} mono />
                        <Meta label="Version" value={event.version} mono />
                    </dl>

                    <div className="mx-6 mb-6 rounded bg-surface-panel-inset p-4 text-sm text-text-muted">
                        <Prism
                            language="json"
                            className="transparent-code"
                            colorScheme={darkMode ? 'dark' : 'light'}
                            styles={() => ({ code: { padding: '0', whiteSpace: 'pre-wrap' } })}
                        >
                            {shownJson}
                        </Prism>
                        {jsonHiddenLines > 0 && !allJson && <ShowAll hidden={jsonHiddenLines} noun="lines" onClick={() => setAllJson(true)} />}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
};
