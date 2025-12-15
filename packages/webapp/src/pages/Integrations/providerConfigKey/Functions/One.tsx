import { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';

import { EmptyCard } from '../../components/EmptyCard';
import { IntegrationsBadge } from '../../components/IntegrationsBadge';
import { JsonSchemaTopLevelObject } from '../../components/jsonSchema/JsonSchema';
import { isNullSchema, isObjectWithNoProperties } from '../../components/jsonSchema/utils';
import { CopyButton } from '@/components-v2/CopyButton';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components-v2/Navigation';
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

    const inputSchema = useMemo(() => {
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

    const outputSchema = useMemo(() => {
        if (!func || !func.returns || !func.json_schema) {
            return null;
        }
        const { returns, json_schema } = func;

        const outputSchema = json_schema.definitions?.[returns[0]] ?? null;
        if (!outputSchema || isNullSchema(outputSchema as JSONSchema7) || isObjectWithNoProperties(outputSchema as JSONSchema7)) {
            return null;
        }
        return outputSchema as JSONSchema7;
    }, [func]);

    if (integrationLoading || flowsLoading) {
        // TODO: improve loading state
        return <>Loading...</>;
    }

    if (!func || !integrationData) {
        return <PageNotFound />;
    }

    const inputTab = func.type === 'action' ? 'inputs' : 'metadata';
    const inputTabLabel = func.type === 'action' ? 'Inputs' : 'Metadata';
    const defaultTab = inputSchema ? inputTab : outputSchema ? 'outputs' : undefined;

    return (
        <DashboardLayout>
            <Helmet>
                <title>{func.name} - Nango</title>
            </Helmet>

            <header className="flex flex-col">
                <div className="flex flex-col gap-6 px-11 py-8 bg-bg-elevated border border-b-0 border-border-muted rounded-t-md">
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
                    <Navigation defaultValue={defaultTab} orientation="horizontal">
                        <NavigationList>
                            <NavigationTrigger value={inputTab}>{inputTabLabel}</NavigationTrigger>
                            <NavigationTrigger value="outputs">Outputs</NavigationTrigger>
                        </NavigationList>
                        <NavigationContent value={inputTab}>
                            {inputSchema ? <JsonSchemaTopLevelObject schema={inputSchema} /> : <EmptyCard content={`No ${inputTabLabel.toLowerCase()}.`} />}
                        </NavigationContent>
                        <NavigationContent value="outputs">
                            {outputSchema ? <JsonSchemaTopLevelObject schema={outputSchema} /> : <EmptyCard content="No outputs." />}
                        </NavigationContent>
                    </Navigation>
                </div>
            </header>
        </DashboardLayout>
    );
};
