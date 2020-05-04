const Pizzly = require('../dist/index.umd.js')

describe('Connect', () => {
  const publishableKey = 'foo'
  const hostname = 'bar'
  const pizzly = new Pizzly(publishableKey, hostname)

  it('works', () => {
    expect().toBe(null)
  })
  // Tests:
  // it accepts an integration argument
  // it accepts an authId argument
  // it accepts a configId argument
  // it accepts a setupId argument (alias of configId)
  // it opens a popup
  // it opens a popup with this URL
  // it opens a popup with this size
  // it opens a popup with this position
  // it listens to the dom
  // it closes the popup on successEvent
  // it closes the popup failureEvent
  // it returns a promise
  // it returns an object on promise.resolve
  // it returns an error on promise.reject
})
