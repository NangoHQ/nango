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

import type { ConnectUIPreviewRef } from './components/ConnectUIPreview';
import type { ConnectUIColorPalette } from '@nangohq/types';

// Utility type to generate all possible theme paths
type ThemePath = {
    [K in keyof ConnectUIColorPalette]: `theme.light.${K}` | `theme.dark.${K}`;
}[keyof ConnectUIColorPalette];

const lightThemeFields: { name: ThemePath; label: string }[] = [
    {
        name: 'theme.light.buttonBackground',
        label: 'Button Background'
    },
    {
        name: 'theme.light.buttonText',
        label: 'Button Text'
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
                    state.formApi.reset();
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
        <DashboardLayout selectedItem={LeftNavBarItems.ConnectUI} className="w-full h-full">
            <Helmet>
                <title>Connect UI - Nango</title>
            </Helmet>
            <div className="flex w-full h-full ">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void form.handleSubmit();
                    }}
                    className="w-full flex flex-col gap-10 p-11 border-r border-grayscale-4"
                >
                    <h2 className="text-2xl font-bold text-white">Connect UI Settings</h2>
                    <div className="flex flex-col gap-6">
                        {lightThemeFields.map((themeField) => (
                            <form.Field
                                key={themeField.name}
                                name={themeField.name}
                                validators={{
                                    onChange: ({ value }: { value: string }) => (!isValidCSSColor(value) ? 'Invalid CSS color' : undefined)
                                }}
                            >
                                {(field) => (
                                    <div className="w-full flex gap-2 justify-between items-center">
                                        <label htmlFor={themeField.name} className="text-sm font-medium text-grayscale-300">
                                            {themeField.label}
                                        </label>
                                        <Tooltip delayDuration={0}>
                                            <TooltipTrigger asChild>
                                                <div className="flex flex-col gap-1">
                                                    <ColorInput
                                                        value={field.state.value}
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
                                            </TooltipTrigger>
                                            {!environment.plan?.can_customize_connect_ui_theme && (
                                                <TooltipContent side="bottom" className="text-grayscale-300">
                                                    Customizing the theme is only available for Growth plans.{' '}
                                                    <LinkWithIcon to={`/${env}/team/billing`}>Upgrade your plan</LinkWithIcon>
                                                </TooltipContent>
                                            )}
                                        </Tooltip>
                                    </div>
                                )}
                            </form.Field>
                        ))}
                        <form.Field name="showWatermark">
                            {(field) => (
                                <div className="flex gap-5 items-center">
                                    <label htmlFor={field.name} className={`text-sm font-medium text-grayscale-300`}>
                                        Display Nango watermark
                                    </label>
                                    <Tooltip delayDuration={0}>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center">
                                                <Switch
                                                    id={field.name}
                                                    name={field.name}
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
                                </div>
                            )}
                        </form.Field>
                    </div>

                    {/** Save Button */}
                    <form.Subscribe selector={(state) => [state.canSubmit, state.isDirty, state.isSubmitting]}>
                        {([canSubmit, isDirty]) => (
                            <Button
                                type="submit"
                                variant="primary"
                                size="md"
                                className="self-start"
                                disabled={!canSubmit || !isDirty || isUpdatingConnectUISettings}
                            >
                                {isUpdatingConnectUISettings ? 'Saving...' : 'Save settings'}
                            </Button>
                        )}
                    </form.Subscribe>
                </form>
                <div className="w-full h-full p-11 flex justify-center items-center">
                    <ConnectUIPreview ref={connectUIPreviewRef} className="w-full h-full max-w-[500px] max-h-[700px]" />
                </div>
            </div>
        </DashboardLayout>
    );
};
