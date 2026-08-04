import { useForm } from '@tanstack/react-form';
import { Info, Lock } from 'lucide-react';
import React, { useRef } from 'react';

import { permissions } from '@nangohq/authz';
import { Button, Field, FieldError, FieldLabel } from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ColorInput } from '@/components/ui/ColorInput';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { StyledLink } from '@/components/ui/StyledLink';
import { Switch } from '@/components/ui/Switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { useConnectUISettings, useUpdateConnectUISettings } from '@/hooks/useConnectUISettings';
import { usePermissions } from '@/hooks/usePermissions';
import { useCurrentPlan } from '@/hooks/usePlan';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { globalEnv } from '@/utils/env';
import SettingsContent from '../components/SettingsContent';
import { ConnectUIPreview } from './components/ConnectUIPreview';

import type { ConnectUIPreviewRef } from './components/ConnectUIPreview';
import type { Theme } from '@nangohq/types';

// ReactFormExtendedApi requires 12 type arguments... using `any` for form and form fields in the extracted components for pragmatic reasons
// eslint-disable @typescript-eslint/no-explicit-any
const ThemeColorPickers: React.FC<{ disabled: boolean; form: any }> = ({ disabled, form }) => (
    <>
        <form.Field name="theme.light.primary">
            {(field: any) => (
                <Field>
                    <FieldLabel htmlFor={field.name} className={disabled ? 'text-text-muted' : undefined}>
                        Primary (Light theme)
                    </FieldLabel>
                    <ColorInput value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} disabled={disabled} />
                    {!field.state.meta.isValid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
                </Field>
            )}
        </form.Field>

        <form.Field name="theme.dark.primary">
            {(field: any) => (
                <Field>
                    <FieldLabel htmlFor={field.name} className={disabled ? 'text-text-muted' : undefined}>
                        Primary (Dark theme)
                    </FieldLabel>
                    <ColorInput value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} onBlur={field.handleBlur} disabled={disabled} />
                    {!field.state.meta.isValid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
                </Field>
            )}
        </form.Field>
    </>
);

const WatermarkToggle: React.FC<{ disabled: boolean; form: any }> = ({ disabled, form }) => (
    <form.Field name="showWatermark">
        {(field: any) => (
            <Field orientation="horizontal" className="gap-5">
                <FieldLabel htmlFor={field.name} className={disabled ? 'text-text-muted' : undefined}>
                    Show &quot;Secured by Nango&quot;
                </FieldLabel>
                <Switch
                    id={field.name}
                    name={field.name}
                    checked={field.state.value}
                    onCheckedChange={(checked) => field.handleChange(checked)}
                    onBlur={field.handleBlur}
                    disabled={disabled}
                />
            </Field>
        )}
    </form.Field>
);
// eslint-enable @typescript-eslint/no-explicit-any

export const ConnectUISettings = () => {
    const toast = useToast();
    const env = useStore((state) => state.env);
    const { data: environmentData } = useCurrentPlan(env);
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
                                <Field>
                                    <FieldLabel htmlFor={field.name}>
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
                                    </FieldLabel>
                                    <Select name={field.name} value={field.state.value} onValueChange={(value) => field.handleChange(value as Theme)}>
                                        <SelectTrigger id={field.name} className="w-full text-sm px-2.5 gap-2">
                                            <SelectValue placeholder="Default theme" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="system">System</SelectItem>
                                            <SelectItem value="light">Light</SelectItem>
                                            <SelectItem value="dark">Dark</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Field>
                            )}
                        </form.Field>

                        {canCustomizeTheme && <ThemeColorPickers disabled={false} form={form} />}
                        {canDisableWatermark && <WatermarkToggle disabled={false} form={form} />}

                        <form.Subscribe selector={(state) => [state.canSubmit, state.isDirty, state.isSubmitting]}>
                            {([canSubmit, isDirty]) => (
                                <PermissionGate asChild condition={canManageConnectUI}>
                                    {(allowed) => (
                                        <div className="self-start">
                                            <Button
                                                type="submit"
                                                variant="primary"
                                                size="md"
                                                disabled={!canSubmit || !isDirty || !allowed}
                                                loading={isUpdatingConnectUISettings}
                                            >
                                                Save
                                            </Button>
                                        </div>
                                    )}
                                </PermissionGate>
                            )}
                        </form.Subscribe>

                        {(!canCustomizeTheme || !canDisableWatermark) && (
                            <div className="bg-surface-panel p-6 flex flex-col gap-6">
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

                                <ButtonLink to={`/team/billing#plans`} variant="outline" target="_blank">
                                    Upgrade to &apos;Growth&apos; plan
                                </ButtonLink>
                            </div>
                        )}
                    </div>
                </form>
                <div className="w-full min-h-full flex justify-end items-center">
                    <ConnectUIPreview ref={connectUIPreviewRef} className="w-full h-full max-w-[450px] max-h-[700px] border border-border-muted rounded-md" />
                </div>
            </div>
        </SettingsContent>
    );
};
