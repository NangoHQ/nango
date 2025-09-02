import { useForm } from '@tanstack/react-form';
import { useRef } from 'react';
import { Helmet } from 'react-helmet';

import { ColorInput, isValidCSSColor } from './components/ColorInput';
import { ConnectUIPreview } from './components/ConnectUIPreview';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import LinkWithIcon from '../../components/LinkWithIcon';
import { Checkbox } from '../../components/ui/Checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/Tooltip';
import { Button } from '../../components/ui/button/Button';
import { useConnectUISettings, useUpdateConnectUISettings } from '../../hooks/useConnectUISettings';
import { useEnvironment } from '../../hooks/useEnvironment';
import { useToast } from '../../hooks/useToast';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';

import type { ConnectUIPreviewRef } from './components/ConnectUIPreview';
import type { ConnectUIColorPalette } from '@nangohq/types';

// Utility type to generate all possible theme paths
type ThemePath = {
    [K in keyof ConnectUIColorPalette]: `theme.light.${K}` | `theme.dark.${K}`;
}[keyof ConnectUIColorPalette];

export const ConnectUISettingsPage = () => {
    const toast = useToast();
    const env = useStore((state) => state.env);
    const environment = useEnvironment(env);

    const { data: connectUISettings } = useConnectUISettings(env);
    const { mutate: updateConnectUISettings } = useUpdateConnectUISettings(env);
    const connectUIPreviewRef = useRef<ConnectUIPreviewRef>(null);

    const form = useForm({
        defaultValues: connectUISettings?.data,
        listeners: {
            onChange: (state) => {
                // Send settings changed event to the iFrame
                if (state.formApi.state.isValid && connectUIPreviewRef.current) {
                    connectUIPreviewRef.current.sendSettingsChanged(state.formApi.state.values);
                }
            },
            onChangeDebounceMs: 500
        },
        onSubmit: (state) => {
            updateConnectUISettings(state.formApi.state.values, {
                onSuccess: () => {
                    toast.toast({
                        title: 'Connect UI settings updated',
                        variant: 'success'
                    });
                },
                onError: () => {
                    toast.toast({
                        title: 'Failed to update Connect UI settings',
                        variant: 'error'
                    });
                }
            });
        }
    });

    const lightThemeFields: { name: ThemePath; label: string }[] = [
        {
            name: 'theme.light.background',
            label: 'Background'
        },
        {
            name: 'theme.light.foreground',
            label: 'Foreground'
        },
        {
            name: 'theme.light.primary',
            label: 'Primary'
        },
        {
            name: 'theme.light.primaryForeground',
            label: 'Primary Foreground'
        },
        {
            name: 'theme.light.textPrimary',
            label: 'Text Primary'
        },
        {
            name: 'theme.light.textMuted',
            label: 'Text Muted'
        }
    ];

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.ConnectUI} className="p-6 w-full">
            <Helmet>
                <title>Connect UI - Nango</title>
            </Helmet>
            <div className="flex flex-col h-full">
                <h2 className="mb-8 text-3xl font-semibold tracking-tight text-white">Connect UI Settings</h2>
                <div className="flex justify-center gap-8">
                    {/** Form */}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void form.handleSubmit();
                        }}
                        className="flex flex-col gap-8 mr-24"
                    >
                        {/** Other settings */}
                        <div className="space-y-4">
                            <h2 className="text-lg font-bold text-grayscale-100">Settings</h2>
                            <form.Field name="showWatermark">
                                {(field) => (
                                    <Tooltip delayDuration={0}>
                                        <TooltipTrigger asChild>
                                            <div className="flex gap-2 items-center">
                                                <Checkbox
                                                    id={field.name}
                                                    name={field.name}
                                                    checked={field.state.value}
                                                    onCheckedChange={(checked) => field.handleChange(checked === 'indeterminate' ? true : checked)}
                                                    onBlur={field.handleBlur}
                                                    disabled={!environment.plan?.can_disable_connect_ui_watermark}
                                                />
                                                <label htmlFor={field.name} className={`text-sm font-medium text-grayscale-300`}>
                                                    Show watermark
                                                </label>
                                            </div>
                                        </TooltipTrigger>
                                        {!environment.plan?.can_disable_connect_ui_watermark && (
                                            <TooltipContent className="text-grayscale-300">
                                                Disabling the watermark is only available for Growth plans.{' '}
                                                <LinkWithIcon to={`/${env}/team/billing`}>Upgrade your plan</LinkWithIcon>
                                            </TooltipContent>
                                        )}
                                    </Tooltip>
                                )}
                            </form.Field>
                        </div>

                        {/** Theme */}
                        <div className="space-y-4">
                            <h2 className="text-lg font-bold text-grayscale-100">Theme</h2>
                            <div className="flex gap-8 h-fit">
                                <div className="flex flex-col gap-4">
                                    {lightThemeFields.map((themeField) => (
                                        <Tooltip key={themeField.name} delayDuration={0}>
                                            <TooltipTrigger asChild>
                                                <form.Field
                                                    name={themeField.name}
                                                    validators={{
                                                        onChange: ({ value }: { value: string }) => (!isValidCSSColor(value) ? 'Invalid CSS color' : undefined)
                                                    }}
                                                >
                                                    {(field) => (
                                                        <div className="flex flex-col gap-1">
                                                            <ColorInput
                                                                value={field.state.value}
                                                                label={themeField.label}
                                                                onChange={(e) => field.handleChange(e.target.value)}
                                                                onBlur={field.handleBlur}
                                                                disabled={!environment.plan?.can_customize_connect_ui_theme}
                                                            />
                                                            {!field.state.meta.isValid && (
                                                                <em role="alert" className="text-sm text-red-500">
                                                                    {field.state.meta.errors.join(', ')}
                                                                </em>
                                                            )}
                                                        </div>
                                                    )}
                                                </form.Field>
                                            </TooltipTrigger>
                                            {!environment.plan?.can_customize_connect_ui_theme && (
                                                <TooltipContent side="bottom" className="text-grayscale-300">
                                                    Customizing the theme is only available for Growth plans.{' '}
                                                    <LinkWithIcon to={`/${env}/team/billing`}>Upgrade your plan</LinkWithIcon>
                                                </TooltipContent>
                                            )}
                                        </Tooltip>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/** Save Button */}
                        <form.Subscribe selector={(state) => [state.canSubmit, state.isDirty, state.isSubmitting]}>
                            {([canSubmit, isDirty, isSubmitting]) => (
                                <Button type="submit" variant="primary" size="md" className="self-end" disabled={!canSubmit || !isDirty || isSubmitting}>
                                    {isSubmitting ? 'Saving...' : 'Save settings'}
                                </Button>
                            )}
                        </form.Subscribe>
                    </form>

                    {/** Preview */}
                    <ConnectUIPreview ref={connectUIPreviewRef} className="h-auto w-[500px]" />
                </div>
            </div>
        </DashboardLayout>
    );
};
