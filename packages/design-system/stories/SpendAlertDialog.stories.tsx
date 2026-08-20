import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { userEvent, within } from 'storybook/test';

import { SpendAlertDialog } from '@/pages/Team/Billing/components/SpendAlertDialog';
import { Button } from '../src';

import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * The dialog behind the spend alerts section's add and edit actions. An account can hold one
 * threshold, so both actions are the same form over the same request — only the starting value and
 * the wording differ.
 *
 * The label carries the currency, so the field itself takes a bare amount. Saving needs the API, so
 * these stories cover the form up to submission.
 */
const meta: Meta<typeof SpendAlertDialog> = {
    component: SpendAlertDialog,
    title: 'Features/Billing/SpendAlertDialog',
    parameters: { layout: 'padded' },
    decorators: [
        (Story) => (
            <QueryClientProvider client={new QueryClient()}>
                <Story />
            </QueryClientProvider>
        )
    ]
};
export default meta;
type Story = StoryObj<typeof meta>;

const openDialog: Story['play'] = async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button'));
};

export const Add: Story = {
    args: {
        currency: 'USD',
        children: <Button variant="link-accent">Add spend alert</Button>
    },
    play: openDialog
};

/** Editing starts from the saved threshold, written the way it would have been typed. */
export const Edit: Story = {
    args: {
        thresholdInCents: 4999,
        currency: 'USD',
        children: <Button variant="link-accent">Edit spend alert</Button>
    },
    play: openDialog
};

/** The amount is in the subscription's own currency, which the label names. */
export const NonUsdCurrency: Story = {
    args: {
        currency: 'EUR',
        children: <Button variant="link-accent">Add spend alert</Button>
    },
    play: openDialog
};

/**
 * Orb bills some customers in units that aren't a currency. With no symbol to name, the label drops
 * the parenthetical rather than guessing at dollars.
 */
export const NoCurrency: Story = {
    args: {
        currency: null,
        children: <Button variant="link-accent">Add spend alert</Button>
    },
    play: openDialog
};

/** Anything the field can't read as an amount is explained in place of the description. */
export const InvalidAmount: Story = {
    args: {
        currency: 'USD',
        children: <Button variant="link-accent">Add spend alert</Button>
    },
    play: async (context) => {
        await openDialog?.(context);
        const dialog = within(await within(document.body).findByRole('dialog'));
        await userEvent.type(dialog.getByRole('textbox'), '49.999');
        await userEvent.click(dialog.getByRole('button', { name: 'Add alert' }));
    }
};
