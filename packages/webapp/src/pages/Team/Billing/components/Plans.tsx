import { format } from 'date-fns';
import { ArrowRight, Check, Clock9, Loader } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { permissions } from '@nangohq/authz';
import {
    Button,
    Card,
    CardFooter,
    Dialog,
    DialogBody,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    IconButton
} from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate.js';
import { Alert, AlertDescription } from '@/components/ui/Alert.js';
import { StyledLink } from '@/components/ui/StyledLink.js';
import { environmentQueryKey } from '@/hooks/useEnvironment';
import { usePermissions } from '@/hooks/usePermissions.js';
import { fetchCurrentPlan, useApiGetPlans, useApiPostPlanChange, useCurrentPlan } from '@/hooks/usePlan';
import { useStripePaymentMethods } from '@/hooks/useStripe.js';
import { useToast } from '@/hooks/useToast.js';
import { queryClient, useStore } from '@/store';
import { cn } from '@/utils/utils';
import { stripePromise } from '@/utils/stripe.js';
import { PaymentMethodDialog } from './PaymentMethodDialog.js';
import { ENTERPRISE_PLAN_DESCRIPTION, PLAN_CARD_LIMITS } from './planCardCopy.js';

import type { PlanDefinitionList } from '../types.js';
import type { StripeError } from '@/utils/stripe.js';
import type { PlanDefinition, StripePaymentMethod } from '@nangohq/types';

export const Plans: React.FC = () => {
    const env = useStore((state) => state.env);

    const { data: environmentData } = useCurrentPlan(env);
    const currentPlan = environmentData?.plan;
    const { data: plansList } = useApiGetPlans(env);
    const { data: paymentMethods } = useStripePaymentMethods(env);

    const paymentMethod = useMemo(() => {
        return paymentMethods?.data && paymentMethods.data.length > 0 ? paymentMethods.data[0] : null;
    }, [paymentMethods]);

    const plans = useMemo<null | { list: PlanDefinitionList[]; activePlan: PlanDefinition }>(() => {
        if (!currentPlan || !plansList) {
            return null;
        }

        const curr = plansList.data.find((p) => p.code === currentPlan.name)!;

        const list: PlanDefinitionList[] = [];
        for (const plan of plansList.data) {
            if (plan.hidden) {
                continue;
            }
            const same = plan.code === currentPlan.name;

            list.push({
                plan,
                active: same,
                isFuture: plan.code === currentPlan.orb_future_plan,
                isDowngrade: curr.prevPlan?.includes(plan.code) || false,
                isUpgrade: curr.nextPlan?.includes(plan.code) || false
            });
        }
        return { list, activePlan: curr };
    }, [currentPlan, plansList]);

    // The target of a scheduled downgrade/cancellation, shown as an inline notice on the
    // *active* plan's card (Figma: the "Your plan" card carries the "Scheduled plan change" alert).
    const scheduledChange = useMemo(() => {
        if (!currentPlan?.orb_future_plan || !currentPlan.orb_future_plan_at) {
            return null;
        }

        const targetPlan = plansList?.data.find((p) => p.code === currentPlan.orb_future_plan);
        if (!targetPlan) {
            return null;
        }

        return { targetPlan, at: format(new Date(currentPlan.orb_future_plan_at), 'MMM d, yyyy') };
    }, [currentPlan, plansList]);

    return (
        <div className="flex flex-col gap-4">
            {plans?.activePlan.hidden && <CurrentPlanCard plan={plans.activePlan} />}
            <div className="grid grid-cols-4 gap-4">
                {plans?.list.map((plan) => (
                    <PlanCard
                        key={plan.plan.code}
                        planDefinition={plan}
                        activePlan={plans?.activePlan}
                        paymentMethod={paymentMethod}
                        scheduledChange={plan.active ? scheduledChange : null}
                    />
                ))}
            </div>
            <StyledLink to="https://nango.dev/pricing" icon type="external">
                View full pricing detail
            </StyledLink>
        </div>
    );
};

/** Compact "CURRENT PLAN" summary shown when the account's active plan isn't one of the 4 self-serve cards below (legacy plan). */
const CurrentPlanCard: React.FC<{ plan: PlanDefinition }> = ({ plan }) => {
    return (
        <Card selected>
            <div className="flex flex-col gap-1 p-4">
                <span className="text-text-disabled text-body-medium-regular uppercase">Current plan</span>
                <span className="text-text-default text-body-medium-regular">{plan.title}</span>
            </div>
        </Card>
    );
};

const PlanCard: React.FC<{
    planDefinition: PlanDefinitionList;
    activePlan?: PlanDefinition;
    paymentMethod?: StripePaymentMethod | null;
    scheduledChange?: { targetPlan: PlanDefinition; at: string } | null;
}> = ({ planDefinition, activePlan, paymentMethod, scheduledChange }) => {
    const { plan, active, isFuture, isDowngrade, isUpgrade } = planDefinition;

    const { can } = usePermissions();
    const canChangePlan = can(permissions.canChangePlan);

    const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false);
    const [planChangeDialogOpen, setPlanChangeDialogOpen] = useState(false);

    const onUpgradeClicked = useCallback(() => {
        if (!paymentMethod) {
            setPaymentMethodDialogOpen(true);
        } else {
            setPlanChangeDialogOpen(true);
        }
    }, [paymentMethod]);

    const ButtonComponent = useMemo(() => {
        if (active) {
            return <PlanFooterCTA label="Current plan" disabled />;
        }
        if (isFuture) {
            return <PlanFooterCTA label="Scheduled" disabled />;
        }

        // Once the account is on a custom/negotiated plan — Enterprise, or any `hidden` tier (legacy
        // v1 plans, other old/negotiated plans) — plan changes go through sales rather than
        // self-serve upgrade/downgrade, even if that plan's own definition would otherwise permit a
        // move (e.g. legacy Growth's `prevPlan` still lists Free). Every other card routes to
        // Contact Us instead.
        const selfServeChange = !activePlan?.hidden && activePlan?.canChange !== false;

        if (isUpgrade && plan.canChange && selfServeChange) {
            return (
                <>
                    <PermissionGate asChild condition={canChangePlan}>
                        {(allowed) => <PlanFooterCTA label="Upgrade" onClick={onUpgradeClicked} disabled={!allowed} />}
                    </PermissionGate>
                    <PaymentMethodDialog
                        open={paymentMethodDialogOpen}
                        onOpenChange={setPaymentMethodDialogOpen}
                        onSuccess={() => setPlanChangeDialogOpen(true)}
                    />
                    <PlanChangeDialog
                        open={planChangeDialogOpen}
                        onOpenChange={setPlanChangeDialogOpen}
                        selectedPlan={planDefinition}
                        activePlan={activePlan}
                    />
                </>
            );
        }

        if (isDowngrade && plan.canChange && selfServeChange) {
            return (
                <>
                    <PermissionGate asChild condition={canChangePlan}>
                        {(allowed) => <PlanFooterCTA label="Downgrade" onClick={() => setPlanChangeDialogOpen(true)} disabled={!allowed} />}
                    </PermissionGate>
                    <PlanChangeDialog
                        open={planChangeDialogOpen}
                        onOpenChange={setPlanChangeDialogOpen}
                        selectedPlan={planDefinition}
                        activePlan={activePlan}
                    />
                </>
            );
        }

        return <PlanFooterCTA label={plan.cta ?? 'Contact us'} href="https://nango.dev/demo" target="_blank" />;
    }, [
        active,
        isFuture,
        isUpgrade,
        plan.canChange,
        plan.cta,
        isDowngrade,
        onUpgradeClicked,
        paymentMethodDialogOpen,
        planChangeDialogOpen,
        planDefinition,
        activePlan,
        canChangePlan
    ]);

    const limits = PLAN_CARD_LIMITS[plan.code];

    return (
        <Card selected={active}>
            <div className="flex flex-col gap-2 p-4 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <span className="text-text-strong text-body-medium-medium">{plan.title}</span>
                    {plan.basePrice !== undefined && (
                        <span className="text-text-secondary text-body-medium-regular whitespace-nowrap">${plan.basePrice}/mo</span>
                    )}
                </div>
                {scheduledChange && (
                    <div className="flex flex-col gap-1 rounded-sm border-[0.5px] border-status-warning-border bg-status-warning-bg p-2">
                        <div className="flex gap-2 items-start">
                            <Clock9 className="size-4 shrink-0 mt-0.5 text-status-warning-text" />
                            <div className="flex flex-col gap-0.5">
                                <span className="text-status-warning-text text-body-small-regular">Scheduled plan change</span>
                                <span className="text-text-default text-body-small-regular">
                                    {scheduledChange.targetPlan.code === 'free'
                                        ? `Your subscription will be cancelled on ${scheduledChange.at}`
                                        : `Switches to ${scheduledChange.targetPlan.title} on ${scheduledChange.at}`}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
                {limits ? (
                    limits.map((limit) => (
                        <div key={limit} className="flex gap-2 items-center">
                            <Check className="size-3 shrink-0 text-text-secondary" />
                            <span className="text-text-secondary text-body-small-regular">{limit}</span>
                        </div>
                    ))
                ) : (
                    <span className="text-text-secondary text-body-small-regular">{ENTERPRISE_PLAN_DESCRIPTION}</span>
                )}
            </div>
            <CardFooter>{ButtonComponent}</CardFooter>
        </Card>
    );
};

/**
 * Plan card footer CTA (Figma: plain label + a separate small "secondary" icon-only arrow button —
 * only the arrow sits inside a button chrome, the label itself is plain text). The label gets its
 * own sibling button/link with the same handler so the whole row is clickable, not just the icon.
 */
const PlanFooterCTA: React.FC<{
    label: string;
    disabled?: boolean;
    onClick?: () => void;
    href?: string;
    target?: string;
}> = ({ label, disabled, onClick, href, target }) => {
    const labelClasses = cn(
        'text-body-medium-medium text-left transition-colors',
        disabled ? 'text-text-disabled' : 'text-text-strong hover:text-text-secondary hover:underline'
    );

    if (href) {
        return (
            <div className="flex w-full items-center justify-between gap-2">
                <a href={href} target={target} rel="noopener noreferrer" className={labelClasses}>
                    {label}
                </a>
                <IconButton asChild variant="secondary" size="sm" label={label}>
                    <a href={href} target={target} rel="noopener noreferrer">
                        <ArrowRight />
                    </a>
                </IconButton>
            </div>
        );
    }

    return (
        <div className="flex w-full items-center justify-between gap-2">
            <button type="button" onClick={onClick} disabled={disabled} className={cn(labelClasses, 'cursor-pointer disabled:cursor-not-allowed')}>
                {label}
            </button>
            <IconButton variant="secondary" size="sm" label={label} onClick={onClick} disabled={disabled}>
                <ArrowRight />
            </IconButton>
        </div>
    );
};

const PlanChangeDialog: React.FC<{
    activePlan?: PlanDefinition | null;
    selectedPlan: PlanDefinitionList;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
}> = ({ activePlan, selectedPlan, open: openProp, onOpenChange, children }) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();

    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = openProp !== undefined;
    const open = isControlled ? openProp : internalOpen;
    const setOpen = useCallback(
        (value: boolean) => {
            if (!isControlled) {
                setInternalOpen(value);
            }
            if (!value) {
                setError(null);
            }
            onOpenChange?.(value);
        },
        [isControlled, onOpenChange]
    );

    const { mutateAsync: postPlanChange } = useApiPostPlanChange(env);

    const [loading, setLoading] = useState(false);
    const [longWait, setLongWait] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refInterval = useRef<NodeJS.Timeout>();

    /**
     * Extracts a `card_error` from the Stripe error or fallback to `defaultError`.
     *
     * @param error - The `StripeError` object returned from `confirmCardPayment`
     * @param defaultError - Fallback message when the error type is not user-actionable
     * @returns `card_error` message if present, otherwise the `defaultError`
     */
    const getStripeCardErrorOrDefault = (error: StripeError, defaultError: string = 'An error occurred while validating your payment.') => {
        switch (error.type) {
            case 'card_error':
                return error.message ?? defaultError;
            default:
                return defaultError;
        }
    };

    const onUpgrade = async () => {
        if (!selectedPlan?.plan.code) {
            return;
        }

        setLoading(true);
        setLongWait(false);
        setError(null);

        let json: Awaited<ReturnType<typeof postPlanChange>>;
        try {
            json = await postPlanChange({ orbId: selectedPlan.plan.code });
        } catch {
            setLoading(false);
            setError('An error occurred. Please try again.');
            return;
        }

        if ('paymentIntent' in json.data) {
            const stripe = await stripePromise;
            if (!stripe) {
                setLoading(false);
                setError('Payment processor failed to load. Please refresh the page and try again.');
                return;
            }

            const result = await stripe.confirmCardPayment(json.data.paymentIntent.client_secret);
            if (result.error) {
                setLoading(false);
                setError(getStripeCardErrorOrDefault(result.error));
                return;
            } else if (result.paymentIntent.status === 'succeeded') {
                console.log('payment success', result);
            }
        }

        refInterval.current = setInterval(async () => {
            const json = await fetchCurrentPlan(env).catch(() => null);
            if (!json) {
                return;
            }
            if (json.data.name !== selectedPlan.plan.code) {
                setLongWait(true);
                return;
            }

            clearInterval(refInterval.current);

            await Promise.all([
                queryClient.invalidateQueries({ exact: false, queryKey: ['plans'], type: 'all' }),
                queryClient.invalidateQueries({ queryKey: environmentQueryKey(env) })
            ]);

            setLongWait(false);
            setLoading(false);

            toast({ title: `Upgraded successfully to ${selectedPlan.plan.title}`, variant: 'success' });
        }, 500);
    };

    const onDowngrade = async () => {
        if (!selectedPlan?.plan.code) {
            return;
        }

        setLoading(true);
        setError(null);

        try {
            await postPlanChange({ orbId: selectedPlan.plan.code });
        } catch {
            setLoading(false);
            setError('An error occurred. Please try again.');
            return;
        }

        refInterval.current = setInterval(async () => {
            const json = await fetchCurrentPlan(env).catch(() => null);
            if (!json) {
                return;
            }
            if (json.data.orb_future_plan !== selectedPlan.plan.code) {
                setLongWait(true);
                return;
            }

            clearInterval(refInterval.current);

            await Promise.all([
                queryClient.invalidateQueries({ exact: false, queryKey: ['plans'], type: 'all' }),
                queryClient.invalidateQueries({ queryKey: environmentQueryKey(env) })
            ]);

            setLongWait(false);
            setLoading(false);

            toast({ title: `Downgraded successfully to ${selectedPlan.plan.title}`, variant: 'success' });
        }, 500);
    };

    useEffect(() => {
        if (!selectedPlan && refInterval.current) {
            clearInterval(refInterval.current);
            setLongWait(false);
        }

        return () => {
            if (refInterval.current) {
                clearInterval(refInterval.current);
            }
        };
    }, [selectedPlan]);

    const description = useMemo(() => {
        if (selectedPlan.isUpgrade) {
            return `The ${selectedPlan.plan.title} plan includes a ${selectedPlan.plan.basePrice} monthly base fee, plus additional usage-based charges. When you upgrade, you'll be charged a prorated base fee for the current month.`;
        }
        return `Your ${activePlan?.title ? activePlan.title : 'current'} subscription will end at the end of this month and won't renew. Any remaining usage will be billed after the month ends.`;
    }, [selectedPlan, activePlan]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {children && <DialogTrigger asChild>{children}</DialogTrigger>}
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        Confirm {selectedPlan.isUpgrade ? 'upgrade' : 'downgrade'} to {selectedPlan.plan.title} plan
                    </DialogTitle>
                    <DialogDescription className="sr-only">{description}</DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1 text-text-secondary text-sm">
                            <p>{description}</p>
                            {longWait && (
                                <p className="text-s text-text-muted text-right">{selectedPlan.isUpgrade ? 'Payment is processing...' : 'Downgrading...'}</p>
                            )}
                        </div>
                        {error && (
                            <Alert variant="error">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                    </div>
                </DialogBody>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline" size="sm">
                            Cancel
                        </Button>
                    </DialogClose>
                    <Button variant="primary" size="sm" onClick={selectedPlan.isUpgrade ? onUpgrade : onDowngrade} disabled={loading}>
                        {loading && <Loader className="size-4 animate-spin" />}
                        {selectedPlan.isUpgrade ? 'Upgrade' : 'Downgrade'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
