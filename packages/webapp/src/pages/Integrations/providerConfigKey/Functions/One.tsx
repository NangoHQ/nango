import { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';

import { EmptyCard } from '../../components/EmptyCard';
import { FunctionSwitch } from '../../components/FunctionSwitch';
import { IntegrationsBadge } from '../../components/IntegrationsBadge';
import { JsonSchemaTopLevelObject } from '../../components/jsonSchema/JsonSchema';
import { isNullSchema, isObjectWithNoProperties } from '../../components/jsonSchema/utils';
import { CopyButton } from '@/components-v2/CopyButton';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components-v2/Navigation';
import { useHashNavigation } from '@/hooks/useHashNavigation';
import { useGetIntegration, useGetIntegrationFlows } from '@/hooks/useIntegration';
import DashboardLayout from '@/layout/DashboardLayout';
import PageNotFound from '@/pages/PageNotFound';
import { useStore } from '@/store';

import type { JSONSchema7 } from 'json-schema';

export const FunctionsOne: React.FC = () => {
    const { providerConfigKey, functionName } = useParams();

    const env = useStore((state) => state.env);
    const { data: integrationData, loading: integrationLoading } = useGetIntegration(env, providerConfigKey!);
    const { data, loading: flowsLoading } = useGetIntegrationFlows(env, providerConfigKey!);

    const func = useMemo(() => {
        return data?.flows.find((flow) => flow.name === functionName);
    }, [data, functionName]);

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

    if (integrationLoading || flowsLoading) {
        // TODO: improve loading state
        return <>Loading...</>;
    }

    if (!func || !integrationData) {
        return <PageNotFound />;
    }

    return (
        <DashboardLayout>
            <Helmet>
                <title>{func.name} - Nango</title>
            </Helmet>

            <header className="flex flex-col">
                <div className="flex flex-col gap-6 px-11 py-8 bg-bg-elevated border border-b-0 border-border-muted rounded-t-md">
                    <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex gap-2">
                            <IntegrationLogo provider={integrationData?.integration.provider} className="size-10.5" />
                            <div className="flex flex-col gap-0.5">
                                <span className="text-text-primary text-body-medium-semi">
                                    {integrationData.integration.display_name ?? integrationData.template.display_name}
                                </span>
                                <div className="inline-flex gap-1">
                                    <span className="text-text-secondary text-body-medium-regular font-mono">{func.name}</span>
                                    <CopyButton text={func.name} />
                                </div>
                            </div>
                        </div>
                        <FunctionSwitch flow={func} integration={integrationData.integration} />
                    </div>

                    <div className="flex flex-wrap gap-4 gap-y-2">
                        <IntegrationsBadge label="Type">
                            <span>{func.type}</span>
                        </IntegrationsBadge>
                        {func.sync_type && (
                            <IntegrationsBadge label="Sync type">
                                <span>{func.sync_type}</span>
                            </IntegrationsBadge>
                        )}
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
                    <span className="text-text-tertiary text-body-medium-medium">{func.description}</span>
                </div>

                <div className="px-11 py-8 border border-t-0 border-border-muted rounded-b-md">
                    <Navigation value={activeTab} onValueChange={setActiveTab} orientation="horizontal">
                        <NavigationList>
                            <NavigationTrigger value="input">Input</NavigationTrigger>
                            <NavigationTrigger value="output">Output</NavigationTrigger>
                        </NavigationList>
                        <NavigationContent value="input">
                            {inputSchema ? <JsonSchemaTopLevelObject schema={inputSchema} /> : <EmptyCard content={`No inputs.`} />}
                        </NavigationContent>
                        <NavigationContent value="output">
                            {outputSchemas && outputSchemas.length > 0 ? (
                                <Navigation defaultValue={outputSchemas[0].name} orientation="horizontal">
                                    <NavigationList>
                                        {outputSchemas.map((outputSchema) => (
                                            <NavigationTrigger key={outputSchema.name} value={outputSchema.name}>
                                                {outputSchema.name}
                                            </NavigationTrigger>
                                        ))}
                                    </NavigationList>
                                    {outputSchemas.map((outputSchema) => (
                                        <NavigationContent key={outputSchema.name} value={outputSchema.name}>
                                            <JsonSchemaTopLevelObject schema={outputSchema.schema} />
                                        </NavigationContent>
                                    ))}
                                </Navigation>
                            ) : (
                                <EmptyCard content="No outputs." />
                            )}
                        </NavigationContent>
                    </Navigation>
                </div>
            </header>
        </DashboardLayout>
    );
};
