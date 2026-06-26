import { MemoryRouter } from 'react-router-dom';

import { ButtonLink } from '@/components/ui/ButtonLink';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof ButtonLink> = {
    component: ButtonLink,
    title: 'Components/UI/ButtonLink',
    parameters: { layout: 'padded' },
    decorators: [
        (Story) => (
            <MemoryRouter>
                <Story />
            </MemoryRouter>
        )
    ]
};
export default meta;
type Story = StoryObj<typeof meta>;

const VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger', 'link-danger'] as const;
const SIZES = ['2xs', 'xs', 'sm', 'md', 'lg'] as const;

export const AllVariants: Story = {
    name: 'All variants',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-10)' }}>
            {VARIANTS.map((variant) => (
                <div key={variant} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-6)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--ds-typography-font-size-xs)', color: 'var(--text-secondary)', width: '7rem', flexShrink: 0 }}>
                        {variant}
                    </span>
                    <ButtonLink to="/integrations" variant={variant}>
                        Link
                    </ButtonLink>
                    <ButtonLink to="/integrations" variant={variant} disabled>
                        Disabled
                    </ButtonLink>
                </div>
            ))}
        </div>
    )
};

export const AllSizes: Story = {
    name: 'All sizes',
    render: () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-10)' }}>
            {SIZES.map((size) => (
                <div key={size} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-6)' }}>
                    <span style={{ fontSize: 'var(--ds-typography-font-size-xs)', color: 'var(--text-secondary)', width: '3rem', flexShrink: 0 }}>{size}</span>
                    <ButtonLink to="/integrations" size={size}>
                        Link
                    </ButtonLink>
                </div>
            ))}
        </div>
    )
};
