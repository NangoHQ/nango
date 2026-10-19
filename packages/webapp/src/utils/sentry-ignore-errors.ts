// Plain strings match anywhere in the message, so anchor anything short enough to appear inside a real error.
export const sentryIgnoreErrors: (string | RegExp)[] = [
    /^AbortError(: |$)/,
    /^(TypeError: )?Failed to fetch( \(.+\))?$/,
    /^(TypeError: )?Load failed( \(.+\))?$/,
    'NetworkError when attempting to fetch resource',
    "Failed to execute 'writeText' on 'Clipboard'",
    'Object Not Found Matching Id'
];
