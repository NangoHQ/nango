import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import Nango from '@nangohq/frontend';

import { LeftNavBarItems } from '../../components/LeftNavBar';
import { Button } from '../../components/ui/button/Button';
import { Input } from '../../components/ui/input/Input';
import { Checkbox } from '../../components/ui/Checkbox';
import DashboardLayout from '../../layout/DashboardLayout';
import { useConnectUISettings, updateConnectUISettings } from '../../hooks/useConnectUISettings';
import { useToast } from '../../hooks/useToast';
import { useStore } from '../../store';
import { useEnvironment } from '../../hooks/useEnvironment';
import { globalEnv } from '../../utils/env';

import type { ConnectUI } from '@nangohq/frontend';
import { apiConnectSessions } from '../../hooks/useConnect';
import { useUser } from '../../hooks/useUser';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/Tooltip';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../../components/ui/form';
import { DEFAULT_CONNECT_UI_SETTINGS } from '../../constants';

// Color validation function
const isValidColor = (color: string): boolean => {
    if (!color) return true; // Empty values are allowed

    // Check for hex color format (#RRGGBB or #RGB)
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (hexRegex.test(color)) return true;

    // Check for CSS color names
    const tempElement = document.createElement('div');
    tempElement.style.color = color;
    return tempElement.style.color !== '';
};

// Reusable color schema
const colorSchema = z.string().refine((val) => !val || isValidColor(val), {
    message: 'Please enter a valid color code (e.g., #3B82F6, #F00, or CSS color name)'
});

// Form schema with Zod validation
const formSchema = z.object({
    colors: z.object({
        primary: colorSchema,
        onPrimary: colorSchema,
        background: colorSchema,
        surface: colorSchema,
        text: colorSchema,
        textMuted: colorSchema
    }),
    nangoWatermark: z.boolean()
});

type FormData = z.infer<typeof formSchema>;

const ConnectUISettings: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data, mutate } = useConnectUISettings(env);
    const { toast } = useToast();
    const { environmentAndAccount, plan } = useEnvironment(env);
    const [isSaving, setIsSaving] = useState(false);

    // Check if user can disable watermark based on plan feature flag
    const canDisableWatermark = plan?.connectui_disable_watermark ?? false;
    const canCustomizeColors = plan?.connectui_colors_customization ?? false;

    const connectUI = useRef<ConnectUI>();
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const { user } = useUser();

    // Initialize form with react-hook-form and Zod validation
    const form = useForm<FormData>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            colors: {
                primary: DEFAULT_CONNECT_UI_SETTINGS.colors?.primary ?? '',
                onPrimary: DEFAULT_CONNECT_UI_SETTINGS.colors?.onPrimary ?? '',
                background: DEFAULT_CONNECT_UI_SETTINGS.colors?.background ?? '',
                surface: DEFAULT_CONNECT_UI_SETTINGS.colors?.surface ?? '',
                text: DEFAULT_CONNECT_UI_SETTINGS.colors?.text ?? '',
                textMuted: DEFAULT_CONNECT_UI_SETTINGS.colors?.textMuted ?? ''
            },
            nangoWatermark: true
        }
    });

    useEffect(() => {
        if (data?.data) {
            form.reset({
                nangoWatermark: data.data.nangoWatermark,
                colors: {
                    primary: data.data.colors?.primary ?? '',
                    onPrimary: data.data.colors?.onPrimary ?? '',
                    background: data.data.colors?.background ?? '',
                    surface: data.data.colors?.surface ?? '',
                    text: data.data.colors?.text ?? '',
                    textMuted: data.data.colors?.textMuted ?? ''
                }
            });
        }
    }, [data]);

    // Load ConnectUI automatically when component mounts
    useEffect(() => {
        if (environmentAndAccount && user) {
            // Small delay to ensure the DOM is ready
            const timer = setTimeout(() => {
                loadConnectUI();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [environmentAndAccount, user]);

    // Cleanup ConnectUI on unmount
    useEffect(() => {
        return () => {
            if (connectUI.current) {
                connectUI.current.close();
            }
        };
    }, []);

    const onSubmit = async (values: FormData) => {
        setIsSaving(true);
        try {
            await updateConnectUISettings(env, {
                nangoWatermark: values.nangoWatermark,
                colors: {
                    primary: values.colors.primary || null,
                    onPrimary: values.colors.onPrimary || null,
                    background: values.colors.background || null,
                    surface: values.colors.surface || null,
                    text: values.colors.text || null,
                    textMuted: values.colors.textMuted || null
                }
            });
            await mutate(); // Refresh the data

            // Reload ConnectUI to show the updated settings
            if (connectUI.current) {
                connectUI.current.close();
            }
            setTimeout(() => {
                loadConnectUI();
            }, 100);

            toast({
                title: 'Connect UI settings updated successfully',
                variant: 'success'
            });
        } catch {
            toast({
                title: 'Failed to update Connect UI settings',
                variant: 'error'
            });
        } finally {
            setIsSaving(false);
        }
    };

    const hasChanges = () => {
        return form.formState.isDirty;
    };

    const loadConnectUI = async () => {
        if (!environmentAndAccount || !user || !previewContainerRef.current) {
            return;
        }

        const nango = new Nango({
            host: globalEnv.apiUrl,
            websocketsPath: environmentAndAccount.environment.websockets_path || ''
        });

        connectUI.current = nango.embedConnectUI(previewContainerRef.current, {
            baseURL: globalEnv.connectUrl,
            apiURL: globalEnv.apiUrl
        });

        const res = await apiConnectSessions(env, {
            end_user: { id: `test_${user.name.toLocaleLowerCase().replaceAll(' ', '_')}`, email: user.email, display_name: user.name }
        });
        if ('error' in res.json) {
            return;
        }
        connectUI.current.setSessionToken(res.json.data.token);
    };

    const colorFields = [
        {
            key: 'primary',
            label: 'Primary Color',
            description: 'Main brand color used for buttons and highlights',
            defaultColor: DEFAULT_CONNECT_UI_SETTINGS.colors?.primary ?? ''
        },
        {
            key: 'onPrimary',
            label: 'On Primary Color',
            description: 'Text and icon color on primary background',
            defaultColor: DEFAULT_CONNECT_UI_SETTINGS.colors?.onPrimary ?? ''
        },
        {
            key: 'background',
            label: 'Background Color',
            description: 'Main background color of the interface',
            defaultColor: DEFAULT_CONNECT_UI_SETTINGS.colors?.background ?? ''
        },
        {
            key: 'surface',
            label: 'Surface Color',
            description: 'Color for cards, panels, and elevated surfaces',
            defaultColor: DEFAULT_CONNECT_UI_SETTINGS.colors?.surface ?? ''
        },
        {
            key: 'text',
            label: 'Text Color',
            description: 'Primary text color titles and headings',
            defaultColor: DEFAULT_CONNECT_UI_SETTINGS.colors?.text ?? ''
        },
        {
            key: 'textMuted',
            label: 'Muted Text Color',
            description: 'Secondary text color for content',
            defaultColor: DEFAULT_CONNECT_UI_SETTINGS.colors?.textMuted ?? ''
        }
    ] as const;

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.ConnectUI}>
            <Helmet>
                <title>Connect UI Settings - Nango</title>
            </Helmet>
            <div className="flex flex-row gap-4">
                <div className="flex flex-col gap-2">
                    <h2 className="text-3xl font-semibold text-white flex gap-4 items-center">Connect UI Settings</h2>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-md">
                            <div className="space-y-6">
                                <div className="pb-6 border-b border-gray-700">
                                    <Tooltip delayDuration={0}>
                                        {!canDisableWatermark && (
                                            <TooltipContent>
                                                <div className="space-y-2">
                                                    <p className="text-sm text-gray-300">
                                                        Disabling the watermark is only available on paid plans.{' '}
                                                        <a href="/team/billing" className="text-sm font-bold underline">
                                                            Manage plan
                                                        </a>
                                                    </p>
                                                </div>
                                            </TooltipContent>
                                        )}
                                        <TooltipTrigger asChild>
                                            <FormField
                                                control={form.control}
                                                name="nangoWatermark"
                                                render={({ field }) => (
                                                    <div className="flex items-center space-x-3">
                                                        <Checkbox disabled={!canDisableWatermark} checked={field.value} onCheckedChange={field.onChange} />
                                                        <div className="space-y-1">
                                                            <label
                                                                htmlFor="nangoWatermark"
                                                                className={`text-sm font-medium ${canDisableWatermark ? 'text-gray-300' : 'text-gray-500'}`}
                                                            >
                                                                Show Nango Watermark
                                                            </label>
                                                        </div>
                                                    </div>
                                                )}
                                            />
                                        </TooltipTrigger>
                                    </Tooltip>
                                </div>

                                {colorFields.map(({ key, label, description, defaultColor }) => (
                                    <FormField
                                        key={key}
                                        control={form.control}
                                        name={`colors.${key}`}
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className={`block text-sm font-medium mb-2 text-gray-300`}>{label}</FormLabel>
                                                <Tooltip delayDuration={0}>
                                                    {!canCustomizeColors && (
                                                        <TooltipContent>
                                                            <div className="space-y-2">
                                                                <p className="text-sm text-gray-300">
                                                                    Customizing colors is only available on the Growth plan.{' '}
                                                                    <a href="/team/billing" className="text-sm font-bold underline">
                                                                        Manage plan
                                                                    </a>
                                                                </p>
                                                            </div>
                                                        </TooltipContent>
                                                    )}
                                                    <TooltipTrigger asChild>
                                                        <div className="flex gap-3 items-center">
                                                            <div
                                                                className="w-10 h-10 rounded border border-gray-600 flex-shrink-0"
                                                                style={{
                                                                    backgroundColor: form.watch(`colors.${key}`) || defaultColor
                                                                }}
                                                                title={form.watch(`colors.${key}`) || defaultColor}
                                                            />
                                                            <FormControl className="flex-1">
                                                                <Input
                                                                    type="text"
                                                                    placeholder={defaultColor}
                                                                    variant="black"
                                                                    className={`w-full ${form.getFieldState(field.name).error ? 'border-red-500' : ''}`}
                                                                    disabled={!canCustomizeColors}
                                                                    {...field}
                                                                />
                                                            </FormControl>
                                                        </div>
                                                    </TooltipTrigger>
                                                    <FormDescription className="text-gray-500">{description}</FormDescription>
                                                    <FormMessage className="text-red-500" />
                                                </Tooltip>
                                            </FormItem>
                                        )}
                                    />
                                ))}
                            </div>

                            <div className="pt-6 border-t border-gray-700">
                                <Button type="submit" isLoading={isSaving} disabled={!hasChanges()} className="w-full md:w-auto">
                                    Save Settings
                                </Button>
                            </div>
                        </form>
                    </Form>
                </div>

                {/* Connect UI Preview Section */}
                <div className="flex-1">
                    <div className="sticky w-full top-0 py-8 flex items-center justify-center">
                        <div ref={previewContainerRef} className="w-full h-[600px]" />
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
};

export default ConnectUISettings;
