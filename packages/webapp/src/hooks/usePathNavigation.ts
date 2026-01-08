import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Hook to synchronize component state with URL path.
 *
 * @param basePath - The base path to use for navigation (e.g., '/dev/integrations/my-integration')
 * @param defaultValue - The default value to use if no path segment is present
 * @param onValueChange - Optional callback when the value changes
 * @returns A tuple of [value, setValue] for controlled component usage
 *
 * @example
 * ```tsx
 * const [value, setValue] = usePathNavigation('/dev/integrations/my-integration', 'overview');
 *
 * <Tabs value={value} onValueChange={setValue}>
 *   ...
 * </Tabs>
 * ```
 */
export function usePathNavigation(basePath: string, defaultValue: string = '', onValueChange?: (value: string) => void): [string, (value: string) => void] {
    const location = useLocation();
    const navigate = useNavigate();
    const [value, setValue] = useState<string>(defaultValue);

    // Sync state from URL path on mount and when path changes
    useEffect(() => {
        const pathSegments = location.pathname.split('/').filter(Boolean);
        const lastSegment = pathSegments[pathSegments.length - 1];
        const basePathSegments = basePath.split('/').filter(Boolean);
        const lastBasePathSegment = basePathSegments[basePathSegments.length - 1];

        if (lastSegment && lastSegment !== lastBasePathSegment) {
            setValue(lastSegment);
        } else if (defaultValue) {
            setValue(defaultValue);
        }
    }, [location.pathname, basePath, defaultValue]);

    // Handler that updates both state and URL
    const handleValueChange = (newValue: string) => {
        setValue(newValue);
        navigate(`${basePath}/${newValue}`, { replace: true });
        onValueChange?.(newValue);
    };

    return [value, handleValueChange];
}
