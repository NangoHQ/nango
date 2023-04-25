import { type Icon, Loader } from '@geist-ui/icons';
import { cva, VariantProps } from 'class-variance-authority';
import classNames from 'classnames';

const buttonStyles = cva('disabled:pointer-events-none disabled:opacity-50 rounded-md', {
    variants: {
        variant: {
            primary: 'bg-black text-white',
            secodary: 'bg-white text-black',
            success: 'bg-green-700 text-white',
            danger: 'bg-red-700 text-white'
        },
        size: {
            xs: 'h-8 py-1 px-2',
            sm: 'h-9 px-2 ',
            md: 'h-10 py-2 px-4',
            lg: 'h-11 px-8'
        }
    },
    defaultVariants: {
        variant: 'primary',
        size: 'md'
    }
});

interface ExtraProps {
    isLoading?: true;
    iconProps?: {
        Icon: Icon;
        position: 'start' | 'end';
    };
}

type ButtonProps = JSX.IntrinsicElements['button'] & VariantProps<typeof buttonStyles> & ExtraProps;

const Button: React.FC<ButtonProps> = ({ size, variant, className, isLoading, children, iconProps, ...props }) => {
    if (isLoading) {
        props.disabled = true;
    }
    return (
        <button className={classNames(buttonStyles({ className, variant, size }))} {...props}>
            <div className="relative">
                <div className={classNames({ 'opacity-0': isLoading })}>{children}</div>
                {isLoading && <Loader className="absolute top-0 flex mx-auto inset-x-0 h-full" />}
            </div>
        </button>
    );
};

export default Button;
