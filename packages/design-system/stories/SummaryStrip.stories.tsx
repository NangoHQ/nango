import { Pencil } from 'lucide-react';

import { SummaryStrip } from '@/pages/Team/Billing/components/SummaryStrip';
import { SPEND_TOOLTIP, SPEND_TOOLTIP_WITHOUT_CHARGES } from '@/pages/Team/Billing/summaryState';
import { IconButton } from '../src';

import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * The billing page's summary strip. Which slots appear is decided by `buildSummaryState` from the
 * account's plan — these stories cover every state that decision can produce.
 *
 * Billed plans lead with the period's accrued spend and demote the plan name to its own slot; Free
 * leads with the plan name.
 *
 * Legacy, enterprise and free-uncapped accounts (30 today) render no strip at all, so they have no
 * story: their terms are negotiated per customer or nothing is billable.
 */
const meta: Meta<typeof SummaryStrip> = {
    component: SummaryStrip,
    title: 'Features/Billing/SummaryStrip',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const editCard = (
    <IconButton variant="ghost" size="2xs" label="Edit payment method">
        <Pencil className="size-3" />
    </IconButton>
);

/** Starter and Growth: spend leads, the plan moves to its own slot, and the card is editable inline. */
export const Paid: Story = {
    args: {
        headline: { label: 'CURRENT PERIOD SPEND', value: '$1,284.30', tooltip: SPEND_TOOLTIP },
        plan: { value: 'Growth' },
        date: { label: 'RENEWS ON', value: 'September 1, 2026' },
        payment: { card: { brand: 'visa', last4: '7065' }, action: editCard }
    }
};

/** The startup deal rates to $0.00 at any volume, so zero is the figure rather than a missing one. */
export const DealWithZeroSpend: Story = {
    args: {
        headline: { label: 'CURRENT PERIOD SPEND', value: '$0.00', tooltip: SPEND_TOOLTIP_WITHOUT_CHARGES },
        plan: { value: 'Startup deal' },
        payment: { card: { brand: 'visa', last4: '7065' }, action: editCard }
    }
};

/**
 * The Orb read failed or had nothing drafted. Falls back to the plan headline rather than an
 * error — a failed read isn't something the customer can act on.
 */
export const SpendUnavailable: Story = {
    args: {
        headline: { label: 'CURRENT PLAN', value: 'Growth' },
        date: { label: 'RENEWS ON', value: 'September 1, 2026' },
        payment: { card: { brand: 'visa', last4: '7065' }, action: editCard }
    }
};

/**
 * No card on file — typically a customer paying by invoice or wire. The payment slot is dropped
 * rather than dashed; a card gets added from the billing information section below. A viewer
 * without the billing permission sees this same shape.
 */
export const PaidWithoutCard: Story = {
    args: {
        headline: { label: 'CURRENT PERIOD SPEND', value: '$50.00', tooltip: SPEND_TOOLTIP },
        plan: { value: 'Starter' },
        date: { label: 'RENEWS ON', value: 'September 1, 2026' }
    }
};

/** Free shows when its caps reset, and never a payment method — even when a card is on file. */
export const Free: Story = {
    args: {
        headline: { label: 'CURRENT PLAN', value: 'Free' },
        date: { label: 'LIMITS RESET', value: 'September 1, 2026' }
    }
};

/** A scheduled downgrade to Free: the plan isn't renewing, so the date is relabelled and explained. */
export const Downgrading: Story = {
    args: {
        headline: { label: 'CURRENT PERIOD SPEND', value: '$50.00', tooltip: SPEND_TOOLTIP },
        plan: { value: 'Starter' },
        date: { label: 'CHANGES ON', value: 'September 1, 2026' },
        payment: { card: { brand: 'visa', last4: '7065' }, action: editCard },
        change: { toPlanTitle: 'Free', at: 'September 1, 2026', detail: 'no further charges after this period.' }
    }
};

/** A downgrade between paid plans, which needs no gloss — billing continues at the new plan's rate. */
export const DowngradingToSmallerPlan: Story = {
    args: {
        headline: { label: 'CURRENT PERIOD SPEND', value: '$1,284.30', tooltip: SPEND_TOOLTIP },
        plan: { value: 'Growth' },
        date: { label: 'CHANGES ON', value: 'September 1, 2026' },
        payment: { card: { brand: 'visa', last4: '7065' }, action: editCard },
        change: { toPlanTitle: 'Starter', at: 'September 1, 2026', detail: null }
    }
};

/** A YC startup deal converting to Growth — same treatment, opposite direction. */
export const DealConverting: Story = {
    args: {
        headline: { label: 'CURRENT PERIOD SPEND', value: '$0.00', tooltip: SPEND_TOOLTIP_WITHOUT_CHARGES },
        plan: { value: 'Startup deal' },
        date: { label: 'CHANGES ON', value: 'September 25, 2026' },
        payment: { card: { brand: 'visa', last4: '7065' }, action: editCard },
        change: {
            toPlanTitle: 'Growth',
            at: 'September 25, 2026',
            detail: "your startup deal ends and you'll be charged at standard Growth pricing."
        }
    }
};

/** A deal with no conversion date stored yet — no date rather than a false renewal (NAN-6640). */
export const DealWithoutDate: Story = {
    args: {
        headline: { label: 'CURRENT PERIOD SPEND', value: '$0.00', tooltip: SPEND_TOOLTIP_WITHOUT_CHARGES },
        plan: { value: 'Startup deal' },
        payment: { card: { brand: 'visa', last4: '7065' }, action: editCard }
    }
};

/** The only loading state: the card waits for the plan *and* the spend figure, then reveals at once. */
export const Loading: Story = {
    args: {
        headline: null
    }
};
