/**
 * Performs variable interpolation on strings. The strings may be contained within
 * nested objects or arrays. Numbers are returned unchanged.
 *
 * Examples variables `{ name: 'Bearer', address: { city: 'Paris' } }`:
 * Example cases:
 *   - `{ greeting: 'Hi ${name}', count: 5 }` => `{ greeting: 'Hi Bearer', count: 5 }`
 *   - `['City is ${address.city}', { busy: true }]` => `['City is Paris', { busy: true }]`
 *   - `'Hey there "${name}"'` => `'Hey there "Bearer"'`
 *   - `'Not a variable: \\${name}'` => `'Not a variable: ${name}'`
 *   - `{ a: 'Oops ${some.age}' }` => throws `UndefinedVariable(templatePath: 'a', variableName: 'some.age')`
 */

import at from 'lodash.at'
const parserRegex = /\\.|\$\{\s*([^}\s]*)\s*\}/g

export const interpolate = (template: any, templatePath: string = '', variables: any) => {
  if (Array.isArray(template)) {
    return interpolateArray(template, templatePath, variables)
  }

  if (typeof template === 'string') {
    return interpolateString(template, templatePath, variables)
  }

  if (typeof template === 'number') {
    return template
  }

  return interpolateObject(template, templatePath, variables)
}

/**
 * Interpolate strings
 */

const interpolateString = (template: string, templatePath: string, variables: any) =>
  template.replace(parserRegex, (match: string, variableName: string) => {
    if (match[0] === '\\') {
      return match[1]
    }

    const value = at<string | undefined>(variables, variableName)[0]

    if (value === undefined) {
      throw new UndefinedVariable(templatePath, variableName)
    }

    return value
  })

/**
 * Interpolate arrays
 */

const interpolateArray = (template: any, templatePath: string, variables: any) =>
  template.map((element, i: number) => interpolate(element, `${templatePath}[${i}]`, variables))

/**
 * Recursively interpolate objects
 */

const interpolateObject = (template: any, templatePath: string, variables: any) => {
  const result = {}

  for (const [attributeName, childTemplate] of Object.entries(template)) {
    const childPath = templatePath ? `${templatePath}.${attributeName}` : attributeName

    result[attributeName] = interpolate(childTemplate, childPath, variables)
  }

  return result
}

/**
 * Error handler
 */

export class UndefinedVariable extends Error {
  constructor(public templatePath: string, public variableName: string) {
    super(`Undefined variable ${variableName} used in template at ${templatePath}`)
  }
}
