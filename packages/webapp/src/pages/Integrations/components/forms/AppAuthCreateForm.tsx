import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLinkIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import z from 'zod';

import { Alert, AlertActions, AlertDescription, AlertTitle, Button, FieldLabel, InputGroup, InputGroupInput, InputGroupTextarea } from '@nangohq/design-system';

import { AlertButtonLink } from '@/components/ui/AlertButtonLink';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components/ui/Navigation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { NangoProvidedInput } from '../NangoProvidedInput';

import type { ApiProviderListItem, PostIntegration } from '@nangohq/types';

const formSchema = z.object({
    appId: z.string().optional(),
    appLink: z.string().url('Must be a valid URL (e.g., https://example.com)').optional(),
    privateKey: z.string().startsWith('-----BEGIN RSA PRIVATE KEY-----').endsWith('-----END RSA PRIVATE KEY-----').optional()
});

type FormData = z.infer<typeof formSchema>;

export const AppAuthCreateForm: React.FC<{ provider: ApiProviderListItem; onSubmit?: (data: PostIntegration['Body']) => Promise<void> }> = ({
    provider,
    onSubmit
}) => {
    const form = useForm({
        resolver: zodResolver(formSchema)
    });

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
            await onSubmit?.({
                provider: provider.name,
                useSharedCredentials: false,
                auth: {
                    authType: provider.authMode as Extract<typeof provider.authMode, 'APP'>,
                    appId: formData.appId,
                    appLink: formData.appLink,
                    privateKey: formData.privateKey
                }
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Navigation defaultValue={provider.preConfigured ? 'template' : 'custom'} orientation="horizontal">
            <NavigationList>
                {provider.preConfigured ? (
                    <NavigationTrigger value="template">Nango developer app</NavigationTrigger>
                ) : (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span>
                                <NavigationTrigger value="template" disabled>
                                    Nango developer app
                                </NavigationTrigger>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Nango doesn&apos;t provide test credentials for this API yet</TooltipContent>
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
                            <FieldLabel htmlFor="app_id">App ID</FieldLabel>
                            <NangoProvidedInput id="app_id" fakeValueSize={12} />
                        </div>

                        <div className="flex flex-col gap-2">
                            <FieldLabel htmlFor="app_link">App public link</FieldLabel>
                            <NangoProvidedInput fakeValueSize={24} />
                        </div>

                        <div className="flex flex-col gap-2">
                            <FieldLabel htmlFor="private_key">App private key</FieldLabel>
                            <NangoProvidedInput fakeValueSize={48} />
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
                        <AlertDescription>Follow our step by step guide to use your own GitHub App.</AlertDescription>
                        <AlertActions>
                            <AlertButtonLink to={provider.docs} target="_blank">
                                Go <ExternalLinkIcon />
                            </AlertButtonLink>
                        </AlertActions>
                    </Alert>

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmitForm)} className="flex flex-col gap-8">
                            <div className="flex flex-col gap-5">
                                <FormField
                                    control={form.control}
                                    name="appId"
                                    render={({ field, fieldState }) => (
                                        <FormItem>
                                            <div className="flex gap-2 items-center">
                                                <FormLabel>App ID</FormLabel>
                                                <InfoTooltip>Obtain the app id from the app page.</InfoTooltip>
                                            </div>
                                            <FormControl>
                                                <InputGroup>
                                                    <InputGroupInput {...field} aria-invalid={!!fieldState.error} />
                                                </InputGroup>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="appLink"
                                    render={({ field, fieldState }) => (
                                        <FormItem>
                                            <div className="flex gap-2 items-center">
                                                <FormLabel>App public link</FormLabel>
                                                <InfoTooltip>Obtain the app public link from the app page.</InfoTooltip>
                                            </div>
                                            <FormControl>
                                                <InputGroup>
                                                    <InputGroupInput {...field} aria-invalid={!!fieldState.error} />
                                                </InputGroup>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="privateKey"
                                    render={({ field, fieldState }) => (
                                        <FormItem>
                                            <div className="flex gap-2 items-center">
                                                <FormLabel>App private key</FormLabel>
                                                <InfoTooltip>
                                                    Obtain the app private key from the app page by downloading the private key and pasting the entirety of its
                                                    contents here.
                                                </InfoTooltip>
                                            </div>
                                            <FormControl>
                                                <InputGroup>
                                                    <InputGroupTextarea {...field} aria-invalid={!!fieldState.error} />
                                                </InputGroup>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
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
