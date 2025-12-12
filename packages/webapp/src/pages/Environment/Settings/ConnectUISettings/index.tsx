import { IconHelpCircle } from '@tabler/icons-react';
import { useForm } from '@tanstack/react-form';
import { useRef } from 'react';

import { ColorInput } from './components/ColorInput';
import { ConnectUIPreview } from './components/ConnectUIPreview';
import SettingsContent from '../components/SettingsContent';
import LinkWithIcon from '@/components/LinkWithIcon';
import { SimpleTooltip } from '@/components/SimpleTooltip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { Button } from '@/components-v2/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components-v2/ui/select';
import { Switch } from '@/components-v2/ui/switch';
import { useConnectUISettings, useUpdateConnectUISettings } from '@/hooks/useConnectUISettings';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { globalEnv } from '@/utils/env';

import type { ConnectUIPreviewRef } from './components/ConnectUIPreview';
import type { Theme } from '@nangohq/types';

export const ConnectUISettings = () => {
    const toast = useToast();
    const env = useStore((state) => state.env);
    const environment = useEnvironment(env);

    const { data: connectUISettings } = useConnectUISettings(env);
    const { mutate: updateConnectUISettings, isPending: isUpdatingConnectUISettings } = useUpdateConnectUISettings(env);
    const connectUIPreviewRef = useRef<ConnectUIPreviewRef>(null);

    // Matches backend logic, canDisableConnectUIWatermark(plan?: DBPlan | null): boolean

    const noPlanAvailable = !globalEnv.features.plan || !environment.plan;
    let canCustomizeColors = environment.plan?.can_customize_connect_ui_theme || false;
    canCustomizeColors = true;
    let canDisableWatermark = noPlanAvailable ? globalEnv.isHosted || globalEnv.isEnterprise : environment.plan!.can_disable_connect_ui_watermark;
    canDisableWatermark = true;
    let shouldSeeWatermarkToggle = canDisableWatermark || globalEnv.isHosted || globalEnv.isEnterprise;
    shouldSeeWatermarkToggle = true;

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
        <SettingsContent title="Connect UI">
            <div className="flex w-full h-[635px] gap-6">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void form.handleSubmit();
                    }}
                    className="w-full flex flex-col gap-10 border-grayscale-4"
                >
                    <div className="flex flex-col gap-6">
                        <form.Field name="defaultTheme">
                            {(field) => (
                                <div className="w-full flex flex-col gap-2 justify-between">
                                    <label htmlFor={field.name} className="text-sm text-body-medium-medium flex items-center gap-1">
                                        Default theme{' '}
                                        <SimpleTooltip
                                            side="right"
                                            tooltipContent={
                                                <p>
                                                    You can override the theme per session from the{' '}
                                                    <LinkWithIcon to="https://nango.dev/docs/reference/sdks/frontend#param-theme-override" type="external">
                                                        Frontend SDK
                                                    </LinkWithIcon>
                                                </p>
                                            }
                                        >
                                            <IconHelpCircle className="w-4 h-4" />
                                        </SimpleTooltip>
                                    </label>
                                    <div className="flex w-[90px]">
                                        <Select name={field.name} value={field.state.value} onValueChange={(value) => field.handleChange(value as Theme)}>
                                            <SelectTrigger className="w-[90px] text-sm px-2.5 gap-2">
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

                        {canCustomizeColors && (
                            <>
                                <form.Field name="theme.light.primary">
                                    {(field) => (
                                        <div className="w-full flex flex-col gap-2">
                                            <label htmlFor={field.name} className="text-sm text-body-medium-medium flex items-center gap-1">
                                                Primary (Light theme)
                                            </label>
                                            <div className="flex items-center">
                                                <div className="flex flex-col gap-1 w-[170px]">
                                                    <ColorInput
                                                        value={field.state.value}
                                                        onChange={(e) => field.handleChange(e.target.value)}
                                                        onBlur={field.handleBlur}
                                                    />
                                                    {!field.state.meta.isValid && (
                                                        <em role="alert" className="text-sm text-red-500">
                                                            {field.state.meta.errors.join(', ')}
                                                        </em>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </form.Field>

                                <form.Field name="theme.dark.primary">
                                    {(field) => (
                                        <div className="w-full flex flex-col gap-2">
                                            <label htmlFor={field.name} className="text-sm text-body-medium-medium flex items-center gap-1">
                                                Primary (Dark theme)
                                            </label>
                                            <div className="flex items-center">
                                                <div className="flex flex-col gap-1 w-[170px]">
                                                    <ColorInput
                                                        value={field.state.value}
                                                        onChange={(e) => field.handleChange(e.target.value)}
                                                        onBlur={field.handleBlur}
                                                    />
                                                    {!field.state.meta.isValid && (
                                                        <em role="alert" className="text-sm text-red-500">
                                                            {field.state.meta.errors.join(', ')}
                                                        </em>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </form.Field>
                            </>
                        )}

                        {shouldSeeWatermarkToggle && (
                            <form.Field name="showWatermark">
                                {(field) => (
                                    <div className="flex gap-5 items-center">
                                        <label htmlFor={field.name} className={`text-sm text-body-medium-medium`}>
                                            Show &quot;Secured by Nango&quot;
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
                                                        disabled={!canDisableWatermark}
                                                    />
                                                </div>
                                            </TooltipTrigger>
                                            {!canDisableWatermark && (
                                                <TooltipContent className="text-grayscale-300">
                                                    Contact your administrator to enable watermark removal.
                                                </TooltipContent>
                                            )}
                                        </Tooltip>
                                    </div>
                                )}
                            </form.Field>
                        )}

                        <form.Subscribe selector={(state) => [state.canSubmit, state.isDirty, state.isSubmitting]}>
                            {([canSubmit, isDirty]) => (
                                <Button
                                    type="submit"
                                    variant="primary"
                                    size="sm"
                                    className="self-start"
                                    disabled={!canSubmit || !isDirty}
                                    loading={isUpdatingConnectUISettings}
                                >
                                    Save Connect UI settings
                                </Button>
                            )}
                        </form.Subscribe>
                    </div>
                </form>
                <div className="w-full max-w-[600px] min-h-full flex justify-center items-center">
                    <ConnectUIPreview ref={connectUIPreviewRef} className="w-full h-full max-w-[500px] max-h-[700px]" />
                </div>
            </div>
        </SettingsContent>
    );
};
