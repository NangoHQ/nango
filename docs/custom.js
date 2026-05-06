/* global document, window, requestAnimationFrame, history */
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
