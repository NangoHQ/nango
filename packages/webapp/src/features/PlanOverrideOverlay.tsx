import { ChevronLeft, X } from 'lucide-react';
import { Children, createContext, useContext, useId, useMemo } from 'react';

import { Button, IconButton } from '@nangohq/design-system';

import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Tag } from '@/components/ui/Tag';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useApiGetPlans, useCurrentPlan } from '@/hooks/usePlan';
import { hasMonthlySpend } from '@/pages/Team/Billing/planVisibility';
import { useStore } from '@/store';
import { cn } from '@/utils/utils';
import { DEFAULTS, usePlanOverrideStore } from './planOverride';

import type { PeriodCostsOverride, SpendOverride, UsageLimitOverride } from './planOverride';
import type { PlanDefinition } from '@nangohq/types';

const REAL_PLAN_VALUE = '__real__';
const NO_SCHEDULED_CHANGE_VALUE = '__none__';
const REAL_USAGE_VALUE = '__real_usage__';
const REAL_SPEND_VALUE = '__real_spend__';
const UNAVAILABLE_SPEND_VALUE = 'unavailable';
// A base-only Starter bill, a mid-period Growth bill, and the startup deal's real zero.
const SPEND_PRESETS_IN_CENTS = [0, 5000, 128430];
const REAL_PERIOD_COSTS_VALUE = '__real_period_costs__';
interface PlanOverrideContentProps {
    onBack: () => void;
    onClose: () => void;
}

export const PlanOverrideContent: React.FC<PlanOverrideContentProps> = ({ onBack, onClose }) => {
    const store = usePlanOverrideStore();
    const env = useStore((s) => s.env);
    const { data: plansList } = useApiGetPlans(env);
    const overrideCode = usePlanOverrideStore((s) => s.overrideCode);
    const setOverride = usePlanOverrideStore((s) => s.setOverride);
    const scheduledTargetCode = usePlanOverrideStore((s) => s.scheduledTargetCode);
    const setScheduledTarget = usePlanOverrideStore((s) => s.setScheduledTarget);
    const overdueOverride = usePlanOverrideStore((s) => s.overdueOverride);
    const setOverdueOverride = usePlanOverrideStore((s) => s.setOverdueOverride);
    const usageLimitOverride = usePlanOverrideStore((s) => s.usageLimitOverride);
    const setUsageLimitOverride = usePlanOverrideStore((s) => s.setUsageLimitOverride);
    const spendHeadlineEnabled = usePlanOverrideStore((s) => s.spendHeadlineEnabled);
    const setSpendHeadlineEnabled = usePlanOverrideStore((s) => s.setSpendHeadlineEnabled);
    const spendOverride = usePlanOverrideStore((s) => s.spendOverride);
    const setSpendOverride = usePlanOverrideStore((s) => s.setSpendOverride);
    const metricChargesEnabled = usePlanOverrideStore((s) => s.metricChargesEnabled);
    const setMetricChargesEnabled = usePlanOverrideStore((s) => s.setMetricChargesEnabled);
    const periodCostsOverride = usePlanOverrideStore((s) => s.periodCostsOverride);
    const setPeriodCostsOverride = usePlanOverrideStore((s) => s.setPeriodCostsOverride);
    const paymentMethodOverride = usePlanOverrideStore((s) => s.paymentMethodOverride);
    const setPaymentMethodOverride = usePlanOverrideStore((s) => s.setPaymentMethodOverride);
    const resetAll = usePlanOverrideStore((s) => s.resetAll);

    // Plan caps are enforced on Free only, so that simulator is offered there alone. Overdue invoices
    // aren't plan-specific — a downgraded account can still owe one — so that one is always offered.
    const { data: environmentData } = useCurrentPlan(env);
    const isFreePlan = environmentData?.plan?.name === 'free';
    const leadsWithSpend = hasMonthlySpend(environmentData?.plan);

    // Several plans share a title — `starter` and `starter-legacy` are both "Starter (legacy)", as are
    // `growth` and `growth-legacy` — which makes them indistinguishable in the list. Append the code to
    // whichever titles collide, so the pairs stay tellable apart without labelling every plan twice.
    const ambiguousTitles = useMemo(() => {
        const seen = new Set<string>();
        const duplicated = new Set<string>();
        for (const plan of plansList?.data ?? []) {
            if (seen.has(plan.title)) {
                duplicated.add(plan.title);
            }
            seen.add(plan.title);
        }
        return duplicated;
    }, [plansList]);

    const prevPlanCodes = plansList?.data.find((plan) => plan.code === overrideCode)?.prevPlan;
    const scheduledChangeOptions = plansList?.data.filter((plan) => prevPlanCodes?.includes(plan.code));

    // `useCurrentPlan` already has the override applied, so the real plan has to come from the
    // un-overridden query or the caption would name whatever is being previewed.
    const realPlanName = useEnvironment(env).data?.plan?.name;
    const realPlanTitle = plansList?.data.find((plan) => plan.code === realPlanName)?.title;
    const overrides = Object.entries(DEFAULTS).filter(([key, value]) => store[key as keyof typeof DEFAULTS] !== value).length;

    return (
        <>
            <div className="flex shrink-0 items-center justify-between border-b border-border-muted px-4 py-3">
                <div className="flex items-center gap-2">
                    <IconButton variant="ghost" size="2xs" label="Back" onClick={onBack}>
                        <ChevronLeft className="size-3.5" />
                    </IconButton>
                    <span className="font-medium text-text-default">Billing Overrides</span>
                    {overrides > 0 && <Tag variant="info">{overrides} active</Tag>}
                </div>
                <div className="flex items-center gap-1">
                    {overrides > 0 && (
                        <Button variant="link-accent" size="xs" onClick={resetAll}>
                            Reset
                        </Button>
                    )}
                    <IconButton variant="ghost" size="2xs" label="Close" onClick={onClose}>
                        <X className="size-3.5" />
                    </IconButton>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                    <Select
                        value={overrideCode ?? REAL_PLAN_VALUE}
                        onValueChange={(value) => setOverride(value === REAL_PLAN_VALUE ? null : (value as PlanDefinition['code']))}
                    >
                        <SelectTrigger className="w-full text-sm px-2.5 gap-2">
                            <SelectValue placeholder="Real plan" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={REAL_PLAN_VALUE}>Real plan (no override)</SelectItem>
                            {plansList?.data.map((plan) => (
                                <SelectItem key={plan.code} value={plan.code}>
                                    {ambiguousTitles.has(plan.title) ? `${plan.title} · ${plan.code}` : plan.title}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-text-muted">
                        {overrideCode ? `Display only — really on ${realPlanTitle ?? realPlanName}.` : 'Display only. Nothing here bills.'}
                    </p>
                </div>

                <Section title="Plan state">
                    {scheduledChangeOptions && scheduledChangeOptions.length > 0 && (
                        <Row label="Scheduled change">
                            <Select
                                value={scheduledTargetCode ?? NO_SCHEDULED_CHANGE_VALUE}
                                onValueChange={(value) => setScheduledTarget(value === NO_SCHEDULED_CHANGE_VALUE ? null : (value as PlanDefinition['code']))}
                            >
                                <RowTrigger placeholder="None" />
                                <SelectContent>
                                    <SelectItem value={NO_SCHEDULED_CHANGE_VALUE}>None</SelectItem>
                                    {scheduledChangeOptions.map((plan) => (
                                        <SelectItem key={plan.code} value={plan.code}>
                                            {plan.code === 'free' ? 'Free (cancellation)' : `${plan.title} (downgrade)`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Row>
                    )}

                    {isFreePlan && (
                        <Row label="Plan limits">
                            <Select
                                value={usageLimitOverride ?? REAL_USAGE_VALUE}
                                onValueChange={(value) => setUsageLimitOverride(value === REAL_USAGE_VALUE ? null : (value as UsageLimitOverride))}
                            >
                                <RowTrigger placeholder="Real" />
                                <SelectContent>
                                    <SelectItem value={REAL_USAGE_VALUE}>Real</SelectItem>
                                    <SelectItem value="near">Nearing limits</SelectItem>
                                    <SelectItem value="over">Limits reached</SelectItem>
                                </SelectContent>
                            </Select>
                        </Row>
                    )}
                </Section>

                <Section title="Billing">
                    <Row label="Card on file" hint="A real card needs Stripe test keys and a setup round-trip; this skips both.">
                        <RowSwitch checked={paymentMethodOverride} onCheckedChange={setPaymentMethodOverride} />
                    </Row>
                    <Row label="Overdue invoices">
                        <RowSwitch checked={overdueOverride} onCheckedChange={setOverdueOverride} />
                    </Row>

                    {leadsWithSpend && (
                        <>
                            <Row label="Spend headline" hint="Unverified against real Orb invoices, so customers do not see it yet.">
                                <RowSwitch checked={spendHeadlineEnabled} onCheckedChange={setSpendHeadlineEnabled} />
                            </Row>
                            {spendHeadlineEnabled && (
                                <Row label="Spend" indent>
                                    <Select
                                        value={spendOverride === null ? REAL_SPEND_VALUE : String(spendOverride)}
                                        onValueChange={(value) =>
                                            setSpendOverride(
                                                value === REAL_SPEND_VALUE
                                                    ? null
                                                    : value === UNAVAILABLE_SPEND_VALUE
                                                      ? UNAVAILABLE_SPEND_VALUE
                                                      : (Number(value) as SpendOverride)
                                            )
                                        }
                                    >
                                        <RowTrigger placeholder="Real" />
                                        <SelectContent>
                                            <SelectItem value={REAL_SPEND_VALUE}>Real</SelectItem>
                                            {SPEND_PRESETS_IN_CENTS.map((cents) => (
                                                <SelectItem key={cents} value={String(cents)}>
                                                    {(cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                                </SelectItem>
                                            ))}
                                            <SelectItem value={UNAVAILABLE_SPEND_VALUE}>Unavailable</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Row>
                            )}

                            <Row label="Charges column" hint="Unverified against real Orb invoices, so customers do not see it yet.">
                                <RowSwitch checked={metricChargesEnabled} onCheckedChange={setMetricChargesEnabled} />
                            </Row>
                            {metricChargesEnabled && (
                                <Row label="Charges" indent>
                                    <Select
                                        value={periodCostsOverride ?? REAL_PERIOD_COSTS_VALUE}
                                        onValueChange={(value) =>
                                            setPeriodCostsOverride(value === REAL_PERIOD_COSTS_VALUE ? null : (value as PeriodCostsOverride))
                                        }
                                    >
                                        <RowTrigger placeholder="Real" />
                                        <SelectContent>
                                            <SelectItem value={REAL_PERIOD_COSTS_VALUE}>Real</SelectItem>
                                            <SelectItem value="populated">Some metrics</SelectItem>
                                            <SelectItem value="zero">$0.00 on all</SelectItem>
                                            <SelectItem value="unavailable">Unavailable</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Row>
                            )}
                        </>
                    )}
                </Section>
            </div>
        </>
    );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
    const hasRows = Children.toArray(children).some(Boolean);
    if (!hasRows) {
        return null;
    }
    return (
        <div className="flex flex-col gap-1">
            <span className="type-label-xs uppercase text-text-muted px-1 pb-1">{title}</span>
            {children}
        </div>
    );
};

// A row's control is named by the label beside it rather than by any text of its own.
const RowLabelContext = createContext<string | undefined>(undefined);

const Row: React.FC<{ label: string; hint?: string; indent?: boolean; children: React.ReactNode }> = ({ label, hint, indent, children }) => {
    const labelId = useId();
    return (
        <div className={cn('flex items-center justify-between gap-3 min-h-8 px-1', indent && 'pl-5')}>
            <span className="flex items-center gap-1.5 text-sm text-text-default">
                <span id={labelId}>{label}</span>
                {hint && <InfoTooltip side="right">{hint}</InfoTooltip>}
            </span>
            <RowLabelContext.Provider value={labelId}>{children}</RowLabelContext.Provider>
        </div>
    );
};

const RowTrigger: React.FC<{ placeholder: string }> = ({ placeholder }) => {
    const labelId = useContext(RowLabelContext);
    // Naming the trigger by the row label alone would drop the selected value from its name, so it
    // also points at itself — the two ids read as "<label> <value>".
    const valueId = useId();
    return (
        <SelectTrigger id={valueId} aria-labelledby={labelId ? `${labelId} ${valueId}` : undefined} className="w-52 text-sm px-2.5 gap-2">
            <SelectValue placeholder={placeholder} />
        </SelectTrigger>
    );
};

const RowSwitch: React.FC<React.ComponentProps<typeof Switch>> = (props) => <Switch aria-labelledby={useContext(RowLabelContext)} {...props} />;
