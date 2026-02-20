import { ExternalLink, Info } from 'lucide-react';
import { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useParams } from 'react-router-dom';

import { CardContent, CardHeader, CardLayout, CardSubheader } from '../../components/CardLayout';
import { EmptyCard } from '../../components/EmptyCard';
import { FunctionSwitch } from '../../components/FunctionSwitch';
import { IntegrationsBadge } from '../../components/IntegrationsBadge';
import { JsonSchemaTopLevelObject } from '../../components/jsonSchema/JsonSchema';
import { isNullSchema, isObjectWithNoProperties } from '../../components/jsonSchema/utils';
import { CopyButton } from '@/components-v2/CopyButton';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { LineSnippet } from '@/components-v2/LineSnippet';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components-v2/Navigation';
import { StyledLink } from '@/components-v2/StyledLink';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components-v2/Tabs';
import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { ButtonLink } from '@/components-v2/ui/button';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { INTEGRATION_TEMPLATES_GITHUB_URL } from '@/constants';
import { useHashNavigation } from '@/hooks/useHashNavigation';
import { useGetIntegration, useGetIntegrationFlows } from '@/hooks/useIntegration';
import DashboardLayout from '@/layout/DashboardLayout';
import PageNotFound from '@/pages/PageNotFound';
import { useStore } from '@/store';

import type { JSONSchema7 } from 'json-schema';

export const FunctionsOne: React.FC = () => {
    const { providerConfigKey, functionName } = useParams();

    const env = useStore((state) => state.env);
    const { data: integrationResponse, isPending: integrationLoading } = useGetIntegration(env, providerConfigKey!);
    const integrationData = integrationResponse?.data;
    const { data: flowsResponse, isLoading: flowsLoading } = useGetIntegrationFlows(env, providerConfigKey!);
    const flowsData = flowsResponse?.data;

    const func = flowsData?.flows.find((flow) => flow.name === functionName);

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
    const gitUrl = `${INTEGRATION_TEMPLATES_GITHUB_URL}/tree/main/integrations/${gitDir}.ts`;

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
                        <FunctionSwitch flow={func} integration={integrationData.integration} />
                    </div>

                    <span className="text-text-secondary text-body-medium-medium">{func.description}</span>

                    <div className="flex flex-wrap gap-4 gap-y-2">
                        <IntegrationsBadge label="Type">
                            <span>{func.type}</span>
                        </IntegrationsBadge>
                        {func.runs && (
                            <IntegrationsBadge label="Frequency">
                                <span>{func.runs}</span>
                            </IntegrationsBadge>
                        )}
                        {func.auto_start !== undefined && <IntegrationsBadge label="Auto start">{func.auto_start ? 'yes' : 'no'}</IntegrationsBadge>}
                        <IntegrationsBadge label="Source">{func.pre_built ? 'template' : 'custom'}</IntegrationsBadge>
                        {func.version && <IntegrationsBadge label="Version">v{func.version}</IntegrationsBadge>}
                        {func.scopes && func.scopes.length > 0 && <IntegrationsBadge label="Required scopes">{func.scopes?.join(', ')}</IntegrationsBadge>}
                    </div>
                </CardHeader>

                {func.pre_built && (
                    <CardSubheader>
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-col gap-1">
                                <span className="text-text-primary text-body-medium-semi">Customize this template</span>
                                <Link
                                    to="https://nango.dev/docs/implementation-guides/platform/functions/functions-setup"
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
                                <ButtonLink
                                    variant="tertiary"
                                    to="https://nango.dev/docs/implementation-guides/use-cases/actions/implement-an-action"
                                    target="_blank"
                                >
                                    How to use Actions <ExternalLink />
                                </ButtonLink>
                            ) : (
                                <ButtonLink
                                    variant="tertiary"
                                    to="https://nango.dev/docs/implementation-guides/use-cases/syncs/implement-a-sync"
                                    target="_blank"
                                >
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
                                <EmptyCard content={`No inputs.`} />
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
                                <EmptyCard content="No outputs." />
                            )}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </CardLayout>
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
                                <StyledLink
                                    to="https://nango.dev/docs/implementation-guides/use-cases/actions/implement-an-action#triggering-an-action-synchronously"
                                    type="external"
                                    variant="info"
                                >
                                    Nango API
                                </StyledLink>
                                .
                            </p>
                        )}
                        {variant === 'output' && (
                            <p>
                                Actions return a response returned synchronously from the{' '}
                                <StyledLink
                                    to="https://nango.dev/docs/implementation-guides/use-cases/actions/implement-an-action#triggering-an-action-synchronously"
                                    type="external"
                                    variant="info"
                                >
                                    Nango API
                                </StyledLink>
                                , or delivered via webhook for{' '}
                                <StyledLink to="https://nango.dev/docs/implementation-guides/use-cases/actions/async-actions" type="external" variant="info">
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
                                    to="https://nango.dev/docs/implementation-guides/use-cases/customer-configuration#store-customer-specific-data"
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
                                <StyledLink
                                    to="https://nango.dev/docs/implementation-guides/use-cases/syncs/implement-a-sync#step-2-fetch-the-latest-data-from-nango"
                                    type="external"
                                    variant="info"
                                >
                                    Nango API
                                </StyledLink>
                                .{' '}
                                <StyledLink
                                    to="https://nango.dev/docs/implementation-guides/use-cases/syncs/implement-a-sync#step-1-setup-webhooks-from-nango"
                                    type="external"
                                    variant="info"
                                >
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
