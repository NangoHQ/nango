import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Hook to synchronize component state with URL hash.
 *
 * @param defaultValue - The default value to use if no hash is present
 * @param onValueChange - Optional callback when the value changes
 * @returns A tuple of [value, setValue] for controlled component usage
 *
 * @example
 * ```tsx
 * const [value, setValue] = useHashNavigation('default-tab');
 *
 * <Navigation value={value} onValueChange={setValue}>
 *   ...
 * </Navigation>
 * ```
 */
export function useHashNavigation(defaultValue: string = '', onValueChange?: (value: string) => void): [string, (value: string) => void] {
    const location = useLocation();
    const navigate = useNavigate();
    const [value, setValue] = useState<string>(defaultValue);

    // Sync state from URL hash on mount and when hash changes
    useEffect(() => {
        if (location.hash) {
            const hashValue = location.hash.slice(1);
            setValue(hashValue);
        } else if (defaultValue) {
            setValue(defaultValue);
        }
    }, [location.hash, defaultValue]);

    // Handler that updates both state and URL
    const handleValueChange = (newValue: string) => {
        setValue(newValue);
        navigate(`#${newValue}`, { replace: true });
        onValueChange?.(newValue);
    };

    return [value, handleValueChange];
}
