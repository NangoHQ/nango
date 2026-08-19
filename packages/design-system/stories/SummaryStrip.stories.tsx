import { Pencil } from 'lucide-react';

import { SummaryStrip } from '@/pages/Team/Billing/components/SummaryStrip';
import { IconButton } from '../src';

import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * The billing page's summary strip. Which slots appear is decided by `buildSummaryState` from the
 * account's plan — these stories cover every state that decision can produce.
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

/** Starter and Growth: the billing period renews, and the card is editable inline. */
export const Paid: Story = {
    args: {
        planTitle: 'Growth',
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
        planTitle: 'Starter',
        date: { label: 'RENEWS ON', value: 'September 1, 2026' }
    }
};

/** Free shows when its caps reset, and never a payment method — even when a card is on file. */
export const Free: Story = {
    args: {
        planTitle: 'Free',
        date: { label: 'LIMITS RESET', value: 'September 1, 2026' }
    }
};

/** A scheduled downgrade to Free: the plan isn't renewing, so the date is relabelled and explained. */
export const Downgrading: Story = {
    args: {
        planTitle: 'Starter',
        date: { label: 'CHANGES ON', value: 'September 1, 2026' },
        payment: { card: { brand: 'visa', last4: '7065' }, action: editCard },
        change: { toPlanTitle: 'Free', at: 'September 1, 2026', detail: 'no further charges after this period.' }
    }
};

/** A downgrade between paid plans, which needs no gloss — billing continues at the new plan's rate. */
export const DowngradingToSmallerPlan: Story = {
    args: {
        planTitle: 'Growth',
        date: { label: 'CHANGES ON', value: 'September 1, 2026' },
        payment: { card: { brand: 'visa', last4: '7065' }, action: editCard },
        change: { toPlanTitle: 'Starter', at: 'September 1, 2026', detail: null }
    }
};

/** A YC startup deal converting to Growth — same treatment, opposite direction. */
export const DealConverting: Story = {
    args: {
        planTitle: 'Startup deal',
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
        planTitle: 'Startup deal',
        payment: { card: { brand: 'visa', last4: '7065' }, action: editCard }
    }
};

/** While the plan resolves, nothing else can — the plan decides which slots exist. */
export const Loading: Story = {
    args: {
        planTitle: null
    }
};
