import { ExternalLink, Play, Trash2 } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { Badge, LinkButton } from '@nangohq/design-system';

import { CodeBlock } from '@/components/ui/CodeBlock';
import { CopyButton } from '@/components/ui/CopyButton';
import { Separator } from '@/components/ui/Separator';
import { Spinner } from '@/components/ui/Spinner';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useDeleteIntegrationFunction } from '@/hooks/useIntegration';
import { useGetIntegrationFunctionCode, useGetTemplateFunctionCode } from '@/hooks/useIntegrationFunctions';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { APIError } from '@/utils/api';
import { openPlaygroundWithContext, useCanRunFunctions } from '@/utils/playground';
import { toFunctionDetails } from './functionDetails.utils';
import { CompactEmptyState, FunctionPanel, FunctionPanelHeader, FunctionSchemaTabs } from './FunctionPanel';
import { FunctionSourceLabel } from './FunctionSourceLabel';

import type { DetailsFunction, FunctionDetails } from './functionDetails.utils';
import type { ApiIntegration } from '@nangohq/types';

interface FunctionDetailsPanelProps {
    fn: DetailsFunction;
    integration: ApiIntegration;
    onDeleted: () => void;
}

export const FunctionDetailsPanel: React.FC<FunctionDetailsPanelProps> = ({ fn: rawFunction, integration, onDeleted }) => {
    const env = useStore((state) => state.env);
    const canOpenPlayground = useCanRunFunctions();
    const { toast } = useToast();
    const { confirm, DialogComponent } = useConfirmDialog();
    const fn = useMemo(
        () => toFunctionDetails(rawFunction, { env, integration: integration.unique_key, provider: integration.provider }),
        [rawFunction, env, integration.unique_key, integration.provider]
    );
    const { mutateAsync: deleteFunction, isPending: isDeleting } = useDeleteIntegrationFunction(env, integration.unique_key, fn.name, fn.delete?.type);
    const { inputSchema, outputSchemas, delete: deletion } = fn;

    const onDelete = useCallback(async () => {
        try {
            await deleteFunction();
            toast({ title: `Function "${fn.name}" has been deleted`, variant: 'success' });
            onDeleted();
        } catch (err) {
            const errorCode = err instanceof APIError ? (err.json as { error?: { code?: string } }).error?.code : undefined;
            toast({
                title: 'Failed to delete function',
                description: errorCode ? `Error code: ${errorCode}` : undefined,
                variant: 'error'
            });
        }
    }, [deleteFunction, fn.name, onDeleted, toast]);

    const { source, pullCommand } = fn;

    return (
        <FunctionPanel>
            <FunctionPanelHeader
                name={fn.name}
                description={fn.description}
                actions={
                    (canOpenPlayground || deletion) && (
                        <>
                            {canOpenPlayground && (
                                <LinkButton
                                    size="sm"
                                    disabled={!fn.runType}
                                    onClick={() => {
                                        if (!fn.runType) return;
                                        openPlaygroundWithContext({
                                            source: 'function',
                                            integration: integration.unique_key,
                                            functionName: fn.name,
                                            functionType: fn.runType
                                        });
                                    }}
                                >
                                    <Play />
                                    Test run this function
                                </LinkButton>
                            )}
                            {canOpenPlayground && deletion && <Separator orientation="vertical" />}
                            {deletion && (
                                <LinkButton
                                    tone="neutral-danger"
                                    size="sm"
                                    loading={isDeleting}
                                    onClick={() =>
                                        void confirm({
                                            title: 'Delete function?',
                                            description: deletion.description,
                                            confirmButtonText: 'Delete function',
                                            confirmVariant: 'danger',
                                            onConfirm: onDelete
                                        })
                                    }
                                >
                                    <Trash2 />
                                    Delete
                                </LinkButton>
                            )}
                        </>
                    )
                }
            />

            <div className="pb-6">
                <div className="grid grid-cols-2 gap-3 border-b border-border-default p-3">
                    <Metadata label="Type">
                        <Badge case="capitalize">{fn.typeLabel}</Badge>
                    </Metadata>
                    {fn.frequency && <Metadata label="Frequency">{fn.frequency}</Metadata>}
                    <Metadata label="Source">
                        <FunctionSourceLabel source={source} />
                    </Metadata>
                    {fn.scopes && fn.scopes.length > 0 && (
                        <Metadata label={fn.scopesMatch === 'any' ? 'Requires one of these scopes' : 'Required scopes'} className="col-span-2">
                            <div className="flex flex-wrap gap-2">
                                {fn.scopes.map((scope) => (
                                    <Badge key={scope} variant="secondary">
                                        {scope}
                                    </Badge>
                                ))}
                            </div>
                        </Metadata>
                    )}
                </div>

                <div className="border-b-[0.5px] border-border-default p-3">
                    <div className="flex flex-col gap-1 bg-surface-panel-muted p-3">
                        <div className="flex min-h-4.5 flex-wrap items-center justify-between gap-x-2 gap-y-1">
                            <span className="type-text-medium-xs text-text-default">Customize this function</span>
                            {(source === 'catalog' || source === 'tools-catalog' || source === 'template') && (
                                <LinkButton asChild size="sm">
                                    <a href="https://nango.dev/docs/guides/functions/functions-guide#guide" target="_blank" rel="noreferrer">
                                        Learn about custom functions <ExternalLink />
                                    </a>
                                </LinkButton>
                            )}
                        </div>
                        <div className="flex items-center gap-2 rounded-ds-lg bg-surface-panel px-3 py-2.5">
                            <span className="min-w-0 flex-1 type-code-medium-xs text-text-secondary">
                                {pullCommand ?? 'Pulling tools is not supported yet.'}
                            </span>
                            {pullCommand && <CopyButton text={pullCommand} />}
                        </div>
                    </div>
                </div>

                <FunctionSchemaTabs
                    inputSchema={inputSchema}
                    outputSchemas={outputSchemas}
                    extraTabs={[{ value: 'code', label: 'Code', content: <FunctionCode fn={fn} integration={integration} /> }]}
                />
            </div>
            {DialogComponent}
        </FunctionPanel>
    );
};

const Metadata: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className, children }) => (
    <div className={`flex min-w-0 items-center gap-2 ${className ?? ''}`}>
        <span className="shrink-0 type-label-xxs uppercase text-text-secondary">{label}</span>
        <div className="min-w-0 type-label-sm text-text-default">{children}</div>
    </div>
);

const FunctionCode: React.FC<{ fn: FunctionDetails; integration: ApiIntegration }> = ({ fn, integration }) => {
    const env = useStore((state) => state.env);
    const codeSource = fn.code;
    const isDeployedCode = codeSource.kind === 'deployed';
    const {
        data: codeData,
        isPending: deployedCodePending,
        error: deployedCodeError
    } = useGetIntegrationFunctionCode({
        env,
        providerConfigKey: integration.unique_key,
        name: fn.name,
        type: isDeployedCode ? codeSource.type : undefined,
        enabled: isDeployedCode
    });
    const {
        data: templateCode,
        isPending: templateCodePending,
        error: templateCodeError
    } = useGetTemplateFunctionCode({
        env,
        provider: integration.provider,
        name: fn.name,
        type: isDeployedCode ? undefined : codeSource.type,
        enabled: !isDeployedCode
    });
    const codePending = isDeployedCode ? deployedCodePending : templateCodePending;
    const codeError = isDeployedCode ? deployedCodeError : templateCodeError;
    const code = isDeployedCode ? codeData?.code : templateCode?.code;

    if (codePending) {
        return (
            <div className="flex h-48 items-center justify-center">
                <Spinner className="size-5 text-text-muted" />
            </div>
        );
    }
    if (codeError || !code) {
        return <CompactEmptyState>Failed to load source code.</CompactEmptyState>;
    }
    return <CodeBlock title={`${fn.name}.ts`} language="typescript" code={code} />;
};
