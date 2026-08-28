import { ArrowRight, Check, ExternalLink, Loader } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { permissions } from '@nangohq/authz';
import {
    Alert,
    AlertDescription,
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
import { Separator } from '@/components/ui/Separator';
import { usePlanOverrideStore } from '@/features/planOverride';
import { environmentQueryKey } from '@/hooks/useEnvironment';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions.js';
import { fetchCurrentPlan, useApiGetPlans, useApiPostPlanChange, useCurrentPlan } from '@/hooks/usePlan';
import { useStripePaymentMethods } from '@/hooks/useStripe.js';
import { useToast } from '@/hooks/useToast.js';
import { queryClient, useStore } from '@/store';
import { track } from '@/utils/analytics';
import { stripePromise } from '@/utils/stripe.js';
import { cn } from '@/utils/utils';
import { formatBillingDate, nextUsageResetDate } from '../billingPeriod.js';
import { isRetiredPlan, showsRetiredPlanCards } from '../planVisibility.js';
import { GrowthAddon } from './GrowthAddon.js';
import { PaymentMethodDialog } from './PaymentMethodDialog.js';
import { ENTERPRISE_PLAN_DESCRIPTION, PLAN_CARD_LIMITS, S26_PLAN_CARDS } from './planCardCopy.js';

import type { PlanDefinitionList } from '../types.js';
import type { S26PlanCard } from './planCardCopy.js';
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

    const { data: metaData } = useMeta();
    const s26Pricing = metaData?.data.s26Pricing === true;
    const showsNewPlans = s26Pricing && !showsRetiredPlanCards(currentPlan);

    const plans = useMemo<null | { list: PlanDefinitionList[]; activePlan: PlanDefinition }>(() => {
        if (!currentPlan || !plansList) {
            return null;
        }

        const curr = plansList.data.find((p) => p.code === currentPlan.name)!;

        // Picked by code rather than by `hidden`: `pay-as-you-go` is hidden in `plansList`, yet is one
        // of the three cards.
        const offered = showsNewPlans
            ? S26_PLAN_CARDS.map((card) => plansList.data.find((p) => p.code === card.code)).filter((p) => p !== undefined)
            : plansList.data.filter((p) => !p.hidden);

        const list: PlanDefinitionList[] = offered.map((plan) => ({
            plan,
            active: plan.code === currentPlan.name,
            isFuture: plan.code === currentPlan.orb_future_plan,
            isDowngrade: curr.prevPlan?.includes(plan.code) || false,
            isUpgrade: curr.nextPlan?.includes(plan.code) || false
        }));
        return { list, activePlan: curr };
    }, [currentPlan, plansList, showsNewPlans]);

    // `pay-as-you-go` is `hidden` yet is one of the cards, so `hidden` can't answer whether the
    // account's own plan is on screen — which is what the summary card and self-serve both turn on.
    const activeIsOffered = plans?.list.some((p) => p.active) ?? false;

    return (
        <div className="flex flex-col gap-4">
            {plans && !activeIsOffered && <CurrentPlanCard plan={plans.activePlan} />}
            <div className={cn('grid gap-4', showsNewPlans ? 'grid-cols-3' : 'grid-cols-4')}>
                {plans?.list.map((plan) => (
                    <PlanCard
                        key={plan.plan.code}
                        planDefinition={plan}
                        activePlan={plans?.activePlan}
                        activeIsOffered={activeIsOffered}
                        card={showsNewPlans ? S26_PLAN_CARDS.find((c) => c.code === plan.plan.code) : undefined}
                        closed={s26Pricing && !showsNewPlans && isRetiredPlan(plan.plan.code)}
                        paymentMethod={paymentMethod}
                    />
                ))}
            </div>
            <div className="self-start">
                <Button asChild variant="link-accent">
                    <a href="https://nango.dev/pricing" target="_blank" rel="noopener noreferrer">
                        View full pricing detail
                        <ExternalLink />
                    </a>
                </Button>
            </div>
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
    activeIsOffered: boolean;
    /** Undefined while the old set of cards is on screen. */
    card?: S26PlanCard;
    /** Whether this plan is no longer something the account can move to. */
    closed?: boolean;
    paymentMethod?: StripePaymentMethod | null;
}> = ({ planDefinition, activePlan, activeIsOffered, card, closed, paymentMethod }) => {
    const { plan, active, isFuture, isDowngrade, isUpgrade } = planDefinition;
    const addonState = usePlanOverrideStore((s) => s.addonState);

    const { can } = usePermissions();
    const canChangePlan = can(permissions.canChangePlan);

    const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false);
    const [planChangeDialogOpen, setPlanChangeDialogOpen] = useState(false);

    const onUpgradeClicked = useCallback(() => {
        track('web:usage:upgrade_clicked', {});
        if (!paymentMethod) {
            setPaymentMethodDialogOpen(true);
        } else {
            setPlanChangeDialogOpen(true);
        }
    }, [paymentMethod]);

    const CTA = card ? PlanFooterButton : PlanFooterCTA;

    const ButtonComponent = (() => {
        if (active) {
            return <CTA label={card ? 'Your plan' : 'Current plan'} disabled />;
        }
        if (isFuture) {
            return <CTA label="Scheduled" disabled />;
        }

        // Once the account is on a custom/negotiated plan — Enterprise, or any tier that isn't one of
        // the cards on screen (legacy v1 plans, other old/negotiated plans) — plan changes go through
        // sales rather than self-serve upgrade/downgrade, even if that plan's own definition would
        // otherwise permit a move (e.g. legacy Growth's `prevPlan` still lists Free). Every other card
        // routes to Contact Us instead.
        const selfServeChange = activeIsOffered && activePlan?.canChange !== false;

        if (!closed && isUpgrade && plan.canChange && selfServeChange) {
            return (
                <>
                    <PermissionGate asChild condition={canChangePlan}>
                        {(allowed) => <CTA label="Upgrade" variant="primary" onClick={onUpgradeClicked} disabled={!allowed} />}
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
                        newPricing={!!card}
                    />
                </>
            );
        }

        if (!closed && isDowngrade && plan.canChange && selfServeChange) {
            return (
                <>
                    <PermissionGate asChild condition={canChangePlan}>
                        {(allowed) => <CTA label="Downgrade" onClick={() => setPlanChangeDialogOpen(true)} disabled={!allowed} />}
                    </PermissionGate>
                    <PlanChangeDialog
                        open={planChangeDialogOpen}
                        onOpenChange={setPlanChangeDialogOpen}
                        selectedPlan={planDefinition}
                        activePlan={activePlan}
                        newPricing={!!card}
                    />
                </>
            );
        }

        return <CTA label={plan.cta ?? 'Contact us'} href="https://nango.dev/demo" target="_blank" />;
    })();

    if (card) {
        const showsAddon = active && plan.code === 'pay-as-you-go';
        const features = showsAddon || !card.addonTeaser ? card.features : [...card.features, card.addonTeaser];

        return (
            <Card selected={active}>
                <div className="flex flex-col gap-4 p-4 flex-1">
                    <div className="flex flex-col gap-1">
                        <span className="text-text-strong text-body-medium-medium">{plan.title}</span>
                        <span className="text-text-strong text-body-large-medium">
                            {card.price}
                            {card.priceSuffix && <span className="text-text-secondary text-body-medium-regular">{card.priceSuffix}</span>}
                        </span>
                        <span className="text-text-muted text-body-small-regular">{card.tagline}</span>
                    </div>
                    <Separator />
                    <ul className="flex flex-col gap-2">
                        {features.map((feature) => (
                            <li key={feature} className="flex gap-2 items-baseline">
                                <span className="text-text-muted text-body-small-regular">&middot;</span>
                                <span className="text-text-secondary text-body-small-regular">{feature}</span>
                            </li>
                        ))}
                    </ul>
                    {showsAddon && <GrowthAddon state={addonState} />}
                </div>
                <CardFooter>{ButtonComponent}</CardFooter>
            </Card>
        );
    }

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

interface PlanFooterProps {
    label: string;
    variant?: 'primary' | 'secondary';
    disabled?: boolean;
    onClick?: () => void;
    href?: string;
    target?: string;
}

/**
 * The design system has no full-width variant and forbids `className` on its components, so the
 * one-column grid stretches the button rather than a class on it.
 */
const PlanFooterButton: React.FC<PlanFooterProps> = ({ label, variant = 'secondary', disabled, onClick, href, target }) => {
    return (
        <div className="grid w-full">
            {href ? (
                <Button asChild variant={variant} size="md">
                    <a href={href} target={target} rel="noopener noreferrer">
                        {label}
                    </a>
                </Button>
            ) : (
                <Button variant={variant} size="md" disabled={disabled} onClick={onClick}>
                    {label}
                </Button>
            )}
        </div>
    );
};

const PlanFooterCTA: React.FC<PlanFooterProps> = ({ label, disabled, onClick, href, target }) => {
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
    newPricing?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
}> = ({ activePlan, selectedPlan, newPricing, open: openProp, onOpenChange, children }) => {
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
            if (newPricing) {
                // Orb prices every metric in arrears under a plan-level minimum, so there is no base
                // fee to prorate and the upgrade collects nothing.
                return `${selectedPlan.plan.title} bills at the end of each month — your usage, or a $${selectedPlan.plan.basePrice} monthly minimum, whichever is higher. Nothing is charged today.`;
            }
            return `The ${selectedPlan.plan.title} plan includes a ${selectedPlan.plan.basePrice} monthly base fee, plus additional usage-based charges. When you upgrade, you'll be charged a prorated base fee for the current month.`;
        }
        if (newPricing) {
            const switchesOn = formatBillingDate(nextUsageResetDate(new Date()));
            return `You'll keep ${activePlan?.title ?? 'your current plan'}'s features until the end of your current billing period. Your plan switches to ${selectedPlan.plan.title} on ${switchesOn}, and your usage will be capped to the ${selectedPlan.plan.title} limits.`;
        }
        return `Your ${activePlan?.title ? activePlan.title : 'current'} subscription will end at the end of this month and won't renew. Any remaining usage will be billed after the month ends.`;
    }, [selectedPlan, activePlan, newPricing]);

    const confirmLabel = selectedPlan.isUpgrade ? 'Upgrade' : newPricing ? `Downgrade to ${selectedPlan.plan.title}` : 'Downgrade';

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {children && <DialogTrigger asChild>{children}</DialogTrigger>}
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {newPricing && !selectedPlan.isUpgrade
                            ? `Downgrade to ${selectedPlan.plan.title}`
                            : `Confirm ${selectedPlan.isUpgrade ? 'upgrade' : 'downgrade'} to ${selectedPlan.plan.title}${newPricing ? '' : ' plan'}`}
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
                            <Alert variant="danger">
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
                    <Button
                        variant={newPricing && !selectedPlan.isUpgrade ? 'danger' : 'primary'}
                        size="sm"
                        onClick={selectedPlan.isUpgrade ? onUpgrade : onDowngrade}
                        disabled={loading}
                    >
                        {loading && <Loader className="size-4 animate-spin" />}
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
