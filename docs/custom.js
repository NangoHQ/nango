/* global document, window, location, requestAnimationFrame */
/* ── Changelog TOC scroll-active fallback ──────────────────────────────── */
/*
 * Mintlify's IntersectionObserver only fires while a section heading is in
 * the top ~15% of the viewport. Changelog <Update> blocks are many screens
 * tall, so the heading anchor leaves that strip almost immediately and
 * Mintlify clears the active highlight entirely.
 *
 * This script maintains a data-scroll-active="true" attribute on the
 * matching .toc-item element based on which heading has most recently
 * scrolled past 30% of the viewport. CSS shows it only when Mintlify has
 * no native data-active="true" item, so the two never conflict.
 */
(function () {
  var rafPending = false;
  var currentPath = location.pathname;

  function getHeadings() {
    return Array.from(document.querySelectorAll('#content-area h2, #content-area h3'));
  }

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

    var threshold = window.innerHeight * 0.3;
    var headings = getHeadings();
    if (!headings.length) return;

    // Find the last heading whose top edge is at or above 30% viewport height
    var active = null;
    for (var i = 0; i < headings.length; i++) {
      if (headings[i].getBoundingClientRect().top <= threshold) {
        active = headings[i];
      }
    }
    if (!active) active = headings[0];

    var id = active.id;
    var tocItems = getTocItems();

    tocItems.forEach(function (item) {
      var link = item.querySelector('a');
      if (link && link.getAttribute('href') === '#' + id) {
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
