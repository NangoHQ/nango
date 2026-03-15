import { IconBrandNodejs, IconTerminal2 } from '@tabler/icons-react';
import { CodeXml, Loader } from 'lucide-react';
import { useMemo, useState } from 'react';

import { MultiLanguageCodeBlock } from '../../components-v2/MultiLanguageCodeBlock';
import { useEnvironment } from '../../hooks/useEnvironment';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store';
import { publicApiFetch } from '../../utils/api';
import { cn, truncateMiddle } from '../../utils/utils';
import { StyledLink } from '@/components-v2/StyledLink';
import { Button } from '@/components-v2/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components-v2/ui/tooltip';

function getNodeClientCode(connectionId?: string, providerConfigKey?: string) {
    return `
import { Nango } from "@nangohq/node";

const nango = new Nango({ secretKey: "<NANGO-SECRET-KEY>" });

await nango.put({
    endpoint: "/user/starred/nangohq/nango",
    connectionId: "${connectionId ?? '<CONNECTION-ID>'}",
    providerConfigKey: "${providerConfigKey ?? '<PROVIDER-CONFIG-KEY>'}"
});

console.log("Starred Nango's Github repository!");
`.trim();
}

function getCurlCode(connectionId?: string, providerConfigKey?: string) {
    return `
curl -X PUT https://api.nango.dev/proxy/user/starred/nangohq/nango \\
    -H "Authorization: Bearer <NANGO-SECRET-KEY>" \\
    -H "Content-Type: application/json" \\
    -H "Connection-Id: ${connectionId ?? '<CONNECTION-ID>'}" \\
    -H "Provider-Config-Key: ${providerConfigKey ?? '<PROVIDER-CONFIG-KEY>'}"
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
    const [isTooltipOpen, setIsTooltipOpen] = useState(false);

    const nodeClientCode = useMemo(() => {
        return getNodeClientCode(connectionId, providerConfigKey);
    }, [connectionId, providerConfigKey]);

    const curlCode = useMemo(() => {
        return getCurlCode(connectionId, providerConfigKey);
    }, [connectionId, providerConfigKey]);

    const onExecute = async () => {
        if (!connectionId || !providerConfigKey || !environmentAndAccount) {
            return;
        }

        setIsExecuting(true);
        try {
            const res = await publicApiFetch(
                '/proxy/user/starred/nangohq/nango',
                {
                    connectionId: connectionId,
                    providerConfigKey: providerConfigKey,
                    secretKey: environmentAndAccount.pending_secret!
                },
                {
                    method: 'PUT'
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
                title: `Starred Nango's Github repository!`,
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
                <h3 className="text-text-primary text-sm font-semibold">Use Nango as a proxy to make requests to Github</h3>
                {!connectionId && (
                    <p className="text-text-tertiary text-sm">
                        Nango will handle API credentials for you. <br />
                        All you need is the connection id.
                    </p>
                )}
                {connectionId && (
                    <div>
                        <p className="text-text-tertiary text-sm">
                            A connection was created with the connection id:{' '}
                            <Tooltip open={isTooltipOpen} onOpenChange={setIsTooltipOpen}>
                                <TooltipTrigger>
                                    <StyledLink to={`/${env}/connections/${providerConfigKey}/${connectionId}`} icon>
                                        {truncateMiddle(connectionId, 30)}
                                    </StyledLink>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">{connectionId}</TooltipContent>
                            </Tooltip>
                        </p>
                        <p className="text-text-tertiary text-sm">You can use it to make requests to Github.</p>
                    </div>
                )}
            </div>
            {connectionId && (
                <>
                    <div className="w-full min-w-0">
                        <MultiLanguageCodeBlock
                            snippets={[
                                {
                                    displayLanguage: 'Node Client',
                                    icon: <IconBrandNodejs className="w-4 h-4" />,
                                    language: 'typescript',
                                    code: nodeClientCode,
                                    highlightedLines: isTooltipOpen ? [7] : undefined
                                },
                                {
                                    displayLanguage: 'cURL',
                                    icon: <IconTerminal2 className="w-4 h-4" />,
                                    language: 'bash',
                                    code: curlCode,
                                    highlightedLines: isTooltipOpen ? [4] : undefined
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
                                <StyledLink to="https://github.com/nangohq/nango" type="external" icon>
                                    Open Nango&apos;s Github repository to see the star
                                </StyledLink>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
