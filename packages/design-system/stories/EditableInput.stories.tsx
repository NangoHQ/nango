import { expect, fn, userEvent, within } from 'storybook/test';

import { EditableInput } from '@/components/patterns/EditableInput';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components/Patterns/EditableInput',
    parameters: { layout: 'padded' }
};
export default meta;
type Story = StoryObj<typeof meta>;

// Mirrors a typical field constraint (e.g. profile display name: min 3, max 32).
const validateName = (value: string): string | null => {
    if (value.trim().length === 0) return 'Name is required';
    if (value.length < 3) return 'Must be at least 3 characters';
    if (value.length > 32) return 'Must be 32 characters or fewer';
    return null;
};

/**
 * Overview of the states — click a field's pencil to switch it into edit mode.
 * The play function drives the "Validation" field into its error state so it's visible on load.
 */
export const Default: Story = {
    render: () => (
        <div className="flex flex-col gap-8 w-96">
            <div className="flex flex-col gap-2">
                <span className="story-section-heading">Editable</span>
                <EditableInput initialValue="my-github-connection" onSave={fn()} />
            </div>
            <div className="flex flex-col gap-2">
                <span className="story-section-heading">With hint text</span>
                <EditableInput initialValue="acme-prod" onSave={fn()} hintText="Lowercase letters, numbers, dashes." />
            </div>
            <div className="flex flex-col gap-2">
                <span className="story-section-heading">Secret</span>
                <EditableInput initialValue="sk_live_51H8sceretvalue" onSave={fn()} secret />
            </div>
            <div className="flex flex-col gap-2">
                <span className="story-section-heading">Secret multiline (private key)</span>
                {/* The only shipping textArea usage pairs it with `secret`: masked single line at rest, multiline editor on edit. */}
                <EditableInput
                    initialValue={'-----BEGIN RSA PRIVATE KEY-----\nMIIEvQIBAD...\n-----END RSA PRIVATE KEY-----'}
                    onSave={fn()}
                    secret
                    textArea
                    hintText="Paste the full key contents."
                />
            </div>
            <div className="flex flex-col gap-2">
                <span className="story-section-heading">Locked (with reason)</span>
                <EditableInput initialValue="prod" onSave={fn()} disabled="The production environment cannot be renamed." />
            </div>
            <div className="flex flex-col gap-2" data-testid="validation-field">
                <span className="story-section-heading">Validation</span>
                <EditableInput initialValue="acme" onSave={fn()} validate={validateName} hintText="Between 3 and 32 characters." />
            </div>
        </div>
    ),
    // Show the validation error state on load: enter edit mode on the validation field and type a too-short value.
    play: async ({ canvasElement }) => {
        const field = within(within(canvasElement).getByTestId('validation-field'));

        await userEvent.click(field.getByRole('button', { name: 'Edit' }));

        const input = field.getByRole('textbox');
        await userEvent.clear(input);
        await userEvent.type(input, 'ab');

        await expect(field.getByText('Must be at least 3 characters')).toBeVisible();
        await expect(field.getByRole('button', { name: 'Save' })).toBeDisabled();
    }
};
