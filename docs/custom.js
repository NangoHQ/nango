/* global document, window, location, requestAnimationFrame */
/* ── Changelog TOC scroll-active fallback ──────────────────────────────── */
/*
 * Mintlify's IntersectionObserver only fires while a section anchor is in
 * the top ~15% of the viewport. Changelog <Update> blocks are many screens
 * tall, so the anchor leaves that strip almost immediately and Mintlify
 * clears the active highlight entirely.
 *
 * This script maintains a data-scroll-active="true" attribute on the
 * matching .toc-item element. It resolves anchor targets directly from TOC
 * link hrefs (which point to <div id="..."> Update containers, not headings).
 * CSS shows the fallback only when Mintlify has no native data-active="true"
 * item, so the two never conflict.
 */
(function () {
  var rafPending = false;
  var currentPath = location.pathname;

  function getTocItems() {
    return Array.from(document.querySelectorAll('#table-of-contents .toc-item'));
  }

  function clearScrollActive() {
    getTocItems().forEach(function (item) {
      item.removeAttribute('data-scroll-active');
    });
  }

  function updateActive() {
    rafPending = false;

    var tocItems = getTocItems();
    if (!tocItems.length) return;

    // Build ordered list of {item, target} pairs from TOC link hrefs
    var anchors = [];
    tocItems.forEach(function (item) {
      var link = item.querySelector('a');
      if (!link) return;
      var href = link.getAttribute('href');
      if (!href || href.charAt(0) !== '#') return;
      var target = document.getElementById(href.slice(1));
      if (target) anchors.push({ item: item, target: target });
    });
    if (!anchors.length) return;

    // The active section is the last anchor whose top edge is at or above
    // 30% of the viewport height (i.e. it has scrolled into view past that point)
    var threshold = window.innerHeight * 0.3;
    var active = anchors[0];
    for (var i = 0; i < anchors.length; i++) {
      if (anchors[i].target.getBoundingClientRect().top <= threshold) {
        active = anchors[i];
      }
    }

    tocItems.forEach(function (item) {
      if (item === active.item) {
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

  function setup() {
    window.addEventListener('scroll', onScroll, { passive: true });
    updateActive();
  }

  function teardown() {
    window.removeEventListener('scroll', onScroll);
    clearScrollActive();
  }

  // Re-run on Next.js SPA navigation (URL changes without full page reload)
  function watchNavigation() {
    setInterval(function () {
      if (location.pathname !== currentPath) {
        currentPath = location.pathname;
        teardown();
        // Small delay to let Next.js finish swapping the DOM
        setTimeout(setup, 200);
      }
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setup();
      watchNavigation();
    });
  } else {
    setup();
    watchNavigation();
  }
})();
