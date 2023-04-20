import { forwardRef, useCallback, useState } from 'react';
import classNames from 'classnames';

const SecretInput = forwardRef<HTMLInputElement, JSX.IntrinsicElements['input']>(function PasswordField({ className, ...props }, ref) {
    const [isSecretVisible, setIsSecretVisible] = useState(false);

    const toggleSecretVisibility = useCallback(() => setIsSecretVisible(!isSecretVisible), [isSecretVisible, setIsSecretVisible]);

    return (
        <div className="relative">
            <input
                type={isSecretVisible ? 'text' : 'password'}
                ref={ref}
                className={classNames(
                    'border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none',
                    className
                )}
                {...props}
            />
            <label
                className="absolute right-4 top-2 bg-gray-300 hover:bg-gray-400 rounded px-2 py-1 text-sm text-gray-600 cursor-pointer"
                onClick={toggleSecretVisibility}
            >
                {isSecretVisible ? 'hide' : 'show'}
            </label>
        </div>
    );
});

export default SecretInput;
