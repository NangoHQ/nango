import { useForm } from '@tanstack/react-form';
import { CircleAlert, Lock, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle, FieldError, SegmentedControl, SegmentedControlItem } from '@nangohq/design-system';

import { ButtonLink } from '@/components/ui/ButtonLink';
import { Checkbox } from '@/components/ui/Checkbox';
import { ColorInput } from '@/components/ui/ColorInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/ui/Switch';
import { useConnectUISettings, useUpdateConnectUISettings } from '@/hooks/useConnectUISettings';
import { usePermissions } from '@/hooks/usePermissions';
import { useCurrentPlan } from '@/hooks/usePlan';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { globalEnv } from '@/utils/env';
import { SettingsCard } from '../components/SettingsCard';
import { ConnectUIPreview } from './components/ConnectUIPreview';

import type { ConnectUIPreviewRef } from './components/ConnectUIPreview';
import type { ConnectUISettings as ConnectUISettingsValues, Theme } from '@nangohq/types';
import type { ReactNode } from 'react';

type PreviewTheme = 'light' | 'dark';

const GROWTH_ADDON_NOTE = 'Available with the Growth add-on.';

const OS_DARK_QUERY = '(prefers-color-scheme: dark)';

function previewThemeFor(theme: Theme | undefined): PreviewTheme {
    if (theme === 'light' || theme === 'dark') {
        return theme;
    }
    return window.matchMedia(OS_DARK_QUERY).matches ? 'dark' : 'light';
}

const THEME_DESCRIPTIONS: Record<Theme, string> = {
    system: 'Follows the user’s OS.',
    light: 'Always light, whatever the user’s OS.',
    dark: 'Always dark, whatever the user’s OS.'
};

const StackedRow: React.FC<{ label: string; description: string; htmlFor?: string; children: ReactNode }> = ({ label, description, htmlFor, children }) => (
    <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
            <label htmlFor={htmlFor} className="type-text-medium-sm text-text-default">
                {label}
            </label>
            <span className="type-text-regular-xs text-text-secondary">{description}</span>
        </div>
        {children}
    </div>
);

export const ConnectUISettings = () => {
    const env = useStore((state) => state.env);
    const { data: connectUISettings, isError } = useConnectUISettings(env);

    if (isError && !connectUISettings) {
        return (
            <Alert variant="danger">
                <CircleAlert />
                <AlertTitle>Couldn&apos;t load Connect UI settings</AlertTitle>
                <AlertDescription>Refresh the page to try again.</AlertDescription>
            </Alert>
        );
    }
    if (!connectUISettings) {
        return <Skeleton className="h-[280px] w-full" />;
    }
    return <ConnectUISettingsForm saved={connectUISettings.data} />;
};

const ConnectUISettingsForm: React.FC<{ saved: ConnectUISettingsValues }> = ({ saved }) => {
    const { toast } = useToast();
    const env = useStore((state) => state.env);
    const { data: environmentData } = useCurrentPlan(env);
    const plan = environmentData?.plan;

    const { can } = usePermissions();
    const canManageConnectUI = can('account:connect_ui:update');

    const { mutate: updateConnectUISettings, isPending } = useUpdateConnectUISettings(env);
    const connectUIPreviewRef = useRef<ConnectUIPreviewRef>(null);

    const [previewTheme, setPreviewTheme] = useState<PreviewTheme>(() => previewThemeFor(saved.defaultTheme));
    const previewThemeRef = useRef(previewTheme);
    const [separateDarkChoice, setSeparateDarkChoice] = useState<boolean>();
    const separateDark = separateDarkChoice ?? saved.theme.dark.primary !== saved.theme.light.primary;

    const noPlanAvailable = !globalEnv.features.plan || !plan;
    const canCustomizeTheme = noPlanAvailable ? globalEnv.isHosted || globalEnv.isEnterprise : (plan?.can_customize_connect_ui_theme ?? false);
    const canDisableWatermark = noPlanAvailable ? globalEnv.isHosted || globalEnv.isEnterprise : (plan?.can_disable_connect_ui_watermark ?? false);

    const sendToPreview = (values: ConnectUISettingsValues | undefined) => {
        if (values) {
            connectUIPreviewRef.current?.sendSettingsChanged({ ...values, defaultTheme: previewThemeRef.current });
        }
    };

    const form = useForm({
        defaultValues: saved,
        listeners: {
            onChange: (state) => {
                if (state.formApi.state.isValid) {
                    sendToPreview(state.formApi.state.values);
                }
            },
            onChangeDebounceMs: 100
        },
        onSubmit: (state) => {
            updateConnectUISettings(state.formApi.state.values, {
                onSuccess: () => {
                    state.formApi.reset();
                    setSeparateDarkChoice(undefined);
                    toast({ title: 'Connect UI settings saved', variant: 'success' });
                },
                onError: () => {
                    toast({ title: 'Failed to update Connect UI settings', variant: 'error' });
                }
            });
        }
    });

    const choosePreviewTheme = (theme: PreviewTheme) => {
        previewThemeRef.current = theme;
        setPreviewTheme(theme);
        sendToPreview(form.state.values);
    };

    useEffect(() => {
        const query = window.matchMedia(OS_DARK_QUERY);
        const onOsThemeChange = (event: MediaQueryListEvent) => {
            if (form.getFieldValue('defaultTheme') !== 'system') {
                return;
            }
            const theme: PreviewTheme = event.matches ? 'dark' : 'light';
            previewThemeRef.current = theme;
            setPreviewTheme(theme);
            const values = form.state.values;
            if (values) {
                connectUIPreviewRef.current?.sendSettingsChanged({ ...values, defaultTheme: theme });
            }
        };
        query.addEventListener('change', onOsThemeChange);
        return () => query.removeEventListener('change', onOsThemeChange);
    }, [form]);

    const themeLocked = !canCustomizeTheme || !canManageConnectUI;
    const watermarkLocked = !canDisableWatermark || !canManageConnectUI;

    return (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,500px)_400px]">
            <form.Subscribe selector={(state) => [state.canSubmit, JSON.stringify(state.values) !== JSON.stringify(saved)] as const}>
                {([canSubmit, isDirty]) => (
                    <SettingsCard
                        title="Appearance"
                        dirty={isDirty}
                        invalid={!canSubmit}
                        saving={isPending}
                        canEdit={canManageConnectUI}
                        onSave={() => form.handleSubmit()}
                        onDiscard={() => {
                            form.reset();
                            setSeparateDarkChoice(undefined);
                            choosePreviewTheme(previewThemeFor(form.state.values?.defaultTheme));
                        }}
                    >
                        <form.Field name="defaultTheme">
                            {(field) => (
                                <StackedRow label="Theme" description={THEME_DESCRIPTIONS[field.state.value ?? 'system']}>
                                    <div>
                                        <SegmentedControl
                                            aria-label="Connect UI theme"
                                            value={field.state.value}
                                            onValueChange={(value) => {
                                                field.handleChange(value as Theme);
                                                choosePreviewTheme(previewThemeFor(value as Theme));
                                            }}
                                            disabled={!canManageConnectUI}
                                        >
                                            <SegmentedControlItem value="system" icon={<Monitor />}>
                                                System
                                            </SegmentedControlItem>
                                            <SegmentedControlItem value="light" icon={<Sun />}>
                                                Light
                                            </SegmentedControlItem>
                                            <SegmentedControlItem value="dark" icon={<Moon />}>
                                                Dark
                                            </SegmentedControlItem>
                                        </SegmentedControl>
                                    </div>
                                </StackedRow>
                            )}
                        </form.Field>

                        <StackedRow
                            label="Brand color"
                            description={canCustomizeTheme ? 'Buttons and links.' : GROWTH_ADDON_NOTE}
                            htmlFor="theme.light.primary"
                        >
                            <form.Field name="theme.light.primary">
                                {(field) => (
                                    <div className="flex flex-col gap-2">
                                        <div className="w-50">
                                            <ColorInput
                                                id={field.name}
                                                aria-label={separateDark ? 'Light mode brand color' : undefined}
                                                value={field.state.value}
                                                onChange={(e) => {
                                                    field.handleChange(e.target.value);
                                                    if (!separateDark) {
                                                        form.setFieldValue('theme.dark.primary', e.target.value);
                                                    }
                                                }}
                                                onBlur={field.handleBlur}
                                                disabled={themeLocked}
                                            />
                                        </div>
                                        {!field.state.meta.isValid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
                                    </div>
                                )}
                            </form.Field>
                            <label className="flex w-fit cursor-pointer items-center gap-2 type-text-regular-sm text-text-secondary">
                                <Checkbox
                                    checked={separateDark}
                                    disabled={themeLocked}
                                    onCheckedChange={(checked) => {
                                        const on = checked === true;
                                        setSeparateDarkChoice(on);
                                        if (!on) {
                                            form.setFieldValue('theme.dark.primary', form.getFieldValue('theme.light.primary'));
                                        }
                                    }}
                                />
                                Use a different color in dark mode
                            </label>
                            {separateDark && (
                                <form.Field name="theme.dark.primary">
                                    {(field) => (
                                        <div className="flex flex-col gap-2">
                                            <div className="w-50">
                                                <ColorInput
                                                    id={field.name}
                                                    aria-label="Dark mode brand color"
                                                    value={field.state.value}
                                                    onChange={(e) => field.handleChange(e.target.value)}
                                                    onBlur={field.handleBlur}
                                                    disabled={themeLocked}
                                                />
                                            </div>
                                            {!field.state.meta.isValid && <FieldError>{field.state.meta.errors.join(', ')}</FieldError>}
                                        </div>
                                    )}
                                </form.Field>
                            )}
                        </StackedRow>

                        <form.Field name="showWatermark">
                            {(field) => (
                                <StackedRow label="Nango branding" description={canDisableWatermark ? '“Secured by Nango” footer.' : GROWTH_ADDON_NOTE}>
                                    <label className="flex w-fit cursor-pointer items-center gap-2 type-text-regular-sm text-text-default">
                                        <Switch
                                            id={field.name}
                                            checked={field.state.value}
                                            onCheckedChange={(checked) => field.handleChange(checked)}
                                            onBlur={field.handleBlur}
                                            disabled={watermarkLocked}
                                        />
                                        Show footer badge
                                    </label>
                                </StackedRow>
                            )}
                        </form.Field>

                        {(!canCustomizeTheme || !canDisableWatermark) && (
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-muted pt-5">
                                <span className="inline-flex items-center gap-2 type-text-regular-sm text-text-secondary">
                                    <Lock className="size-4" />
                                    Some appearance options need the Growth add-on.
                                </span>
                                <ButtonLink to="/team/billing#plans" variant="outline">
                                    Get the Growth add-on
                                </ButtonLink>
                            </div>
                        )}
                    </SettingsCard>
                )}
            </form.Subscribe>

            <div className="flex flex-col gap-2 xl:sticky xl:top-6">
                <ConnectUIPreview ref={connectUIPreviewRef} themeOverride={previewTheme} className="h-145 w-full rounded-ds-md" />
                <div className="flex items-center justify-between gap-3">
                    <span className="type-text-regular-xs text-text-muted">Live preview, unsaved changes included.</span>
                    <SegmentedControl
                        size="sm"
                        aria-label="Preview theme"
                        value={previewTheme}
                        onValueChange={(value) => {
                            if (value) choosePreviewTheme(value as PreviewTheme);
                        }}
                    >
                        <SegmentedControlItem value="light" icon={<Sun />}>
                            Light
                        </SegmentedControlItem>
                        <SegmentedControlItem value="dark" icon={<Moon />}>
                            Dark
                        </SegmentedControlItem>
                    </SegmentedControl>
                </div>
            </div>
        </div>
    );
};
