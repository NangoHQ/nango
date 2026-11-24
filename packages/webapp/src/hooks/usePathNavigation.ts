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
    const value = getValueFromPath(location.pathname, basePath, defaultValue);

    const handleValueChange = (newValue: string) => {
        navigate(`${basePath}/${newValue}`, { replace: true });
        onValueChange?.(newValue);
    };

    return [value, handleValueChange];
}

function getValueFromPath(pathname: string, basePath: string, defaultValue: string): string {
    const lastSegment = safeDecode(pathname.split('/').filter(Boolean).at(-1));
    const lastBasePathSegment = basePath.split('/').filter(Boolean).at(-1);
    if (lastSegment && lastSegment !== lastBasePathSegment) {
        return lastSegment;
    }
    return defaultValue;
}

function safeDecode(segment: string | undefined): string | undefined {
    if (!segment) {
        return segment;
    }
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}
