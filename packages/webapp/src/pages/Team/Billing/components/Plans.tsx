import { ArrowRight, Check, Loader } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

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
import { Checkbox } from '@/components/ui/Checkbox';
import { Separator } from '@/components/ui/Separator';
import { usePlanOverrideStore } from '@/features/planOverride';
import { useMeta } from '@/hooks/useMeta';
import { usePermissions } from '@/hooks/usePermissions.js';
import { useApiGetPlans, useCurrentPlan } from '@/hooks/usePlan';
import { useStripePaymentMethods } from '@/hooks/useStripe.js';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { cn } from '@/utils/utils';
import { formatBillingDate, nextUsageResetDate } from '../billingPeriod.js';
import { isRetiredPlan, showsRetiredPlanCards } from '../planVisibility.js';
import { usePlanChangeRequest } from '../usePlanChangeRequest.js';
import { GrowthAddon } from './GrowthAddon.js';
import { PaymentMethodDialog } from './PaymentMethodDialog.js';
import { ENTERPRISE_PLAN_DESCRIPTION, GROWTH_ADDON_COPY, GROWTH_ADDON_PRICE, PLAN_CARD_LIMITS, S26_PLAN_CARDS } from './planCardCopy.js';

import type { PlanDefinitionList } from '../types.js';
import type { GrowthAddonState } from './GrowthAddon.js';
import type { S26PlanCard } from './planCardCopy.js';
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
                        hasGrowthFeatures={currentPlan?.has_growth_features === true}
                        closed={s26Pricing && !showsNewPlans && isRetiredPlan(plan.plan.code)}
                        paymentMethod={paymentMethod}
                    />
                ))}
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
    hasGrowthFeatures: boolean;
    /** Whether this plan is no longer something the account can move to. */
    closed?: boolean;
    paymentMethod?: StripePaymentMethod | null;
}> = ({ planDefinition, activePlan, activeIsOffered, card, hasGrowthFeatures, closed, paymentMethod }) => {
    const { plan, active, isFuture, isDowngrade, isUpgrade } = planDefinition;
    const addonOverride = usePlanOverrideStore((s) => s.addonState);
    // A scheduled removal isn't mirrored anywhere the dashboard can read, so that third state is
    // only ever reachable through the override.
    const addonState: GrowthAddonState = addonOverride ?? (hasGrowthFeatures ? 'active' : 'none');
    const [addonAction, setAddonAction] = useState<'add' | 'remove' | null>(null);

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

        return <CTA label={plan.cta ?? 'Contact us'} variant="outline" href="https://nango.dev/demo" target="_blank" />;
    })();

    if (card) {
        const showsAddon = active && plan.code === 'pay-as-you-go';
        const features = showsAddon || !card.addonTeaser ? card.features : [...card.features, card.addonTeaser];

        return (
            <Card selected={active}>
                <div className="flex flex-col gap-4 p-4 flex-1">
                    <div className="flex flex-col gap-1">
                        <span className="text-text-strong text-body-medium-semi">{plan.title}</span>
                        {card.priceSuffix ? (
                            <span className="text-text-default type-text-medium-md">
                                {card.price}
                                <span className="text-text-secondary type-text-regular-md">{card.priceSuffix}</span>
                            </span>
                        ) : (
                            <span className="text-text-secondary type-text-regular-md">{card.price}</span>
                        )}
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
                    {showsAddon && (
                        <>
                            <GrowthAddon state={addonState} onAdd={() => setAddonAction('add')} onRemove={() => setAddonAction('remove')} />
                            {addonAction && (
                                <GrowthAddonDialog planCode={plan.code} action={addonAction} open onOpenChange={(next) => !next && setAddonAction(null)} />
                            )}
                        </>
                    )}
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
    variant?: 'primary' | 'secondary' | 'outline';
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
    const { submit, reset, loading, longWait, error } = usePlanChangeRequest(env);

    const offersAddon = Boolean(newPricing && selectedPlan.isUpgrade && selectedPlan.plan.code === 'pay-as-you-go');
    const [withAddon, setWithAddon] = useState(false);
    const wantsAddon = offersAddon && withAddon;

    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = openProp !== undefined;
    const open = isControlled ? openProp : internalOpen;
    const setOpen = useCallback(
        (value: boolean) => {
            if (!isControlled) {
                setInternalOpen(value);
            }
            if (!value) {
                reset();
                setWithAddon(false);
            }
            onOpenChange?.(value);
        },
        [isControlled, onOpenChange, reset]
    );

    const code = selectedPlan.plan.code;
    const onConfirm = () => {
        if (selectedPlan.isUpgrade) {
            void submit({
                orbId: code,
                withGrowthFeatures: wantsAddon,
                settled: (plan) => plan.name === code && plan.has_growth_features === wantsAddon,
                successTitle: `Upgraded successfully to ${selectedPlan.plan.title}`
            });
            return;
        }
        void submit({
            orbId: code,
            withGrowthFeatures: false,
            settled: (plan) => plan.orb_future_plan === code,
            successTitle: `Downgraded successfully to ${selectedPlan.plan.title}`
        });
    };

    const switchesOn = formatBillingDate(nextUsageResetDate(new Date()));

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
            return `You'll keep ${activePlan?.title ?? 'your current plan'}'s features until the end of your current billing period. Your plan switches to ${selectedPlan.plan.title} on ${switchesOn}, and your usage will be capped to the ${selectedPlan.plan.title} limits.`;
        }
        return `Your ${activePlan?.title ? activePlan.title : 'current'} subscription will end at the end of this month and won't renew. Any remaining usage will be billed after the month ends.`;
    }, [selectedPlan, activePlan, newPricing, switchesOn]);

    const title =
        newPricing && !selectedPlan.isUpgrade
            ? `Downgrade to ${selectedPlan.plan.title}`
            : `Confirm ${selectedPlan.isUpgrade ? 'upgrade' : 'downgrade'} to ${selectedPlan.plan.title}${newPricing ? '' : ' plan'}`;
    const confirmLabel = selectedPlan.isUpgrade ? 'Upgrade' : newPricing ? `Downgrade to ${selectedPlan.plan.title}` : 'Downgrade';

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {children && <DialogTrigger asChild>{children}</DialogTrigger>}
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
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
                        {offersAddon && (
                            <>
                                <label className="flex gap-3 items-start rounded-md border border-dashed border-border-muted p-3 cursor-pointer">
                                    <Checkbox checked={withAddon} onCheckedChange={(checked) => setWithAddon(checked === true)} className="mt-0.5" />
                                    <span className="flex flex-col gap-1">
                                        <span className="text-text-strong text-body-medium-medium">Include {GROWTH_ADDON_COPY.title}</span>
                                        <span className="text-text-secondary text-body-medium-regular">{GROWTH_ADDON_COPY.price}</span>
                                        <span className="text-text-secondary text-body-small-regular">{GROWTH_ADDON_COPY.features}</span>
                                    </span>
                                </label>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-text-strong text-body-medium-medium">Monthly total</span>
                                    <span className="text-text-strong type-text-medium-md">
                                        ${(selectedPlan.plan.basePrice ?? 0) + (wantsAddon ? GROWTH_ADDON_PRICE : 0)}
                                        <span className="text-text-secondary type-text-regular-md">/mo</span>
                                    </span>
                                </div>
                            </>
                        )}
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
                    <Button variant={newPricing && !selectedPlan.isUpgrade ? 'danger' : 'primary'} size="sm" onClick={onConfirm} disabled={loading}>
                        {loading && <Loader className="size-4 animate-spin" />}
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

/**
 * `POST /plans/change` takes the desired end state, so moving the add-on is a plan change with the
 * plan code left where it is — there is no add-on endpoint of its own.
 */
const GrowthAddonDialog: React.FC<{
    planCode: PlanDefinition['code'];
    action: 'add' | 'remove';
    open: boolean;
    onOpenChange: (open: boolean) => void;
}> = ({ planCode, action, open, onOpenChange }) => {
    const env = useStore((state) => state.env);
    const { submit, reset, loading, error } = usePlanChangeRequest(env);
    const endsOn = formatBillingDate(nextUsageResetDate(new Date()));

    const setOpen = (value: boolean) => {
        if (!value) {
            reset();
        }
        onOpenChange(value);
    };

    const onConfirm = () => {
        if (action === 'add') {
            void submit({
                orbId: planCode,
                withGrowthFeatures: true,
                settled: (plan) => plan.has_growth_features,
                successTitle: `${GROWTH_ADDON_COPY.title} added`
            });
            return;
        }
        // A removal is scheduled for the end of the term, and nothing on the plan row mirrors that
        // yet, so there is no state to wait for.
        void submit({
            orbId: planCode,
            withGrowthFeatures: false,
            settled: null,
            successTitle: `${GROWTH_ADDON_COPY.title} will be removed on ${endsOn}`
        });
    };

    const description =
        action === 'add'
            ? `The ${GROWTH_ADDON_COPY.title} is ${GROWTH_ADDON_COPY.price.replace('/mo', '')} per month, billed alongside your plan. You'll be charged a prorated amount today, then the full amount from ${endsOn}.`
            : `You'll keep Growth features until the end of your current billing period. The add-on is removed on ${endsOn}, and you won't be charged for it after that.`;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {action === 'add' ? 'Confirm' : 'Remove'} {GROWTH_ADDON_COPY.title}
                    </DialogTitle>
                    <DialogDescription className="sr-only">{description}</DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <div className="flex flex-col gap-4">
                        <p className="text-text-secondary text-sm">{description}</p>
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
                    <Button variant={action === 'add' ? 'primary' : 'danger'} size="sm" onClick={onConfirm} disabled={loading}>
                        {loading && <Loader className="size-4 animate-spin" />}
                        {action === 'add' ? `Add ${GROWTH_ADDON_COPY.title}` : `Remove ${GROWTH_ADDON_COPY.title}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
