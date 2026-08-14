import { MemoryRouter } from 'react-router-dom';

import { StyledLink } from '@/components/ui/StyledLink';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta<typeof StyledLink> = {
    component: StyledLink,
    title: 'Components/UI/StyledLink',
    parameters: { layout: 'centered' },
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

export const Internal: Story = {
    args: { to: '/integrations', children: 'View integrations' }
};

export const External: Story = {
    args: { to: 'https://docs.nango.dev', children: 'Read the docs', type: 'external', icon: true }
};

const VARIANTS = ['default', 'muted', 'info', 'error'] as const;
const SIZES = ['default', 'sm'] as const;

// Reference catalog of every StyledLink variant/size/icon combination, ahead of NAN-6419's migration to
// the design-system Button. Figma's Button component only defines Link/Link-Destructive (no muted/info
// treatment), so this exists to compare StyledLink's actual shipped look against what Button covers today
// before deciding whether Button needs new variants or these usages should consolidate onto the existing
// link variant.
export const AllVariants: Story = {
    name: 'All variants',
    render: () => (
        <div className="flex flex-col gap-10">
            {VARIANTS.map((variant) => (
                <div key={variant} className="flex items-center gap-6 flex-wrap">
                    <span className="text-ds-xs text-text-secondary w-16 shrink-0">{variant}</span>
                    <StyledLink to="/integrations" variant={variant}>
                        Default
                    </StyledLink>
                    <StyledLink to="https://docs.nango.dev" type="external" variant={variant} icon>
                        With icon
                    </StyledLink>
                    <StyledLink to="/integrations" variant={variant} size="sm">
                        Small
                    </StyledLink>
                    <StyledLink to="https://docs.nango.dev" type="external" variant={variant} size="sm" icon>
                        Small with icon
                    </StyledLink>
                </div>
            ))}
        </div>
    )
};

export const AllSizes: Story = {
    name: 'All sizes',
    render: () => (
        <div className="flex flex-col gap-10">
            {SIZES.map((size) => (
                <div key={size} className="flex items-center gap-6">
                    <span className="text-ds-xs text-text-secondary w-16 shrink-0">{size}</span>
                    <StyledLink to="/integrations" size={size}>
                        Link
                    </StyledLink>
                    <StyledLink to="https://docs.nango.dev" type="external" size={size} icon>
                        With icon
                    </StyledLink>
                </div>
            ))}
        </div>
    )
};
