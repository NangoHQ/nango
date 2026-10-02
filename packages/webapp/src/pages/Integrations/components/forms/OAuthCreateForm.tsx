import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLinkIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import z from 'zod';

import {
    Alert,
    AlertActions,
    AlertDescription,
    AlertTitle,
    Button,
    FieldLabel,
    InputGroup,
    InputGroupInput,
    Tooltip,
    TooltipContent,
    TooltipTrigger
} from '@nangohq/design-system';

import { ScopesInput } from '@/components/patterns/ScopesInput';
import { SecretInput } from '@/components/patterns/SecretInput';
import { AlertButtonLink } from '@/components/ui/AlertButtonLink';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/Form';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components/ui/Navigation';
import { NangoProvidedInput } from '../NangoProvidedInput';
import {
    buildIntegrationConfigSchema,
    filterVisibleIntegrationConfig,
    IntegrationConfigFormFields,
    useIntegrationConfigFormPieces
} from './IntegrationConfigFields';

import type { ApiProviderListItem, PostIntegration } from '@nangohq/types';

interface Props {
    provider: ApiProviderListItem;
    onSubmit?: (data: PostIntegration['Body']) => Promise<void>;
}

const formSchema = z.object({
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    scopes: z.string().optional()
});

type FormData = z.infer<typeof formSchema>;

export const OAuthCreateForm: React.FC<Props> = ({ provider, onSubmit }) => {
    const form = useForm({
        resolver: zodResolver(formSchema)
    });

    const {
        fields: configFields,
        schemaMap: configSchemaMap,
        defaultValues: configDefaultValues
    } = useIntegrationConfigFormPieces(provider.integration_config);
    const hasIntegrationConfig = configFields.length > 0;
    const canUseSharedCredentials = provider.preConfigured && !hasIntegrationConfig;
    const integrationConfigSchema = useMemo(() => buildIntegrationConfigSchema(configFields, configSchemaMap), [configFields, configSchemaMap]);
    const integrationConfigForm = useForm({ resolver: zodResolver(integrationConfigSchema), defaultValues: configDefaultValues });
    const watchedConfig = integrationConfigForm.watch();

    const [loading, setLoading] = useState(false);

    const onCreatePreProvisioned = async () => {
        setLoading(true);
        try {
            await onSubmit?.({
                provider: provider.name,
                useSharedCredentials: true
            });
        } finally {
            setLoading(false);
        }
    };

    const onSubmitForm = async (formData: FormData) => {
        setLoading(true);
        try {
            let integrationConfig: Record<string, string> | undefined;
            if (hasIntegrationConfig) {
                const valid = await integrationConfigForm.trigger();
                if (!valid) {
                    return;
                }
                integrationConfig = filterVisibleIntegrationConfig(integrationConfigForm.getValues(), configSchemaMap);
            }

            await onSubmit?.({
                provider: provider.name,
                useSharedCredentials: false,
                auth: {
                    authType: provider.authMode as Extract<typeof provider.authMode, 'OAUTH1' | 'OAUTH2' | 'TBA'>,
                    clientId: formData.clientId,
                    clientSecret: formData.clientSecret,
                    scopes: formData.scopes
                },
                ...(integrationConfig && { integrationConfig })
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Navigation defaultValue={canUseSharedCredentials ? 'template' : 'custom'} orientation="horizontal">
            <NavigationList>
                {canUseSharedCredentials ? (
                    <NavigationTrigger value="template">Nango developer app</NavigationTrigger>
                ) : (
                    <Tooltip>
                        <TooltipTrigger>
                            <NavigationTrigger value="template" disabled>
                                Nango developer app
                            </NavigationTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            {hasIntegrationConfig
                                ? 'This integration requires configuration only available with your own developer app'
                                : "Nango doesn't provide test credentials for this API yet"}
                        </TooltipContent>
                    </Tooltip>
                )}
                <NavigationTrigger value="custom">Custom developer app</NavigationTrigger>
            </NavigationList>
            <NavigationContent value="template">
                <div className="flex flex-col gap-8">
                    <Alert variant="info">
                        <AlertDescription>Nango provides developer apps for testing. Use your own developer app for production.</AlertDescription>
                    </Alert>

                    <div className="flex flex-col gap-5">
                        <div className="flex flex-col gap-2">
                            <FieldLabel htmlFor="client_id">Client ID</FieldLabel>
                            <NangoProvidedInput fakeValueSize={24} />
                        </div>

                        <div className="flex flex-col gap-2">
                            <FieldLabel htmlFor="client_secret">Client secret</FieldLabel>
                            <NangoProvidedInput fakeValueSize={48} />
                        </div>

                        <div className="flex flex-col gap-2">
                            <FieldLabel htmlFor="scopes">Scopes</FieldLabel>
                            <ScopesInput isSharedCredentials scopesString={provider.preConfiguredScopes.join(',')} />
                        </div>
                    </div>

                    <div>
                        <Button loading={loading} onClick={onCreatePreProvisioned}>
                            Create
                        </Button>
                    </div>
                </div>
            </NavigationContent>
            <NavigationContent value="custom">
                <div className="flex flex-col gap-8">
                    <Alert variant="info">
                        <AlertTitle>Developer app setup guide</AlertTitle>
                        <AlertDescription>Follow our step by step guide to use your own OAuth app.</AlertDescription>
                        <AlertActions>
                            <AlertButtonLink to={provider.docs} target="_blank">
                                View setup guide <ExternalLinkIcon />
                            </AlertButtonLink>
                        </AlertActions>
                    </Alert>

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmitForm)} className="flex flex-col gap-8">
                            <div className="flex flex-col gap-5">
                                <FormField
                                    control={form.control}
                                    name="clientId"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Client ID</FormLabel>
                                            <FormControl>
                                                <InputGroup>
                                                    <InputGroupInput {...field} />
                                                </InputGroup>
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="clientSecret"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Client secret</FormLabel>
                                            <FormControl>
                                                <SecretInput {...field} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="scopes"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Scopes</FormLabel>
                                            <FormControl>
                                                <ScopesInput
                                                    scopesString={field.value}
                                                    onChange={(scopes) => Promise.resolve(field.onChange(scopes))}
                                                    availableScopes={provider.availableScopes}
                                                    showAvailableScopesDropdown={true}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />

                                {hasIntegrationConfig && (
                                    <Form {...integrationConfigForm}>
                                        <IntegrationConfigFormFields
                                            control={integrationConfigForm.control}
                                            fields={configFields}
                                            schemaMap={configSchemaMap}
                                            watched={watchedConfig}
                                        />
                                    </Form>
                                )}
                            </div>

                            <div>
                                <Button type="submit" loading={loading}>
                                    Create
                                </Button>
                            </div>
                        </form>
                    </Form>
                </div>
            </NavigationContent>
        </Navigation>
    );
};
