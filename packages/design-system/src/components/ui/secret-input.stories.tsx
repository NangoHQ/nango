import { SecretInput } from './secret-input';

import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/SecretInput',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

const SECRET = 'example-secret-7f3a9c21d4e8';

const ROWS = [
    { label: 'Read-only', node: <SecretInput value={SECRET} /> },
    { label: 'Reveal unavailable', node: <SecretInput value={SECRET} canReveal={false} disabledReason="You can't view this secret." /> },
    { label: 'Disabled', node: <SecretInput value={SECRET} disabled /> },
    { label: 'Editable', node: <SecretInput editable defaultValue={SECRET} /> },
    { label: 'Editable, empty', node: <SecretInput editable placeholder="Client secret" /> },
    { label: 'Editable, invalid', node: <SecretInput editable defaultValue="too-short" aria-invalid /> }
];

/** Click the eye to reveal, the copy icon to copy. Hover the disabled buttons in "Reveal unavailable" for the reason. */
export const States: Story = {
    render: () => (
        <div className="grid grid-cols-[max-content_320px] items-center gap-x-8 gap-y-4">
            {ROWS.map((row) => (
                <div key={row.label} className="contents">
                    <span className="story-section-heading">{row.label}</span>
                    <div>{row.node}</div>
                </div>
            ))}
        </div>
    )
};
