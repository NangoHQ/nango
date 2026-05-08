import { useForm } from '@tanstack/react-form';
import { Info, Lock } from 'lucide-react';
import React, { useRef } from 'react';

import { permissions } from '@nangohq/authz';

import { ConnectUIPreview } from './components/ConnectUIPreview';
import SettingsContent from '../components/SettingsContent';
import { ColorInput } from '@/components-v2/ColorInput';
import { InfoTooltip } from '@/components-v2/InfoTooltip';
import { PermissionGate } from '@/components-v2/PermissionGate';
import { StyledLink } from '@/components-v2/StyledLink';
import { Button, ButtonLink } from '@/components-v2/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components-v2/ui/select';
import { Switch } from '@/components-v2/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components-v2/ui/tooltip';
import { useConnectUISettings, useUpdateConnectUISettings } from '@/hooks/useConnectUISettings';
import { useEnvironment } from '@/hooks/useEnvironment';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { globalEnv } from '@/utils/env';
import { cn } from '@/utils/utils';

import type { ConnectUIPreviewRef } from './components/ConnectUIPreview';
import type { Theme } from '@nangohq/types';

// ReactFormExtendedApi requires 12 type arguments... using `any` for form and form fields in the extracted components for pragmatic reasons
// eslint-disable @typescript-eslint/no-explicit-any
const ThemeColorPickers: React.FC<{ disabled: boolean; form: any }> = ({ disabled, form }) => (
    <>
        <form.Field name="theme.light.primary">
            {(field: any) => (
                <div className="w-full flex flex-col gap-2">
                    <label
                        htmlFor={field.name}
                        className={cn('text-sm flex items-center gap-1 text-body-medium-medium>', disabled ? 'text-text-tertiary' : '')}
                    >
                        Primary (Light theme)
                    </label>
                    <div className="flex items-center">
                        <div className="w-full flex flex-col gap-1">
                            <ColorInput
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                onBlur={field.handleBlur}
                                disabled={disabled}
                            />
                            {!field.state.meta.isValid && (
                                <em role="alert" className="text-body-small-regular text-feedback-error-fg">
                                    {field.state.meta.errors.join(', ')}
                                </em>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </form.Field>

        <form.Field name="theme.dark.primary">
            {(field: any) => (
                <div className="w-full flex flex-col gap-2">
                    <label
                        htmlFor={field.name}
                        className={cn('text-sm flex items-center gap-1 text-body-medium-medium>', disabled ? 'text-text-tertiary' : '')}
                    >
                        Primary (Dark theme)
                    </label>
                    <div className="flex items-center">
                        <div className="w-full flex flex-col gap-1">
                            <ColorInput
                                value={field.state.value}
                                onChange={(e) => field.handleChange(e.target.value)}
                                onBlur={field.handleBlur}
                                disabled={disabled}
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
);

const WatermarkToggle: React.FC<{ disabled: boolean; form: any }> = ({ disabled, form }) => (
    <form.Field name="showWatermark">
        {(field: any) => (
            <div className="flex gap-5 items-center">
                <label htmlFor={field.name} className={cn('text-body-medium-medium', disabled ? 'text-text-tertiary' : '')}>
                    Show &quot;Secured by Nango&quot;
                </label>
                <div className="flex items-center">
                    <Switch
                        id={field.name}
                        name={field.name}
                        checked={field.state.value}
                        onCheckedChange={(checked) => field.handleChange(checked)}
                        onBlur={field.handleBlur}
                        disabled={disabled}
                    />
                </div>
            </div>
        )}
    </form.Field>
);
// eslint-enable @typescript-eslint/no-explicit-any

export const ConnectUISettings = () => {
    const toast = useToast();
    const env = useStore((state) => state.env);
    const { data: environmentData } = useEnvironment(env);
    const plan = environmentData?.plan;

    const { can } = usePermissions();
    const canManageConnectUI = can(permissions.canManageConnectUI);

    const { data: connectUISettings } = useConnectUISettings(env);
    const { mutate: updateConnectUISettings, isPending: isUpdatingConnectUISettings } = useUpdateConnectUISettings(env);
    const connectUIPreviewRef = useRef<ConnectUIPreviewRef>(null);

    const noPlanAvailable = !globalEnv.features.plan || !plan;
    const canCustomizeTheme = noPlanAvailable ? globalEnv.isHosted || globalEnv.isEnterprise : (plan?.can_customize_connect_ui_theme ?? false);
    const canDisableWatermark = noPlanAvailable ? globalEnv.isHosted || globalEnv.isEnterprise : (plan?.can_disable_connect_ui_watermark ?? false);

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
                    className="w-fit flex flex-col gap-10 text-nowrap"
                >
                    <div className="flex flex-col gap-6">
                        <form.Field name="defaultTheme">
                            {(field) => (
                                <div className="w-full flex flex-col gap-2 justify-between">
                                    <label htmlFor={field.name} className="text-body-medium-medium flex items-center gap-2">
                                        Default theme
                                        <InfoTooltip icon={<Info />} side="right">
                                            <p>
                                                You can override the theme per session from the{' '}
                                                <StyledLink
                                                    to="https://nango.dev/docs/reference/frontend/frontend-sdk#connect-using-nango-connect-ui"
                                                    icon
                                                    type="external"
                                                    className="text-s"
                                                >
                                                    Frontend SDK
                                                </StyledLink>
                                            </p>
                                        </InfoTooltip>
                                    </label>
                                    <div className="flex">
                                        <Select name={field.name} value={field.state.value} onValueChange={(value) => field.handleChange(value as Theme)}>
                                            <SelectTrigger className="w-full text-sm px-2.5 gap-2">
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

                        {canCustomizeTheme && <ThemeColorPickers disabled={false} form={form} />}
                        {canDisableWatermark && <WatermarkToggle disabled={false} form={form} />}

                        <form.Subscribe selector={(state) => [state.canSubmit, state.isDirty, state.isSubmitting]}>
                            {([canSubmit, isDirty]) => (
                                <PermissionGate asChild condition={canManageConnectUI}>
                                    {(allowed) => (
                                        <Button
                                            type="submit"
                                            variant="primary"
                                            size="sm"
                                            className="self-start"
                                            disabled={!canSubmit || !isDirty || !allowed}
                                            loading={isUpdatingConnectUISettings}
                                        >
                                            Save
                                        </Button>
                                    )}
                                </PermissionGate>
                            )}
                        </form.Subscribe>

                        {(!canCustomizeTheme || !canDisableWatermark) && (
                            <div className="bg-bg-elevated p-6 flex flex-col gap-6">
                                <div className="flex text-body-medium-regular gap-2 items-center">
                                    <Lock size="16" />
                                    <span>Advanced Customization</span>
                                    <Tooltip>
                                        <TooltipTrigger>
                                            <Info size="14" />
                                        </TooltipTrigger>
                                        <TooltipContent variant="secondary" side="bottom">
                                            Available to &apos;Growth&apos; plans only
                                        </TooltipContent>
                                    </Tooltip>
                                </div>

                                {!canCustomizeTheme && <ThemeColorPickers disabled={true} form={form} />}
                                {!canDisableWatermark && <WatermarkToggle disabled={true} form={form} />}

                                <ButtonLink to={`/${env}/team/billing#plans`} variant="secondary" target="_blank">
                                    Upgrade to &apos;Growth&apos; plan
                                </ButtonLink>
                            </div>
                        )}
                    </div>
                </form>
                <div className="w-full min-h-full flex justify-end items-center">
                    <ConnectUIPreview ref={connectUIPreviewRef} className="w-full h-full max-w-[450px] max-h-[700px]" />
                </div>
            </div>
        </SettingsContent>
    );
};
