import { useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { useParams } from 'react-router-dom';

import { IntegrationsBadge } from '../../components/IntegrationsBadge';
import { JsonSchemaTopLevelObject } from '../../components/jsonSchema/JsonSchema';
import { isNullSchema } from '../../components/jsonSchema/utils';
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
        if (!inputSchema || isNullSchema(inputSchema as JSONSchema7)) {
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
        if (!outputSchema || isNullSchema(outputSchema as JSONSchema7)) {
            return null;
        }
        return outputSchema as JSONSchema7;
    }, [func]);

    const defaultTab = inputSchema ? 'inputs' : outputSchema ? 'outputs' : undefined;

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
                    <div className="inline-flex gap-2">
                        <IntegrationLogo provider={integrationData?.integration.provider} className="size-10.5" />
                        <div className="flex flex-col gap-0.5">
                            <span className="text-text-primary text-body-medium-semi">
                                {integrationData.integration.display_name ?? integrationData.template.display_name}
                            </span>
                            <div className="inline-flex gap-1">
                                <span className="text-text-secondary text-body-medium-regular">{func.name}</span>
                                <CopyButton text={func.name} />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-4 gap-y-2">
                        <IntegrationsBadge label="Type" className="capitalize">
                            {func.type}
                        </IntegrationsBadge>
                        {func.sync_type && <IntegrationsBadge label="Sync type">{func.sync_type}</IntegrationsBadge>}
                        {func.runs && (
                            <IntegrationsBadge label="Frequency" className="capitalize">
                                {func.runs}
                            </IntegrationsBadge>
                        )}
                        {func.auto_start !== undefined && <IntegrationsBadge label="Auto start">{func.auto_start ? 'Yes' : 'No'}</IntegrationsBadge>}
                        <IntegrationsBadge label="Source">{func.pre_built ? 'Template' : 'Custom'}</IntegrationsBadge>
                        {func.version && <IntegrationsBadge label="Version">{func.version}</IntegrationsBadge>}
                        {func.scopes && func.scopes.length > 0 && <IntegrationsBadge label="Required scopes">{func.scopes?.join(', ')}</IntegrationsBadge>}
                    </div>
                    <span className="text-text-tertiary text-body-medium-medium">{func.description}</span>
                </div>

                <div className="px-11 py-8 border border-t-0 border-border-muted rounded-b-md">
                    <Navigation defaultValue={defaultTab} orientation="horizontal">
                        <NavigationList>
                            {inputSchema && <NavigationTrigger value="inputs">Inputs</NavigationTrigger>}
                            {outputSchema && <NavigationTrigger value="outputs">Outputs</NavigationTrigger>}
                        </NavigationList>
                        {inputSchema && (
                            <NavigationContent value="inputs">
                                <JsonSchemaTopLevelObject schema={inputSchema} />
                            </NavigationContent>
                        )}
                        {outputSchema && (
                            <NavigationContent value="outputs">
                                <JsonSchemaTopLevelObject schema={outputSchema} />
                            </NavigationContent>
                        )}
                    </Navigation>
                </div>
            </header>
        </DashboardLayout>
    );
};
