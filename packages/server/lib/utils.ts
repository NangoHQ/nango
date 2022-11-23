// A helper function to interpolate a string.
// Example:
// interpolateString('Hello ${name} of ${age} years", {name: 'Tester', age: 234})
// Copied from https://stackoverflow.com/a/1408373/250880
export function interpolateString(str: string, replacers: Record<string, any>) {
    return str.replace(/\${([^{}]*)}/g, (a, b) => {
        var r = replacers[b];
        return typeof r === 'string' || typeof r === 'number' ? (r as string) : a; // Typecast needed to make TypeScript happy
    });
}

// A version of JSON.parse that detects Date strings and transforms them back into
// Date objects. This depends on how dates were serialized obviously.
// Source: https://stackoverflow.com/questions/3143070/javascript-regex-iso-datetime
export function parseJsonDateAware(input: string) {
    const dateFormat =
        /(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))/;
    // @ts-ignore
    return JSON.parse(input, (key, value) => {
        if (typeof value === 'string' && dateFormat.test(value)) {
            return new Date(value);
        }

        return value;
    });
}
