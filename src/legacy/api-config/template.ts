import at from 'lodash.at'

import { CustomError } from '../errors'

// Matches escaped characters eg. "\$" or variables with optional surrounding whitespace eg. "${  name  }"
const parserRegex = /\\.|\$\{\s*([^}\s]*)\s*\}/g

const expandString = (template: string, templatePath: string, variables: any) =>
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

const expandArray = (template: any, templatePath: string, variables: any) =>
  template.map((element, i: number) => expand(element, `${templatePath}[${i}]`, variables))

const expandObject = (template: any, templatePath: string, variables: any) => {
  const result = {}

  for (const [attributeName, childTemplate] of Object.entries(template)) {
    const childPath = templatePath ? `${templatePath}.${attributeName}` : attributeName

    result[attributeName] = expand(childTemplate, childPath, variables)
  }

  return result
}

const expand = (template: any, templatePath: string, variables: any) => {
  if (Array.isArray(template)) {
    return expandArray(template, templatePath, variables)
  }

  if (typeof template === 'string') {
    return expandString(template, templatePath, variables)
  }

  if (typeof template === 'number') {
    return template
  }

  return expandObject(template, templatePath, variables)
}

/**
 * Performs variable interpolation on strings. The strings may be contained within
 * nested objects or arrays. Numbers are returned unchanged.
 *
 * Examples variables `{ name: 'Bearer', address: { city: 'Paris' } }`:
 *
 * Example cases:
 *
 *   `{ greeting: 'Hi ${name}', count: 5 }` => `{ greeting: 'Hi Bearer', count: 5 }`
 *
 *   `['City is ${address.city}', { busy: true }]` => `['City is Paris', { busy: true }]`
 *
 *   `'Hey there "${name}"'` => `'Hey there "Bearer"'`
 *
 *   `'Not a variable: \\${name}'` => `'Not a variable: ${name}'`
 *
 *   `{ a: 'Oops ${some.age}' }` => throws `UndefinedVariable(templatePath: 'a', variableName: 'some.age')`
 */
export const expandTemplate = (template: any, variables: any) => expand(template, '', variables)

export class UndefinedVariable extends CustomError {
  constructor(public templatePath: string, public variableName: string) {
    super(`Undefined variable ${variableName} used in template at ${templatePath}`)
  }
}
