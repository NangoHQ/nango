import { expandTemplate } from './template'

describe('expandTemplate', () => {
  it('expands variables in an object', () => {
    const result = expandTemplate({ a: 'hello ${x.who}', b: { c: '${y}' } }, { x: { who: 'world' }, y: 1 })

    expect(result).toEqual({ a: 'hello world', b: { c: '1' } })
  })

  it('expands variables in a string', () => {
    const result = expandTemplate('hello ${x.who}', { x: { who: 'world' } })

    expect(result).toEqual('hello world')
  })

  it('expands variables in an array', () => {
    const result = expandTemplate(['hello ${x.who}', 'hey!'], { x: { who: 'world' } })

    expect(result).toEqual(['hello world', 'hey!'])
  })

  it('returns numbers as-is', () => {
    const result = expandTemplate(42, {})

    expect(result).toEqual(42)
  })

  it('does NOT expand escaped variables', () => {
    const result = expandTemplate('hello \\${x.who}', { x: { who: 'world' } })

    expect(result).toEqual('hello ${x.who}')
  })

  it('allows the escape character to be used when escaped', () => {
    const result = expandTemplate('hello\\\\there', {})

    expect(result).toEqual('hello\\there')
  })

  describe('when NO value was supplied for a variable', () => {
    it('raises an UndefinedVariable error with the correct path for objects', () => {
      expect(() => expandTemplate({ a: { b: '${x.who}' } }, {})).toThrowErrorMatchingSnapshot()
    })

    it('raises an UndefinedVariable error with the correct path for arrays', () => {
      expect(() => expandTemplate({ a: ['hey', '${x.who}'] }, {})).toThrowErrorMatchingSnapshot()
    })
  })
})
