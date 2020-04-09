import { isEmpty } from './utils'

describe('isEmpty', () => {
  it('returns true if object is empty', () => {
    const myObject = {}
    expect(isEmpty(myObject)).toBeTruthy
  })

  it('returns false if object is not empty', () => {
    const myObject = { hello: 'World!' }
    expect(isEmpty(myObject)).toBeFalsy
  })
})
