// Ensures a function is only called once.
export function once<T extends any[], R>(fn: (...args: T) => R): (...args: T) => ReturnType<typeof fn> {
    let called = false;
    let result: R;

    return function (...args: T) {
        if (!called) {
            called = true;
            result = fn(...args);
        }
        return result;
    };
}
