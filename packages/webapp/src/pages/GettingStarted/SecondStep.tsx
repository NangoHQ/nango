import { IconBrandNodejs, IconTerminal2 } from '@tabler/icons-react';
import { CodeXml, Loader } from 'lucide-react';
import { useMemo, useState } from 'react';

import { CodeBlock } from '../../components-v2/CodeBlock';
import { useEnvironment } from '../../hooks/useEnvironment';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store';
import { publicApiFetch } from '../../utils/api';
import { cn } from '../../utils/utils';
import { StyledLink } from '@/components-v2/StyledLink';
import { Button } from '@/components-v2/ui/button';

interface CalendarEvent {
    summary: string;
    description: string;
    start: {
        dateTime: Date;
    };
    end: {
        dateTime: Date;
    };
}

function getNodeClientCode(calendarEvent: CalendarEvent, connectionId?: string, providerConfigKey?: string) {
    return `
import { Nango } from "@nangohq/node";

const nango = new Nango({ secretKey: "<NANGO-SECRET-KEY>" });

await nango.post({
    endpoint: "/calendar/v3/calendars/primary/events",
    connectionId: "${connectionId ?? '<CONNECTION-ID>'}",
    providerConfigKey: "${providerConfigKey ?? '<PROVIDER-CONFIG-KEY>'}",
    data: {
        summary: "Getting started with Nango",
        description: "Created with Nango from the getting started page!",
        start: {
            dateTime: "${calendarEvent.start.dateTime.toISOString()}"
        },
        end: {
            dateTime: "${calendarEvent.end.dateTime.toISOString()}"
        }
    }
});

console.log("Created calendar event!");
`.trim();
}

function getCurlCode(calendarEvent: CalendarEvent, connectionId?: string, providerConfigKey?: string) {
    return `
curl -X POST https://api.nango.dev/proxy/calendar/v3/calendars/primary/events \\
    -H "Authorization: Bearer <NANGO-SECRET-KEY>" \\
    -H "Content-Type: application/json" \\
    -H "Connection-Id: ${connectionId ?? '<CONNECTION-ID>'}" \\
    -H "Provider-Config-Key: ${providerConfigKey ?? '<PROVIDER-CONFIG-KEY>'}" \\
    -d '${JSON.stringify(calendarEvent)}'
`.trim();
}

/**
 * Returns the next 15-minute interval from the current time
 * @returns A Date object representing the next 15-minute interval
 * @example now: 12:08 -> 12:15
 */
function dateNext15Minutes() {
    const now = new Date();
    const minutes = now.getMinutes();
    const roundedMinutes = Math.ceil(minutes / 15) * 15;
    if (roundedMinutes === 60) {
        now.setHours(now.getHours() + 1);
        now.setMinutes(0, 0, 0);
    } else {
        now.setMinutes(roundedMinutes, 0, 0);
    }

    return now;
}

interface SecondStepProps {
    connectionId?: string;
    providerConfigKey?: string;
    onExecuted?: () => void;
    active: boolean;
    completed: boolean;
}

export const SecondStep: React.FC<SecondStepProps> = ({ connectionId, providerConfigKey, onExecuted, active, completed }) => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const { environmentAndAccount } = useEnvironment(env);

    const [isExecuting, setIsExecuting] = useState(false);

    const calendarEvent: CalendarEvent = useMemo(() => {
        const next15Minutes = dateNext15Minutes();

        return {
            summary: 'Getting started with Nango',
            description: 'Created with Nango from the getting started page!',
            start: {
                dateTime: next15Minutes
            },
            end: {
                dateTime: new Date(next15Minutes.getTime() + 15 * 60 * 1000)
            }
        };
    }, []);

    const nodeClientCode = useMemo(() => {
        return getNodeClientCode(calendarEvent, connectionId, providerConfigKey);
    }, [calendarEvent, connectionId, providerConfigKey]);

    const curlCode = useMemo(() => {
        return getCurlCode(calendarEvent, connectionId, providerConfigKey);
    }, [calendarEvent, connectionId, providerConfigKey]);

    const onExecute = async () => {
        if (!connectionId || !providerConfigKey || !environmentAndAccount) {
            return;
        }

        setIsExecuting(true);
        try {
            const res = await publicApiFetch(
                '/proxy/calendar/v3/calendars/primary/events',
                {
                    connectionId: connectionId,
                    providerConfigKey: providerConfigKey,
                    secretKey: environmentAndAccount?.environment.secret_key
                },
                {
                    method: 'POST',
                    body: JSON.stringify(calendarEvent)
                }
            );

            if (!res.ok) {
                toast({
                    title: 'Something went wrong while running the code',
                    variant: 'error'
                });
                return;
            }

            toast({
                title: `Created calendar event at ${calendarEvent.start.dateTime.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                })}. Check your calendar!`,
                variant: 'success'
            });
        } catch {
            toast({
                title: 'Something went wrong while running the code',
                variant: 'error'
            });
        } finally {
            onExecuted?.();
            setIsExecuting(false);
        }
    };

    return (
        <div className="flex flex-col gap-5 w-full min-w-0">
            <div className="flex flex-col gap-1.5">
                <h3 className="text-text-primary text-sm font-semibold">Use Nango as a proxy to make requests to Google Calendar</h3>
                <p className="text-text-tertiary text-sm">
                    Nango will handle API credentials for you. <br />
                    All you need is the connection id.
                </p>
            </div>
            {active && (
                <>
                    <div className="w-full min-w-0">
                        <CodeBlock
                            title="index.ts"
                            snippets={[
                                {
                                    displayLanguage: 'Node Client',
                                    icon: <IconBrandNodejs className="w-4 h-4" />,
                                    language: 'typescript',
                                    code: nodeClientCode
                                },
                                {
                                    displayLanguage: 'cURL',
                                    icon: <IconTerminal2 className="w-4 h-4" />,
                                    language: 'bash',
                                    code: curlCode
                                }
                            ]}
                            className="w-full"
                        />
                    </div>
                    <div className={cn('flex flex-col gap-5')}>
                        <Button variant="primary" size="lg" onClick={onExecute} disabled={isExecuting}>
                            {isExecuting ? (
                                <>
                                    <Loader className="size-5 animate-spin" />
                                    Running...
                                </>
                            ) : (
                                <>
                                    <CodeXml className="size-5" />
                                    {completed ? 'Run again' : 'Run'}
                                </>
                            )}
                        </Button>
                        {completed && (
                            <>
                                <StyledLink to={`/${env}/logs?integrations=${providerConfigKey}&connections=${connectionId}`} icon>
                                    Explore the logs from this demo
                                </StyledLink>
                                <StyledLink to="https://calendar.google.com/calendar/r/day" type="external" icon>
                                    Open Google Calendar to see the event
                                </StyledLink>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
