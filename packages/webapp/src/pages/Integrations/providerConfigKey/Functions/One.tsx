import { Download, ExternalLink, Info, Trash2 } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { CardContent, CardHeader, CardLayout, CardSubheader } from '../../components/CardLayout';
import { FunctionSwitch } from '../../components/FunctionSwitch';
import { JsonSchemaTopLevelObject } from '../../components/jsonSchema/JsonSchema';
import { isNullSchema, isObjectWithNoProperties } from '../../components/jsonSchema/utils';
import { ConditionalTooltip } from '@/components/patterns/ConditionalTooltip';
import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyButton';
import { EmptyCard } from '@/components/ui/EmptyCard';
import { KeyValueBadge } from '@/components/ui/KeyValueBadge';
import { LineSnippet } from '@/components/ui/LineSnippet';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components/ui/Navigation';
import { Skeleton } from '@/components/ui/Skeleton';
import { StyledLink } from '@/components/ui/StyledLink';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { apiFlowDownload } from '@/hooks/useFlow';
import { useHashNavigation } from '@/hooks/useHashNavigation';
import { useDeleteIntegrationFunction, useGetIntegration, useGetIntegrationFlows } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import DashboardLayout from '@/layout/DashboardLayout';
import PageNotFound from '@/pages/PageNotFound';
import { useStore } from '@/store';
import { APIError } from '@/utils/api';
import { githubRepo } from '@/utils/cloud';
import { openPlaygroundWithContext } from '@/utils/playground';

import type { JSONSchema7 } from 'json-schema';

export const FunctionsOne: React.FC = () => {
    const { providerConfigKey, functionName } = useParams();
    const { toast } = useToast();
    const navigate = useNavigate();
    const { confirm, DialogComponent } = useConfirmDialog();

    const env = useStore((state) => state.env);
    const debugMode = useStore((state) => state.debugMode);
    const { data: integrationResponse, isLoading: integrationLoading } = useGetIntegration(env, providerConfigKey!);
    const integrationData = integrationResponse?.data;
    const { data: flowsResponse, isLoading: flowsLoading } = useGetIntegrationFlows(env, providerConfigKey!);
    const flowsData = flowsResponse?.data;

    const func = flowsData?.flows.find((flow) => flow.name === functionName);

    const functionType = func?.type === 'sync' ? 'sync' : 'action';
    const { mutateAsync: deleteFunction, isPending: isDeleting } = useDeleteIntegrationFunction(env, providerConfigKey!, functionName!, functionType);

    const inputSchema: JSONSchema7 | null = useMemo(() => {
        if (!func || !func.input || !func.json_schema) {
            return null;
        }
        const { input, json_schema } = func;

        const inputSchema = json_schema.definitions?.[input] ?? null;
        if (!inputSchema || isNullSchema(inputSchema as JSONSchema7) || isObjectWithNoProperties(inputSchema as JSONSchema7)) {
            return null;
        }
        return inputSchema as JSONSchema7;
    }, [func]);

    const outputSchemas: { name: string; schema: JSONSchema7 }[] | null = useMemo(() => {
        if (!func || !func.returns || !func.json_schema) {
            return null;
        }
        const { returns, json_schema } = func;

        const outputSchemas = returns
            .map((returnsName) => {
                const outputSchema = json_schema.definitions?.[returnsName] ?? null;
                if (!outputSchema || isNullSchema(outputSchema as JSONSchema7) || isObjectWithNoProperties(outputSchema as JSONSchema7)) {
                    return null;
                }
                return { name: returnsName, schema: outputSchema as JSONSchema7 };
            })
            .filter((outputSchema) => outputSchema !== null);
        return outputSchemas;
    }, [func]);

    const [activeTab, setActiveTab] = useHashNavigation(outputSchemas && outputSchemas.length > 0 && !inputSchema ? 'output' : 'input');

    const isLoading = integrationLoading || flowsLoading;

    const downloadCode = useCallback(async () => {
        if (!func || !func.enabled || !func.id) {
            return;
        }
        try {
            await apiFlowDownload(env, { id: func.id }, func.name);
            toast({
                title: 'Downloading function code',
                variant: 'success'
            });
        } catch (err) {
            const errorCode = err instanceof APIError ? err.json?.error?.code : undefined;
            toast({
                title: 'Failed to download function code',
                description: errorCode ? `Error code: ${errorCode}` : undefined,
                variant: 'error'
            });
        }
    }, [func, env, toast]);

    const onDelete = useCallback(async () => {
        try {
            await deleteFunction();
            toast({ title: `Function "${functionName}" has been deleted`, variant: 'success' });
            navigate(`/${env}/integrations/${providerConfigKey}`);
        } catch (err) {
            const errorCode = err instanceof APIError ? err.json?.error?.code : undefined;
            toast({
                title: 'Failed to delete function',
                description: errorCode ? `Error code: ${errorCode}` : undefined,
                variant: 'error'
            });
        }
    }, [deleteFunction, toast, functionName, navigate, env, providerConfigKey]);

    if (isLoading) {
        return (
            <DashboardLayout>
                <Helmet>
                    <title>Nango</title>
                </Helmet>

                <CardLayout>
                    <CardHeader>
                        <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex items-center gap-2.5">
                                <Skeleton className="bg-bg-subtle size-10.5" />
                                <Skeleton className="bg-bg-subtle w-36 h-5" />
                                <Skeleton className="bg-bg-subtle w-24 h-4" />
                            </div>
                            <Skeleton className="bg-bg-subtle w-8 h-5" />
                        </div>
                        <Skeleton className="bg-bg-subtle w-1/2 h-6" />
                        <Skeleton className="bg-bg-subtle w-full h-6" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="bg-bg-subtle w-full h-50" />
                    </CardContent>
                </CardLayout>
            </DashboardLayout>
        );
    }

    if (!func || !integrationData) {
        return <PageNotFound />;
    }

    const gitDir = `${integrationData?.integration.provider}/${func.type === 'action' ? 'actions' : 'syncs'}/${func.name}`;
    const gitUrl = `${githubRepo}/tree/main/integrations/${gitDir}.ts`;

    return (
        <DashboardLayout>
            <Helmet>
                <title>{func.name} - Nango</title>
            </Helmet>

            <CardLayout>
                <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-2.5">
                            <IntegrationLogo provider={integrationData?.integration.provider} className="size-10.5" />
                            <span className="text-text-primary text-body-large-semi">
                                {integrationData.integration.display_name ?? integrationData.template.display_name}
                            </span>
                            <div className="inline-flex gap-1">
                                <span className="text-text-secondary text-body-medium-regular font-mono">{func.name}</span>
                                <CopyButton text={func.name} />
                            </div>
                        </div>
                        <div className="inline-flex items-center gap-2">
                            {func.enabled && debugMode && (
                                <Button onClick={downloadCode} variant="ghost" size="icon">
                                    <Download />
                                </Button>
                            )}
                            <ConditionalTooltip condition={!func.enabled} content="Enable this function to use it in the Playground.">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={!func.enabled}
                                    onClick={() => {
                                        openPlaygroundWithContext({
                                            integration: integrationData.integration.unique_key,
                                            functionName: func.name,
                                            functionType: func.type as 'action' | 'sync'
                                        });
                                    }}
                                >
                                    Playground <ExternalLink />
                                </Button>
                            </ConditionalTooltip>
                            {func.source !== 'repo' && (func.type === 'sync' || func.type === 'action') && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    loading={isDeleting}
                                    onClick={() =>
                                        confirm({
                                            title: 'Delete function?',
                                            description:
                                                func.type === 'sync'
                                                    ? `You are about to permanently delete the sync "${func.name}" and all of its synced records. This operation is not reversible, are you sure you wish to continue?`
                                                    : `You are about to permanently delete the action "${func.name}". This operation is not reversible, are you sure you wish to continue?`,
                                            confirmButtonText: 'Delete function',
                                            confirmVariant: 'destructive',
                                            onConfirm: onDelete
                                        })
                                    }
                                >
                                    <Trash2 />
                                </Button>
                            )}
                            <FunctionSwitch flow={func} integration={integrationData.integration} />
                        </div>
                    </div>

                    <span className="text-text-secondary text-body-medium-medium">{func.description}</span>

                    <div className="flex flex-wrap gap-4 gap-y-2">
                        <KeyValueBadge label="Type">
                            <span>{func.type}</span>
                        </KeyValueBadge>
                        <KeyValueBadge label="Source code">{func.source === 'repo' ? 'your repo' : 'Nango'}</KeyValueBadge>
                        {func.sync_type && (
                            <KeyValueBadge label="Sync type">
                                <span>{func.sync_type}</span>
                            </KeyValueBadge>
                        )}
                        {func.runs && (
                            <KeyValueBadge label="Frequency">
                                <span>{func.runs}</span>
                            </KeyValueBadge>
                        )}
                        {func.auto_start !== undefined && <KeyValueBadge label="Auto start">{func.auto_start ? 'yes' : 'no'}</KeyValueBadge>}
                        {func.version && <KeyValueBadge label="Version">v{func.version}</KeyValueBadge>}
                        {func.scopes && func.scopes.length > 0 && <KeyValueBadge label="Required scopes">{func.scopes?.join(', ')}</KeyValueBadge>}
                    </div>
                </CardHeader>

                {func.source === 'catalog' && (
                    <CardSubheader>
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-col gap-1">
                                <span className="text-text-primary text-body-medium-semi">Customize this template</span>
                                <Link
                                    to="https://nango.dev/docs/guides/functions/functions-guide#step-by-step-guide"
                                    target="_blank"
                                    className="text-text-tertiary text-body-medium-medium inline-flex items-center gap-1.5"
                                >
                                    Get started with the Nango CLI <ExternalLink className="size-3.5" />
                                </Link>
                            </div>
                            <div className="inline-flex gap-3">
                                <LineSnippet snippet={`nango clone ${gitDir}`} />
                                <ButtonLink to={gitUrl} target="_blank" variant="secondary" size="lg">
                                    View code <ExternalLink />
                                </ButtonLink>
                            </div>
                        </div>
                    </CardSubheader>
                )}

                <CardContent>
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
                        <div className="flex items-center justify-between gap-2">
                            <TabsList className="w-fit gap-0">
                                <TabsTrigger value="input">Input</TabsTrigger>
                                <TabsTrigger value="output">Output</TabsTrigger>
                            </TabsList>
                            {func.type === 'action' ? (
                                <ButtonLink variant="tertiary" to="https://nango.dev/docs/guides/functions/action-functions" target="_blank">
                                    How to use Actions <ExternalLink />
                                </ButtonLink>
                            ) : (
                                <ButtonLink variant="tertiary" to="https://nango.dev/docs/guides/functions/syncs/sync-functions" target="_blank">
                                    How to use Syncs <ExternalLink />
                                </ButtonLink>
                            )}
                        </div>
                        <TabsContent value="input" className="flex flex-col gap-4">
                            {inputSchema ? (
                                <>
                                    <InfoCallout type={func.type as 'action' | 'sync'} variant="input" />
                                    <JsonSchemaTopLevelObject schema={inputSchema} />
                                </>
                            ) : (
                                <EmptyCard>
                                    <span className="text-text-secondary text-body-medium-regular">No inputs.</span>
                                </EmptyCard>
                            )}
                        </TabsContent>
                        <TabsContent value="output" className="flex flex-col gap-4">
                            {outputSchemas && outputSchemas.length > 0 ? (
                                <>
                                    <InfoCallout type={func.type as 'action' | 'sync'} variant="output" />
                                    <Navigation defaultValue={outputSchemas[0].name} orientation="horizontal">
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
                                </>
                            ) : (
                                <EmptyCard>
                                    <span className="text-text-secondary text-body-medium-regular">No outputs.</span>
                                </EmptyCard>
                            )}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </CardLayout>
            {DialogComponent}
        </DashboardLayout>
    );
};

interface FunctionTabAlertProps {
    type: 'action' | 'sync';
    variant: 'input' | 'output';
}

const InfoCallout: React.FC<FunctionTabAlertProps> = ({ type, variant }) => {
    return (
        <Alert variant="info">
            <Info />
            <AlertDescription>
                {type === 'action' && (
                    <>
                        {variant === 'input' && (
                            <p>
                                Actions accept parameters passed directly when calling the{' '}
                                <StyledLink to="https://nango.dev/docs/guides/functions/action-functions#trigger-synchronously" type="external" variant="info">
                                    Nango API
                                </StyledLink>
                                .
                            </p>
                        )}
                        {variant === 'output' && (
                            <p>
                                Actions return a response returned synchronously from the{' '}
                                <StyledLink to="https://nango.dev/docs/guides/functions/action-functions#trigger-synchronously" type="external" variant="info">
                                    Nango API
                                </StyledLink>
                                , or delivered via webhook for{' '}
                                <StyledLink to="https://nango.dev/docs/guides/functions/action-functions#trigger-asynchronously" type="external" variant="info">
                                    async actions
                                </StyledLink>
                                .
                            </p>
                        )}
                    </>
                )}
                {type === 'sync' && (
                    <>
                        {variant === 'input' && (
                            <p>
                                Syncs read input from connection metadata, which must be set via the{' '}
                                <StyledLink
                                    to="https://nango.dev/docs/guides/functions/storage#set-and-update-metadata-from-your-app"
                                    type="external"
                                    variant="info"
                                >
                                    Nango API
                                </StyledLink>{' '}
                                before the sync runs.
                            </p>
                        )}
                        {variant === 'output' && (
                            <p>
                                Syncs write records to the Nango cache, which you fetch via the{' '}
                                <StyledLink to="https://nango.dev/docs/guides/functions/syncs/sync-functions#consume-records" type="external" variant="info">
                                    Nango API
                                </StyledLink>
                                .{' '}
                                <StyledLink to="https://nango.dev/docs/guides/platform/webhooks-from-nango#sync-webhooks" type="external" variant="info">
                                    Webhooks
                                </StyledLink>{' '}
                                can notify you when new data is available.
                            </p>
                        )}
                    </>
                )}
            </AlertDescription>
        </Alert>
    );
};
