import { CircleAlert, CircleCheck, ExternalLink, Info, TriangleAlert } from 'lucide-react';

import { Alert, AlertActions, AlertButton, AlertDescription, AlertTitle } from './alert';

import type { AlertProps } from './alert';
import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
    title: 'Design System/Components/Alert',
    parameters: { layout: 'padded' }
};

export default meta;
type Story = StoryObj<typeof meta>;

// Storybook-only dismiss handler; the close affordance renders whenever `onDismiss` is passed.
const onDismiss = () => undefined;

const VARIANTS = ['info', 'success', 'warning', 'danger', 'neutral'] as const;
const ONE_VARIANT = ['info'] as const;

const ICONS: Record<(typeof VARIANTS)[number], React.ReactNode> = {
    info: <Info />,
    success: <CircleCheck />,
    warning: <TriangleAlert />,
    danger: <CircleAlert />,
    neutral: <Info />
};

const action = (
    <AlertActions>
        <AlertButton>
            Button
            <ExternalLink />
        </AlertButton>
    </AlertActions>
);

interface Shape {
    label: string;
    title?: boolean;
    withAction?: boolean;
    /** Defaults to true; set false for the not-dismissible shape. */
    dismissible?: boolean;
    /** Defaults to true. */
    icon?: boolean;
    /** Only the first group of each story runs every status — the rest vary shape, not colour. */
    allVariants?: boolean;
}

// Titled shapes first, then the description-only ones together, ending with the barest.
const SHAPES: Shape[] = [
    { label: 'With title', title: true, allVariants: true },
    { label: 'With title and action', title: true, withAction: true },
    { label: 'With title and action, not dismissible', title: true, withAction: true, dismissible: false },
    { label: 'Description only' },
    { label: 'Description only, with action', withAction: true },
    { label: 'Description only, no icon or dismiss', icon: false, dismissible: false }
];

// Figma models a toast with and without a title, but never with an action. The webapp's deploy toast
// passes one, so that third shape ships too.
const TOAST_SHAPES: Shape[] = [
    { label: 'Description only', allVariants: true },
    { label: 'With title', title: true },
    { label: 'With title and action', title: true, withAction: true }
];

const ShapeGroups = ({ shapes, size, description, className }: { shapes: Shape[]; size: AlertProps['size']; description: string; className?: string }) => (
    // pb-6 keeps the last alert off the bottom edge once the story scrolls
    <div className={`flex flex-col gap-8 pb-6 ${className ?? ''}`}>
        {shapes.map((shape) => (
            <div key={shape.label} className="flex flex-col gap-2">
                <span className="text-ds-xs text-text-secondary">{shape.label}</span>
                {(shape.allVariants ? VARIANTS : ONE_VARIANT).map((variant) => (
                    <Alert key={variant} variant={variant} size={size} onDismiss={shape.dismissible === false ? undefined : onDismiss}>
                        {shape.icon === false ? null : ICONS[variant]}
                        {shape.title && <AlertTitle>Alert title</AlertTitle>}
                        <AlertDescription>{description}</AlertDescription>
                        {shape.withAction && action}
                    </Alert>
                ))}
            </div>
        ))}
    </div>
);

const DESCRIPTION = 'This is an alert banner description. This is an alert banner description.';

export const Wide: Story = {
    render: () => <ShapeGroups shapes={SHAPES} size="wide" description={DESCRIPTION} />
};

export const Compact: Story = {
    // 320px matches the compact size's width in Figma, so text wraps the way it does there
    render: () => <ShapeGroups shapes={SHAPES} size="compact" description={DESCRIPTION} className="w-[320px]" />
};

export const Toast: Story = {
    render: () => <ShapeGroups shapes={TOAST_SHAPES} size="toast" description="This is an alert toast description." className="w-[350px]" />
};
