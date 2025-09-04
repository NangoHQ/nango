import { useForm } from '@tanstack/react-form';
import { useRef } from 'react';
import { Helmet } from 'react-helmet';

import { ColorInput, isValidCSSColor } from './components/ColorInput';
import { ConnectUIPreview } from './components/ConnectUIPreview';
import { LeftNavBarItems } from '../../components/LeftNavBar';
import LinkWithIcon from '../../components/LinkWithIcon';
import { Switch } from '../../components/ui/Switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/Tooltip';
import { Button } from '../../components/ui/button/Button';
import { useConnectUISettings, useUpdateConnectUISettings } from '../../hooks/useConnectUISettings';
import { useEnvironment } from '../../hooks/useEnvironment';
import { useToast } from '../../hooks/useToast';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { cn } from '../../utils/utils';

import type { ConnectUIPreviewRef } from './components/ConnectUIPreview';
import type { ConnectUIColorPalette } from '@nangohq/types';

// Utility type to generate all possible theme paths
type ThemePath = {
    [K in keyof ConnectUIColorPalette]: `theme.light.${K}` | `theme.dark.${K}`;
}[keyof ConnectUIColorPalette];

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

export const ConnectUISettingsPage = () => {
    const toast = useToast();
    const env = useStore((state) => state.env);
    const environment = useEnvironment(env);

    const { data: connectUISettings } = useConnectUISettings(env);
    const { mutate: updateConnectUISettings, isPending: isUpdatingConnectUISettings } = useUpdateConnectUISettings(env);
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
                    state.formApi.reset(state.formApi.state.values);
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

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.ConnectUI} fullWidth className="h-full">
            <Helmet>
                <title>Connect UI - Nango</title>
            </Helmet>
            <div className="flex h-full w-full bg-dark-surface-gradient">
                {/** Form */}
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void form.handleSubmit();
                    }}
                    className="flex-1 w-1/2 h-full flex flex-col gap-10 p-11"
                >
                    <h2 className="title-subsection text-primary">Connect UI settings</h2>
                    {/** Theme */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                        {lightThemeFields.map((themeField, index) => (
                            <Tooltip key={themeField.name} delayDuration={0}>
                                <TooltipTrigger asChild>
                                    <form.Field
                                        name={themeField.name}
                                        validators={{
                                            onChange: ({ value }: { value: string }) => (!isValidCSSColor(value) ? 'Invalid CSS color' : undefined)
                                        }}
                                    >
                                        {(field) => (
                                            <div className={cn('flex flex-col gap-1', index % 2 === 1 && 'xl:items-end')}>
                                                <ColorInput
                                                    value={field.state.value}
                                                    label={themeField.label}
                                                    onChange={(e) => field.handleChange(e.target.value)}
                                                    onBlur={field.handleBlur}
                                                    disabled={!environment.plan?.can_customize_connect_ui_theme}
                                                    className="w-[180px]"
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

                    <form.Field name="showWatermark">
                        {(field) => (
                            <Tooltip delayDuration={0}>
                                <TooltipTrigger asChild>
                                    <div className="flex gap-2 items-center">
                                        <label htmlFor={field.name} className={`text-sm font-medium text-primary`}>
                                            Show Nango watermark
                                        </label>
                                        <Switch
                                            id={field.name}
                                            checked={field.state.value}
                                            onCheckedChange={(checked) => field.handleChange(checked)}
                                            onBlur={field.handleBlur}
                                            disabled={!environment.plan?.can_disable_connect_ui_watermark}
                                        />
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

                    {/** Save Button */}
                    <form.Subscribe selector={(state) => [state.canSubmit, state.isDirty, state.isSubmitting]}>
                        {([canSubmit, isDirty]) => (
                            <>
                                {canSubmit && isDirty && (
                                    <Button type="submit" variant="primary" size="md" className="self-start" disabled={isUpdatingConnectUISettings}>
                                        {isUpdatingConnectUISettings ? 'Saving...' : 'Save settings'}
                                    </Button>
                                )}
                            </>
                        )}
                    </form.Subscribe>
                </form>

                {/** Preview */}
                <div className="flex-1 h-full flex justify-center items-cente p-11 bg-sub-surface border-l border-muted">
                    <ConnectUIPreview ref={connectUIPreviewRef} className="h-full w-[500px]" />
                </div>
            </div>
        </DashboardLayout>
    );
};
