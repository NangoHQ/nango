import { COPY_BUTTON_SIZES, CopyButton } from './copy-button';

import type { CopyButtonProps } from './copy-button';
import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta<typeof CopyButton> = {
    title: 'Design System/Components/CopyButton',
    component: CopyButton,
    parameters: { layout: 'padded' },
    args: { value: 'nango_sk_live_7f3a9c21', size: 'sm' },
    argTypes: {
        size: { control: 'select', options: COPY_BUTTON_SIZES }
    }
};

export default meta;
type Story = StoryObj<typeof meta>;

const SIZE_SPEC: Record<(typeof COPY_BUTTON_SIZES)[number], string> = {
    xs: '24 · icon 12',
    sm: '28 · icon 14'
};

// One row per size. `extra` freezes a state: data-story-state maps onto the real hover:/focus-visible: variants
// (see .storybook/preview.css), and `copied` holds the success state that would otherwise revert after 1.5s.
// Rows are tall enough to fit an open tooltip above the button.
const Sizes = ({ extra }: { extra: Partial<CopyButtonProps> & Record<`data-${string}`, string> }) => (
    <div className="inline-grid grid-cols-[auto_max-content] items-center gap-x-8 gap-y-12 pt-10">
        {COPY_BUTTON_SIZES.map((size) => (
            <div key={size} className="contents">
                <span className="flex flex-col text-ds-xs text-text-secondary pr-4">
                    <span className="text-text-strong font-ds-medium">{size}</span>
                    <span>{SIZE_SPEC[size]}</span>
                </span>
                <CopyButton value="nango_sk_live_7f3a9c21" size={size} {...extra} />
            </div>
        ))}
    </div>
);

/** Interactive — click to copy the value, hover or tab in to see the tooltip. */
export const Default: Story = {};

export const Hover: Story = {
    render: () => <Sizes extra={{ 'data-story-state': 'hover' }} />
};

export const Focus: Story = {
    render: () => <Sizes extra={{ 'data-story-state': 'focus-visible' }} />
};

/** Held in the copied state: check icon in icon-success, tooltip reading "Copied". */
export const Copied: Story = {
    render: () => <Sizes extra={{ copied: true }} />
};
