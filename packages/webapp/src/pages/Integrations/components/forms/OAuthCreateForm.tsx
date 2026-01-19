import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLinkIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import z from 'zod';

import { NangoProvidedInput } from '../NangoProvidedInput';
import { Navigation, NavigationContent, NavigationList, NavigationTrigger } from '@/components-v2/Navigation';
import { ScopesInput } from '@/components-v2/ScopesInput';
import { SecretInput } from '@/components-v2/SecretInput';
import { Alert, AlertActions, AlertButtonLink, AlertDescription, AlertTitle } from '@/components-v2/ui/alert';
import { Button } from '@/components-v2/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components-v2/ui/form';
import { InputGroup, InputGroupInput } from '@/components-v2/ui/input-group';
import { Label } from '@/components-v2/ui/label';

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

    const [loading, setLoading] = useState(false);

    const onCreatePreProvisioned = async () => {
        setLoading(true);
        await onSubmit?.({
            provider: provider.name,
            useSharedCredentials: true
        });
        setLoading(false);
    };

    const onSubmitForm = async (formData: FormData) => {
        setLoading(true);
        try {
            await onSubmit?.({
                provider: provider.name,
                useSharedCredentials: false,
                auth: {
                    authType: provider.authMode as Extract<typeof provider.authMode, 'OAUTH1' | 'OAUTH2' | 'TBA'>,
                    clientId: formData.clientId,
                    clientSecret: formData.clientSecret,
                    scopes: formData.scopes
                }
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Navigation defaultValue="template" orientation="horizontal">
            <NavigationList>
                <NavigationTrigger value="template">Nango developer app</NavigationTrigger>
                <NavigationTrigger value="custom">Custom developer app</NavigationTrigger>
            </NavigationList>
            <NavigationContent value="template">
                <div className="flex flex-col gap-8">
                    <Alert variant="info">
                        <AlertDescription>Nango provides developer apps for testing. Use your own developer app for production.</AlertDescription>
                    </Alert>

                    <div className="flex flex-col gap-5">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="client_id">Client ID</Label>
                            <NangoProvidedInput fakeValueSize={24} />
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label htmlFor="client_secret">Client secret</Label>
                            <NangoProvidedInput fakeValueSize={48} />
                        </div>

                        <div className="flex flex-col gap-2">
                            <Label htmlFor="scopes">Scopes</Label>
                            <ScopesInput isSharedCredentials scopesString={provider.preConfiguredScopes.join(',')} />
                        </div>
                    </div>

                    <Button loading={loading} onClick={onCreatePreProvisioned}>
                        Create
                    </Button>
                </div>
            </NavigationContent>
            <NavigationContent value="custom">
                <div className="flex flex-col gap-8">
                    <Alert variant="info">
                        <AlertTitle>Developer app setup guide</AlertTitle>
                        <AlertDescription>Follow our step by step guide to use your own OAuth app.</AlertDescription>
                        <AlertActions>
                            <AlertButtonLink to={provider.docs} target="_blank" variant="info-secondary">
                                Go <ExternalLinkIcon />
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
                                                <ScopesInput scopesString={field.value} onChange={(scopes) => Promise.resolve(field.onChange(scopes))} />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <Button type="submit" loading={loading}>
                                Create
                            </Button>
                        </form>
                    </Form>
                </div>
            </NavigationContent>
        </Navigation>
    );
};
