import { IconBrandNodejs, IconLoader, IconPlayerPlay, IconTerminal2 } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { CodeBlock } from '../../components/CodeBlock';
import LinkWithIcon from '../../components/LinkWithIcon';
import { Button } from '../../components/ui/button/Button';
import { useEnvironment } from '../../hooks/useEnvironment';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store';
import { publicApiFetch } from '../../utils/api';
import { cn } from '../../utils/utils';

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

await nango.put({
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

console.log("✅ Created calendar event for tomorrow at 12:00!");
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

interface SecondStepProps {
    connectionId?: string;
    providerConfigKey?: string;
    onExecuted?: () => void;
    completed: boolean;
}

export const SecondStep: React.FC<SecondStepProps> = ({ connectionId, providerConfigKey, onExecuted, completed }) => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const { environmentAndAccount } = useEnvironment(env);

    const [isExecuting, setIsExecuting] = useState(false);

    const calendarEvent: CalendarEvent = useMemo(() => {
        const tomorrowNoon = new Date(new Date().setHours(12, 0, 0, 0) + 24 * 60 * 60 * 1000);

        return {
            summary: 'Getting started with Nango',
            description: 'Created with Nango from the getting started page!',
            start: {
                dateTime: tomorrowNoon
            },
            end: {
                dateTime: new Date(tomorrowNoon.getTime() + 15 * 60 * 1000)
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
                title: 'Created calendar event for tomorrow at 12:00. Check your calendar!',
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
        <div className="flex flex-col gap-5">
            <p className="text-text-secondary text-sm">Nango will handle API credentials for you. All you need is the connection id.</p>
            <CodeBlock
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
            />
            <div className={cn('flex flex-row items-center', completed ? 'justify-between' : 'justify-end')}>
                {completed && (
                    <LinkWithIcon to={`/${env}/logs?integrations=${providerConfigKey}&connections=${connectionId}`}>
                        Explore the logs from this demo
                    </LinkWithIcon>
                )}
                <Button variant="primary" onClick={onExecute} disabled={isExecuting}>
                    {isExecuting ? (
                        <>
                            <IconLoader className="w-4 h-4 animate-spin" />
                            Running...
                        </>
                    ) : (
                        <>
                            <IconPlayerPlay className="w-4 h-4" />
                            Run
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
};
