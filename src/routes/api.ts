import * as express from 'express'
const api = express.Router()

api.post('/:provider/:credentials', handler)
api.get('/:provider/:credentials/:setupid', handler)
api.put('/:provider/:credentials/:setupid', handler)
api.patch('/:provider/:credentials/:setupid', handler)
api.delete('/:provider/:credentials/:setupid', handler)

function handler(req, res) {
  res.json({ error: false, message: "[API] It works!'" })
}

export { api }
