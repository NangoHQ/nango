import { IconHelpCircle, IconMoon, IconSun } from '@tabler/icons-react';
import { useForm } from '@tanstack/react-form';
import { Cable } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router-dom';

import { ColorInput, isValidCSSColor } from './components/ColorInput';
import { ConnectUIPreview } from './components/ConnectUIPreview';
import LinkWithIcon from '@/components/LinkWithIcon';
import { SimpleTooltip } from '@/components/SimpleTooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { Button } from '@/components/ui/button/Button';
import { Tag } from '@/components/ui/label/Tag';
import { useConnectUISettings, useUpdateConnectUISettings } from '@/hooks/useConnectUISettings';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';

import type { ConnectUIPreviewRef } from './components/ConnectUIPreview';
import type { ConnectUIColorPalette, Theme } from '@nangohq/types';

// Utility type to generate all possible theme paths
type ThemePath = {
    [K in keyof ConnectUIColorPalette]: `theme.light.${K}` | `theme.dark.${K}`;
}[keyof ConnectUIColorPalette];

const lightThemeFields: { name: ThemePath; label: string }[] = [
    {
        name: 'theme.light.primary',
        label: 'Primary color'
    }
];

const darkThemeFields: { name: ThemePath; label: string }[] = [
    {
        name: 'theme.dark.primary',
        label: 'Primary color'
    }
];

export const ConnectUISettings = () => {
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
            onChangeDebounceMs: 100
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
        <div className="text-grayscale-100 flex flex-col gap-10 h-[700px] min-w-[900px]">
            <Link className="flex gap-6 items-center rounded-md bg-grayscale-900 px-8 h-10" to="#connect-ui" id="connect-ui">
                <div className="flex gap-2 items-center">
                    <div>
                        <Cable className="w-4.5 h-4.5" />
                    </div>
                    <h3 className="uppercase text-sm">Connect UI settings</h3>
                </div>
                <Tag variant="success" textCase="normal">
                    NEW
                </Tag>
            </Link>
            <div className="flex w-full h-full">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void form.handleSubmit();
                    }}
                    className="w-full flex flex-col gap-10 px-8 border-r border-grayscale-4"
                >
                    <div className="flex flex-col gap-6">
                        <form.Field name="defaultTheme">
                            {(field) => (
                                <div className="w-full flex gap-2 justify-between items-center">
                                    <label htmlFor={field.name} className="text-sm font-medium text-grayscale-300 flex items-center gap-1">
                                        Default theme{' '}
                                        <SimpleTooltip
                                            side="right"
                                            tooltipContent={
                                                <p>
                                                    You can override the theme per session from the{' '}
                                                    <LinkWithIcon to="https://docs.nango.dev/reference/sdks/frontend#param-theme-override" type="external">
                                                        Frontend SDK
                                                    </LinkWithIcon>
                                                </p>
                                            }
                                        >
                                            <IconHelpCircle className="w-4 h-4" />
                                        </SimpleTooltip>
                                    </label>
                                    <div className="flex items-center">
                                        <Select name={field.name} value={field.state.value} onValueChange={(value) => field.handleChange(value as Theme)}>
                                            <SelectTrigger className="w-[180px] text-text-primary text-sm">
                                                <SelectValue placeholder="Default theme" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="system">System</SelectItem>
                                                <SelectItem value="light">Light</SelectItem>
                                                <SelectItem value="dark">Dark</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            )}
                        </form.Field>

                        <form.Field name="showWatermark">
                            {(field) => (
                                <div className="flex gap-5 items-center">
                                    <label htmlFor={field.name} className={`text-sm font-medium text-grayscale-300`}>
                                        Nango watermark
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

                    <div className="flex flex-col border border-grayscale-4">
                        <div className="flex justify-between items-center p-4 py-3 border-b border-grayscale-4">
                            <div className="w-full">
                                <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                                    Light Theme <IconSun className="w-5 h-5" />
                                </h3>
                            </div>
                            <div className="w-full">
                                <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                                    Dark Theme <IconMoon className="w-5 h-5" />
                                </h3>
                            </div>
                        </div>
                        <div className="flex justify-between">
                            <div className="w-full flex flex-col gap-6 p-4">
                                {lightThemeFields.map((themeField) => (
                                    <form.Field
                                        key={themeField.name}
                                        name={themeField.name}
                                        validators={{
                                            onChange: ({ value }: { value: string }) => (!isValidCSSColor(value) ? 'Invalid CSS color' : undefined)
                                        }}
                                    >
                                        {(field) => (
                                            <Tooltip delayDuration={0}>
                                                <TooltipTrigger asChild>
                                                    <div className="flex flex-col gap-1">
                                                        <ColorInput
                                                            label={themeField.label}
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
                                        )}
                                    </form.Field>
                                ))}
                            </div>
                            <div className="w-full flex flex-col gap-6 p-4">
                                {darkThemeFields.map((themeField) => (
                                    <form.Field
                                        key={themeField.name}
                                        name={themeField.name}
                                        validators={{
                                            onChange: ({ value }: { value: string }) => (!isValidCSSColor(value) ? 'Invalid CSS color' : undefined)
                                        }}
                                    >
                                        {(field) => (
                                            <Tooltip delayDuration={0}>
                                                <TooltipTrigger asChild>
                                                    <div className="flex flex-col gap-1">
                                                        <ColorInput
                                                            label={themeField.label}
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
                                        )}
                                    </form.Field>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/** Save Button */}
                    <form.Subscribe selector={(state) => [state.canSubmit, state.isDirty, state.isSubmitting]}>
                        {([canSubmit, isDirty]) => (
                            <Button
                                type="submit"
                                variant="primary"
                                size="md"
                                className="self-start"
                                disabled={!canSubmit || !isDirty}
                                isLoading={isUpdatingConnectUISettings}
                            >
                                Save Connect UI settings
                            </Button>
                        )}
                    </form.Subscribe>
                </form>
                <div className="w-full max-w-[600px] min-h-full px-8 flex justify-center items-center">
                    <ConnectUIPreview ref={connectUIPreviewRef} className="w-full h-full max-w-[500px] max-h-[700px]" />
                </div>
            </div>
        </div>
    );
};
