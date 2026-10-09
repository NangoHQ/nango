import { ArrowRight, ExternalLink, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Badge, Button } from '@nangohq/design-system';

import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { CopyButton } from '@/components/ui/CopyButton';
import { EmptyCard } from '@/components/ui/EmptyCard';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components/ui/Navigation';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useDeleteIntegrationFunction, useGetIntegration } from '@/hooks/useIntegration';
import { useGetIntegrationFunctionCode, useGetTemplateFunctionCode } from '@/hooks/useIntegrationFunctions';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { APIError } from '@/utils/api';
import { openPlaygroundWithContext } from '@/utils/playground';
import { buildPullCommand, isSyncOrAction } from '@/utils/scripts';
import { JsonSchemaTopLevelObject } from '../../components/jsonSchema/JsonSchema';
import { isNullSchema, isObjectWithNoProperties } from '../../components/jsonSchema/utils';
import { FunctionSourceLabel } from './FunctionSourceLabel';

import type { ApiIntegration, ListedNangoFunction, NangoFunctionTemplate } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

type DetailsFunction = ListedNangoFunction | NangoFunctionTemplate;

function isListedFunction(fn: DetailsFunction): fn is ListedNangoFunction {
    return 'enabled' in fn;
}

interface FunctionDetailsPanelProps {
    fn: DetailsFunction;
    integration: ApiIntegration;
    onDeleted: () => void;
}

export const FunctionDetailsPanel: React.FC<FunctionDetailsPanelProps> = ({ fn, integration, onDeleted }) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { confirm, DialogComponent } = useConfirmDialog();
    const [activeTab, setActiveTab] = useState<'input' | 'output' | 'code'>('input');
    const functionType = fn.type === 'sync' ? 'sync' : 'action';
    const { mutateAsync: deleteFunction, isPending: isDeleting } = useDeleteIntegrationFunction(env, integration.unique_key, fn.name, functionType);

    const inputSchema = useMemo(() => getInputSchema(fn), [fn]);
    const outputSchemas = useMemo(() => getOutputSchemas(fn), [fn]);
    const listed = isListedFunction(fn);
    const { data: integrationDetails } = useGetIntegration(env, integration.unique_key);
    const repoProvider = integrationDetails?.data.symLinkTargetName ?? integration.provider;
    const {
        data: codeData,
        isPending: deployedCodePending,
        error: deployedCodeError
    } = useGetIntegrationFunctionCode({
        env,
        providerConfigKey: integration.unique_key,
        name: fn.name,
        type: fn.type,
        enabled: listed && activeTab === 'code'
    });
    const {
        data: templateCode,
        isPending: templateCodePending,
        error: templateCodeError
    } = useGetTemplateFunctionCode({
        provider: repoProvider,
        name: fn.name,
        type: fn.type,
        enabled: !listed && activeTab === 'code'
    });
    const codePending = listed ? deployedCodePending : templateCodePending;
    const codeError = listed ? deployedCodeError : templateCodeError;
    const code = listed ? codeData?.code : templateCode;

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

    const source = listed ? fn.source : 'template';
    const pullCommand = buildPullCommand({
        integration: integration.unique_key,
        name: fn.name,
        type: fn.type,
        source: listed ? { env } : { catalog: true }
    });
    const canDelete = listed && fn.source !== 'repo' && fn.id != null && isSyncOrAction(fn);
    const canUsePlayground = listed && fn.enabled && isSyncOrAction(fn);

    return (
        <aside className="sticky top-0 flex max-h-[calc(100dvh-7rem)] min-h-[min(606px,calc(100dvh-7rem))] w-full flex-col overflow-y-auto overscroll-y-contain bg-surface-panel">
            <div className="flex items-start justify-between gap-2 border-b border-border-default p-3">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-center gap-1">
                        <span className="truncate type-code-medium-sm text-text-default">{fn.name}</span>
                        <CopyButton text={fn.name} className="size-4 p-0" />
                    </div>
                    {fn.description && <p className="type-text-regular-xs text-text-secondary">{fn.description}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-start gap-2">
                    {canDelete && (
                        <Button
                            variant="link-danger"
                            size="sm"
                            loading={isDeleting}
                            onClick={() =>
                                void confirm({
                                    title: 'Delete function?',
                                    description:
                                        fn.type === 'sync'
                                            ? `You are about to permanently delete the sync "${fn.name}" and all of its synced records. This operation is not reversible, are you sure you wish to continue?`
                                            : `You are about to permanently delete the action "${fn.name}". This operation is not reversible, are you sure you wish to continue?`,
                                    confirmButtonText: 'Delete function',
                                    confirmVariant: 'danger',
                                    onConfirm: onDelete
                                })
                            }
                        >
                            Delete function <Trash2 />
                        </Button>
                    )}
                    <ConditionalTooltip
                        condition={!canUsePlayground}
                        content={listed ? 'Enable this function to use it in the Playground.' : 'Deploy this template to use it in the Playground.'}
                        side="left"
                        asChild
                    >
                        <span className="inline-flex">
                            <Button
                                variant="link-accent"
                                size="xs"
                                disabled={!canUsePlayground}
                                onClick={() => {
                                    if (!isListedFunction(fn) || !isSyncOrAction(fn)) return;
                                    openPlaygroundWithContext({
                                        source: 'function',
                                        integration: integration.unique_key,
                                        functionName: fn.name,
                                        functionType: fn.type
                                    });
                                }}
                            >
                                View in playground <ArrowRight />
                            </Button>
                        </span>
                    </ConditionalTooltip>
                </div>
            </div>

            <div className="pb-6">
                <div className="grid grid-cols-2 gap-3 border-b border-border-default p-3">
                    <Metadata label="Type">
                        <Badge case="capitalize">{fn.type === 'on-event' ? 'trigger' : fn.type}</Badge>
                    </Metadata>
                    {fn.type === 'sync' && fn.runs && <Metadata label="Frequency">{fn.runs}</Metadata>}
                    <Metadata label="Source">
                        <FunctionSourceLabel source={source} />
                    </Metadata>
                    {fn.scopes && fn.scopes.length > 0 && (
                        <Metadata label="Required scopes" className="col-span-2">
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
                                <Button asChild variant="link-accent" size="xs">
                                    <a href="https://nango.dev/docs/guides/functions/functions-guide#guide" target="_blank" rel="noreferrer">
                                        Learn about custom functions <ExternalLink />
                                    </a>
                                </Button>
                            )}
                        </div>
                        <div className="rounded-ds-lg bg-surface-panel px-3 py-2.5">
                            <span className="type-code-medium-xs text-text-secondary">{pullCommand}</span>
                        </div>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="gap-3 px-3 pt-3">
                    <TabsList className="w-fit gap-3">
                        <TabsTrigger value="input" className="px-2 py-1.5">
                            Input
                        </TabsTrigger>
                        <TabsTrigger value="output" className="px-2 py-1.5">
                            Output
                        </TabsTrigger>
                        <TabsTrigger value="code" className="px-2 py-1.5">
                            Code
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="input">
                        {inputSchema ? <JsonSchemaTopLevelObject schema={inputSchema} /> : <CompactEmptyState>No inputs.</CompactEmptyState>}
                    </TabsContent>
                    <TabsContent value="output">
                        {outputSchemas.length > 0 ? (
                            <Navigation defaultValue={outputSchemas[0]?.name ?? ''} orientation="horizontal">
                                {outputSchemas.length > 1 && (
                                    <NavigationList>
                                        {outputSchemas.map((outputSchema) => (
                                            <NavigationTrigger key={outputSchema.name} value={outputSchema.name}>
                                                {outputSchema.name}
                                            </NavigationTrigger>
                                        ))}
                                    </NavigationList>
                                )}
                                {outputSchemas.map((outputSchema) => (
                                    <NavigationContent key={outputSchema.name} value={outputSchema.name}>
                                        <JsonSchemaTopLevelObject schema={outputSchema.schema} />
                                    </NavigationContent>
                                ))}
                            </Navigation>
                        ) : (
                            <CompactEmptyState>No outputs.</CompactEmptyState>
                        )}
                    </TabsContent>
                    <TabsContent value="code">
                        {codePending ? (
                            <div className="flex h-48 items-center justify-center">
                                <Spinner className="size-5 text-text-muted" />
                            </div>
                        ) : codeError || !code ? (
                            <CompactEmptyState>Failed to load source code.</CompactEmptyState>
                        ) : (
                            <CodeBlock title={`${fn.name}.ts`} language="typescript" code={code} />
                        )}
                    </TabsContent>
                </Tabs>
            </div>
            {DialogComponent}
        </aside>
    );
};

const Metadata: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className, children }) => (
    <div className={`flex min-w-0 items-center gap-2 ${className ?? ''}`}>
        <span className="shrink-0 type-label-xxs uppercase text-text-secondary">{label}</span>
        <div className="min-w-0 type-label-sm text-text-default">{children}</div>
    </div>
);

const CompactEmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <EmptyCard className="h-24">
        <span className="type-label-sm text-text-secondary">{children}</span>
    </EmptyCard>
);

function getInputSchema(fn: DetailsFunction): JSONSchema7 | null {
    if (fn.type === 'on-event' || !fn.input || !fn.json_schema) return null;
    const schema = fn.json_schema.definitions?.[fn.input] ?? null;
    if (!schema || isNullSchema(schema as JSONSchema7) || isObjectWithNoProperties(schema as JSONSchema7)) return null;
    return schema as JSONSchema7;
}

function getOutputSchemas(fn: DetailsFunction): { name: string; schema: JSONSchema7 }[] {
    if (fn.type === 'on-event' || !fn.returns || !fn.json_schema) return [];
    return fn.returns.flatMap((name) => {
        const schema = fn.json_schema?.definitions?.[name] ?? null;
        if (!schema || isNullSchema(schema as JSONSchema7) || isObjectWithNoProperties(schema as JSONSchema7)) return [];
        return [{ name, schema: schema as JSONSchema7 }];
    });
}
