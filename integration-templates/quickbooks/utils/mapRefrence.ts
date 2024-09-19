/**
 * Maps an optional reference object to a new object with default values.
 * If the input reference is undefined, returns undefined.
 *
 * @param ref - The reference object to map.
 * @returns A new object with 'value' and 'name' properties, or undefined.
 */
export function mapReference(ref?: { value: string; name?: string }): { value: string; name: string } | undefined {
    return ref ? { value: ref.value, name: ref.name ?? '' } : undefined;
}
