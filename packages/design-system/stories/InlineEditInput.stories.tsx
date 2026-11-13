import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';

import { InlineEditInput } from '@/components/patterns/InlineEditInput';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof InlineEditInput> = {
    component: InlineEditInput,
    title: 'App Components/Patterns/InlineEditInput',
    parameters: { layout: 'padded' },
    decorators: [
        (Story) => (
            <div className="w-96">
                <Story />
            </div>
        )
    ],
    args: {
        value: 'https://api.nango.dev/oauth/callback',
        mono: true,
        onSave: fn(() => Promise.resolve())
    }
};
export default meta;
type Story = StoryObj<typeof meta>;

const editingFooter = <p className="text-body-small-regular text-text-muted">Shown under the field while editing.</p>;

/** Read-only at rest — Copy + Edit addon. */
export const ReadOnly: Story = {};

/** Edit was clicked — the value is selected and the addon switches to Confirm (✕ cancel / ✓ save). Enter saves, Esc cancels. */
export const Editing: Story = {
    args: { editingFooter },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await userEvent.click(canvas.getByRole('button', { name: 'Edit' }));
        await expect(canvas.getByRole('textbox')).toHaveFocus();
        await expect(canvas.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    }
};

/** ✓ was clicked and the save is in flight — both Confirm buttons are disabled and ✓ shows a spinner. */
export const Saving: Story = {
    args: { editingFooter, onSave: fn(() => new Promise<void>(() => undefined)) },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await userEvent.click(canvas.getByRole('button', { name: 'Edit' }));
        await fireEvent.change(canvas.getByRole('textbox'), { target: { value: 'https://auth.acme.com/oauth/callback' } });
        await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
        await expect(canvas.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    }
};

/** No permission to edit — Edit is disabled with a permission tooltip; Copy still works. */
export const Disabled: Story = {
    args: { canEdit: false }
};
