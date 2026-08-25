/* global document, window, requestAnimationFrame, history, MutationObserver */
/* ── Changelog TOC scroll-active fallback ──────────────────────────────── */
/*
 * Mintlify clears the TOC active highlight as soon as a section anchor
 * scrolls past the top ~15% of the viewport. Changelog <Update> blocks
 * span many screens, so the TOC goes dark.
 *
 * Set data-scroll-active="true" on the TOC item whose target has scrolled
 * past 30% of the viewport. CSS only applies it when Mintlify has no
 * native data-active item, so the two never conflict.
 */
(function () {
  var rafPending = false;

  function updateActive() {
    rafPending = false;
    var items = document.querySelectorAll('#table-of-contents .toc-item');
    if (!items.length) return;

    var threshold = window.innerHeight * 0.3;
    var activeItem = null;
    items.forEach(function (item) {
      var link = item.querySelector('a');
      var href = link && link.getAttribute('href');
      if (!href || href.charAt(0) !== '#') return;
      var target = document.getElementById(href.slice(1));
      if (target && target.getBoundingClientRect().top <= threshold) {
        activeItem = item;
      }
    });

    items.forEach(function (item) {
      if (item === activeItem) {
        item.setAttribute('data-scroll-active', 'true');
      } else {
        item.removeAttribute('data-scroll-active');
      }
    });
  }

  function onScroll() {
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(updateActive);
    }
  }

  // Re-run after Next.js SPA navigation. 200ms gives the DOM time to swap.
  function onNavigate() {
    setTimeout(updateActive, 200);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('popstate', onNavigate);

  var origPush = history.pushState;
  history.pushState = function () {
    origPush.apply(this, arguments);
    onNavigate();
  };
  var origReplace = history.replaceState;
  history.replaceState = function () {
    origReplace.apply(this, arguments);
    onNavigate();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateActive);
  } else {
    updateActive();
  }
})();

/* ── Copy buttons with lightweight toast ──────────────────────────────── */
(function () {
  var toast;
  var toastTimeout;
  var copyCache = {};

  function showToast(message, kind) {
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'agent-copy-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.setAttribute('data-kind', kind || 'success');
    toast.setAttribute('data-visible', 'true');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(function () {
      toast.removeAttribute('data-visible');
    }, 2200);
  }

  function getCopyText(button) {
    var inlineText = button.getAttribute('data-copy-text');
    var url = button.getAttribute('data-copy-url');

    if (inlineText) {
      return Promise.resolve(inlineText);
    }

    if (!url) {
      return Promise.reject(new Error('Missing copy source'));
    }

    if (copyCache[url]) {
      return Promise.resolve(copyCache[url]);
    }

    return fetch(url).then(function (response) {
      if (!response.ok) {
        throw new Error('Copy source unavailable');
      }

      return response.text().then(function (text) {
        copyCache[url] = text;
        return text;
      });
    });
  }

  function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }

    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand('copy');
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    } finally {
      document.body.removeChild(textarea);
    }
  }

  function bindCopyButtons(root) {
    root.querySelectorAll('[data-copy-text], [data-copy-url]').forEach(function (button) {
      if (button.getAttribute('data-copy-bound') === 'true') {
        return;
      }

      button.setAttribute('data-copy-bound', 'true');

      var url = button.getAttribute('data-copy-url');
      if (url && !copyCache[url]) {
        getCopyText(button).catch(function () {});
      }

      button.addEventListener('click', function () {
        button.setAttribute('aria-busy', 'true');

        getCopyText(button)
          .then(writeClipboard)
          .then(function () {
            showToast(button.getAttribute('data-copy-success') || 'Copied');
          })
          .catch(function () {
            showToast(button.getAttribute('data-copy-error') || 'Could not copy', 'error');
          })
          .finally(function () {
            button.removeAttribute('aria-busy');
          });
      });
    });
  }

  function isQuickstartPage() {
    return (
      window.location.pathname.replace(/\/$/, '').endsWith('/getting-started/quickstart') ||
      Boolean(document.querySelector('[data-page-href*="getting-started/quickstart"]'))
    );
  }

  function updateQuickstartCopyPageAction() {
    var isQuickstart = isQuickstartPage();

    if (!isQuickstart) {
      document.querySelectorAll('[data-quickstart-hidden-copy-page="true"]').forEach(function (element) {
        element.style.display = '';
        element.removeAttribute('data-quickstart-hidden-copy-page');
      });
      return;
    }

    document.querySelectorAll('a, button, [role="menuitem"]').forEach(function (element) {
      var label = element.getAttribute('aria-label') || '';
      var text = (element.textContent || '').replace(/\s+/g, ' ').trim();

      if (label === 'Copy page' || text === 'Copy page' || (label === 'More actions' && element.getAttribute('aria-haspopup') === 'menu')) {
        element.style.display = 'none';
        element.setAttribute('data-quickstart-hidden-copy-page', 'true');
      }
    });
  }

  function init() {
    bindCopyButtons(document);
    updateQuickstartCopyPageAction();

    var observer = new MutationObserver(function () {
      bindCopyButtons(document);
      updateQuickstartCopyPageAction();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
