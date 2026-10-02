import type { AnalyticsEventName, AnalyticsSurface, LegacyAnalyticsEventName } from './taxonomy.js';

type Primitive = string | number | boolean;

type IsNever<T> = [T] extends [never] ? true : false;

type IsNonEmptyLiteral<T> = T extends string ? (string extends T ? false : T extends '' ? false : true) : false;

type IsSnakeCase<K extends string> = K extends Lowercase<K> ? (K extends `${string}-${string}` | `${string} ${string}` ? false : true) : false;

type PropertyProblem<K extends string, V> =
    IsSnakeCase<K> extends false
        ? `property "${K}" is not snake_case`
        : K extends 'surface' | 'is_production'
          ? `property "${K}" is added by the sender`
          : [NonNullable<V>] extends [boolean]
            ? K extends `${'' | 'previous_'}${'is' | 'has'}_${string}`
                ? never
                : `boolean property "${K}" needs an is_ or has_ prefix`
            : [NonNullable<V>] extends [Primitive]
              ? never
              : `property "${K}" is not a string, number or boolean`;

// Distributes over the variants of a discriminated union, so every variant's keys are checked.
type PropertiesProblems<P> = P extends unknown
    ? string extends keyof P
        ? never
        : { [K in keyof P & string]-?: PropertyProblem<K, P[K]> }[keyof P & string]
    : never;

type HasSuccess<P> = P extends unknown ? ('is_success' extends keyof P ? true : false) : never;

type EventProblems<N extends string, E> =
    | (N extends AnalyticsEventName | LegacyAnalyticsEventName
          ? N extends Lowercase<N>
              ? never
              : `${N}: name is not lowercase`
          : `${N}: name is not category:object_action from the allowed values`)
    | (E extends { surface: infer S } ? ([S] extends [AnalyticsSurface] ? never : `${N}: unknown surface`) : `${N}: missing surface`)
    | (E extends { insight: infer I } ? (IsNonEmptyLiteral<I> extends true ? never : `${N}: insight must be a sentence`) : `${N}: missing insight`)
    | (E extends { fires: infer F } ? (IsNonEmptyLiteral<F> extends true ? never : `${N}: fires must be a sentence`) : `${N}: missing fires`)
    | (E extends { properties: infer P } ? (N extends LegacyAnalyticsEventName ? never : `${N}: ${PropertiesProblems<P>}`) : `${N}: missing properties`)
    | (N extends `${string}_complete`
          ? E extends { properties: infer P }
              ? false extends HasSuccess<P>
                  ? `${N}: complete events carry is_success`
                  : never
              : never
          : never)
    | (E extends { structured_properties: object }
          ? E extends { structured_reason: infer R }
              ? IsNonEmptyLiteral<R> extends true
                  ? never
                  : `${N}: structured_reason must say why`
              : `${N}: structured_properties need a structured_reason`
          : never);

export type AnalyticsCatalogueProblems<C> = { [N in keyof C & string]: EventProblems<N, C[N]> }[keyof C & string];

export type AssertNoProblems<Problems extends never> = IsNever<Problems>;
