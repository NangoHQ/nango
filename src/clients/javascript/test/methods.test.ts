import Pizzly from '../src/index'

describe('methods', () => {
  const pizzly = new Pizzly({ host: 'test.example.org' })

  it('has a "connect" method', () => {
    expect(pizzly.connect).toBeInstanceOf(Function)
  })

  it('has an "integration" method', () => {
    expect(pizzly.integration).toBeInstanceOf(Function)
  })
})
