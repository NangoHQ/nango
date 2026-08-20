import { Pencil, Plus, Trash2 } from 'lucide-react';

import { SpendAlertsSection } from '@/pages/Team/Billing/components/SpendAlertsSection';
import { Button, IconButton } from '../src';

import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * The billing page's spend alerts section, between Usage and Plans.
 *
 * An account can set one threshold; crossing it emails the billing contacts. Orb stores and
 * evaluates it as the subscription's single `cost_exceeded` alert, which is why there is never more
 * than one row — the add action gives way to the configured row rather than sitting beside it.
 *
 * Only plans billed on a monthly cycle (Starter, Growth, the startup deal) see the section at all,
 * and only to someone who can manage billing.
 */
const meta: Meta<typeof SpendAlertsSection> = {
    component: SpendAlertsSection,
    title: 'Features/Billing/SpendAlerts',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const addAction = (
    <Button variant="link-accent">
        <Plus /> Add spend alert
    </Button>
);

const rowActions = (
    <>
        <IconButton variant="ghost" size="xs" label="Edit spend alert">
            <Pencil />
        </IconButton>
        <IconButton variant="ghost" size="xs" label="Remove spend alert">
            <Trash2 />
        </IconButton>
    </>
);

/** No threshold set yet — the header carries the only action, and there is no empty card to fill. */
export const Empty: Story = {
    args: { thresholdInCents: null, currency: 'USD', addAction, rowActions }
};

/** One threshold set. The add action is gone; the row's pencil is how the amount changes. */
export const WithThreshold: Story = {
    args: { thresholdInCents: 5000, currency: 'USD', addAction, rowActions }
};

/** The amount renders in the subscription's own currency, not always dollars. */
export const NonUsdCurrency: Story = {
    args: { thresholdInCents: 128430, currency: 'EUR', addAction, rowActions }
};

/**
 * Orb bills some customers in units that aren't a currency, so there's no symbol to show. The
 * amount is stated bare rather than dropped or guessed at as dollars.
 */
export const NoCurrency: Story = {
    args: { thresholdInCents: 5000, currency: null, addAction, rowActions }
};

/**
 * The header is final from the first paint — only the row is unknown — so nothing reflows when the
 * threshold lands.
 */
export const Loading: Story = {
    args: { thresholdInCents: null, currency: null, isPending: true, addAction, rowActions }
};

/** The read failed. No add action either: we don't know whether one is already set. */
export const Error: Story = {
    args: { thresholdInCents: null, currency: null, isError: true, addAction, rowActions }
};
