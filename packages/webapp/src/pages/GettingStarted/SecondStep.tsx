import { IconLoader2, IconPlayerPlay } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { CodeBlock } from '../../components/CodeBlock';
import LinkWithIcon from '../../components/LinkWithIcon';
import { Button } from '../../components/ui/button/Button';
import { useEnvironment } from '../../hooks/useEnvironment';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store';
import { publicApiFetch } from '../../utils/api';

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

function getNodeClientCode(calendarEvent: CalendarEvent) {
    return `
import { Nango } from "@nangohq/node";

const nango = new Nango({ secretKey: "<NANGO-SECRET-KEY>" });

await nango.put({
    endpoint: "/calendar/v3/calendars/primary/events",
    connectionId: "<CONNECTION-ID>",
    providerConfigKey: "<PROVIDER-CONFIG-KEY>",
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

function getCurlCode(calendarEvent: CalendarEvent) {
    return `
curl -X POST https://api.nango.dev/proxy/calendar/v3/calendars/primary/events \\
    -H "Authorization: Bearer <NANGO-SECRET-KEY>" \\
    -H "Content-Type: application/json" \\
    -H "Connection-Id: <CONNECTION-ID>" \\
    -H "Provider-Config-Key: <CONNECTION-ID>" \\
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
        return getNodeClientCode(calendarEvent);
    }, [calendarEvent]);

    const curlCode = useMemo(() => {
        return getCurlCode(calendarEvent);
    }, [calendarEvent]);

    const onClickExecute = async () => {
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
                    title: '❌ Something went wrong while running the code',
                    variant: 'error'
                });
                return;
            }

            toast({
                title: '✅ Created calendar event for tomorrow at 12:00!',
                variant: 'success'
            });
        } catch {
            toast({
                title: '❌ Something went wrong while running the code',
                variant: 'error'
            });
        } finally {
            setIsExecuting(false);
            onExecuted?.();
        }
    };

    return (
        <div>
            <h3 className="text-text-primary text-lg font-semibold mb-3">Use Nango as a proxy to make requests to Google Calendar</h3>
            <p className="text-text-secondary text-sm">Nango will handle API credentials for you. All you need is the connection id.</p>
            <CodeBlock
                className="mt-5"
                title=""
                snippets={[
                    {
                        displayLanguage: 'Node Client',
                        language: 'typescript',
                        code: nodeClientCode
                    },
                    {
                        displayLanguage: 'cURL',
                        language: 'bash',
                        code: curlCode
                    }
                ]}
            />
            <div className="flex flex-row items-center justify-between">
                {completed && <LinkWithIcon to={`/${env}/logs?integrations=${providerConfigKey}`}>Explore the logs from this demo</LinkWithIcon>}
                <Button variant="primary" className="mt-5 ml-auto" onClick={onClickExecute} disabled={isExecuting}>
                    {isExecuting ? <IconLoader2 className="w-4 h-4 animate-spin" /> : <IconPlayerPlay className="w-4 h-4" />} Execute
                </Button>
            </div>
        </div>
    );
};
