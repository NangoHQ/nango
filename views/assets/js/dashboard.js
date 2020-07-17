/**
 * Pizzly's dashboard is low on JS and that's great.
 * But some some features provide best UX using JS:
 * - removing an element (authentication/configuration)
 */

const removeItem = event => {
  event.preventDefault()

  let item = event.target || event.srcElement
  let integration, type, id

  while (item && item.parentNode) {
    if (item.getAttribute('data-item-id')) {
      integration = item.getAttribute('data-item-integration')
      type = item.getAttribute('data-item-type')
      id = item.getAttribute('data-item-id')
      break
    }

    item = item.parentNode
  }

  if (!item || !integration || !id || !type) {
    return
  }

  const confirmation = confirm('Are you sure you want to delete this ' + type + '?')

  if (!confirmation) {
    return
  }

  item.className = 'animation-removal'
  window.setTimeout(function() {
    item.parentNode.removeChild(item)
  }, 800)

  fetch(`/dashboard/${integration}/${type + 's'}/${id}`, {
    method: 'DELETE'
  }).catch(console.error)
}
