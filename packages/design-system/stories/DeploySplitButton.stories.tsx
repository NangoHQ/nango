import { useState } from 'react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu';
import { SplitButton, SplitButtonAction, SplitButtonMenuTrigger } from '../src/components/ui/split-button';

import type { SplitButtonVariant } from '../src/components/ui/split-button';
import type { Meta, StoryObj } from '@storybook/react-vite';

// SplitButton composed with the app's DropdownMenu: the chevron half is the menu trigger (asChild).
const DeploySplitButton = ({ variant }: { variant: SplitButtonVariant }) => {
    const [pending, setPending] = useState<string | null>(null);
    const [last, setLast] = useState<string | null>(null);

    const run = (action: string) => {
        setPending(action);
        setTimeout(() => {
            setPending(null);
            setLast(action);
        }, 1200);
    };

    return (
        <div className="flex flex-col items-start gap-3">
            <SplitButton variant={variant} disabled={pending !== null}>
                <SplitButtonAction loading={pending !== null} onClick={() => run('Deploy')}>
                    Deploy
                </SplitButtonAction>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SplitButtonMenuTrigger label="More deploy options" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => run('Redeploy without cache')}>Redeploy without cache</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SplitButton>
            <span className="text-ds-xs text-text-secondary">{pending ? `${pending}…` : last ? `Ran: ${last}` : 'Nothing run yet'}</span>
        </div>
    );
};

const meta: Meta<typeof DeploySplitButton> = {
    component: DeploySplitButton,
    title: 'App Components/Patterns/DeploySplitButton',
    parameters: { layout: 'centered' },
    argTypes: {
        variant: { control: 'select', options: ['primary', 'secondary', 'outline'] }
    }
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Deploy: Story = {
    args: { variant: 'primary' }
};
