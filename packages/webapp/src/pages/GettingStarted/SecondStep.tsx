import { IconBrandNodejs, IconLoader, IconPlayerPlay, IconTerminal2 } from '@tabler/icons-react';
import { useState } from 'react';

import { CodeBlock } from '../../components/CodeBlock';
import LinkWithIcon from '../../components/LinkWithIcon';
import { Button } from '../../components/ui/button/Button';
import { useEnvironment } from '../../hooks/useEnvironment';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store';
import { publicApiFetch } from '../../utils/api';
import { cn } from '../../utils/utils';

function getNodeClientCode(connectionId?: string, providerConfigKey?: string) {
    return `
import { Nango } from "@nangohq/node";

const nango = new Nango({ secretKey: "<NANGO-SECRET-KEY>" });

await nango.put({
    endpoint: "/user/starred/nangohq/nango",
    connectionId: "${connectionId ?? '<CONNECTION-ID>'}",
    providerConfigKey: "${providerConfigKey ?? '<PROVIDER-CONFIG-KEY>'}"
});

console.log("Starred Nango's GitHub repo!");
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
                    secretKey: environmentAndAccount?.environment.secret_key
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
                title: `Starred Nango's GitHub repo!`,
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
                title="Star Nango's GitHub repo as the authenticated user"
                snippets={[
                    {
                        displayLanguage: 'Node Client',
                        icon: <IconBrandNodejs className="w-4 h-4" />,
                        language: 'typescript',
                        code: getNodeClientCode(connectionId, providerConfigKey)
                    },
                    {
                        displayLanguage: 'cURL',
                        icon: <IconTerminal2 className="w-4 h-4" />,
                        language: 'bash',
                        code: getCurlCode(connectionId, providerConfigKey)
                    }
                ]}
            />
            <div className={cn('flex flex-row items-center', completed ? 'justify-between' : 'justify-end')}>
                {completed && (
                    <div className="flex flex-col">
                        <LinkWithIcon to={`/${env}/logs?integrations=${providerConfigKey}&connections=${connectionId}`}>
                            Explore the logs from this demo
                        </LinkWithIcon>
                        <LinkWithIcon to="https://github.com/nangohq/nango" type="external">
                            Open GitHub repo to see the star
                        </LinkWithIcon>
                    </div>
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
