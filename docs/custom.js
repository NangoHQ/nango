/* global document, window, requestAnimationFrame, history, localStorage, MutationObserver */
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

/* Theme sync between nango.dev (website) and nango.dev/docs (Mintlify).
 *
 * The two sites use different localStorage keys:
 *   website  → localStorage.theme      ("dark" | "light" | "system")
 *   Mintlify → localStorage.isDarkMode ("dark" | "light"; absent = OS preference)
 *
 * The website writes isDarkMode whenever the user explicitly picks dark/light,
 * so Mintlify's own head script reads the correct value on page load (no flash).
 * This script handles two remaining cases:
 *   A) Cross-tab sync: user toggles theme on the website tab, docs tab updates.
 *   B) Docs → website: user toggles in docs, write back to theme so the website
 *      picks it up on the next visit.
 */
(function () {
  'use strict';

  var syncing = false;

  // Case A: website changed theme in another tab/window
  window.addEventListener('storage', function (e) {
    if (e.key !== 'theme') return;
    var t = e.newValue;
    var isDark;
    syncing = true;
    if (t === 'dark' || t === 'light') {
      isDark = t === 'dark';
      document.documentElement.classList.toggle('dark', isDark);
      localStorage.setItem('isDarkMode', t);
    } else {
      // 'system' or cleared — follow OS and let Mintlify use its own detection
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', isDark);
      localStorage.removeItem('isDarkMode');
    }
    setTimeout(function () { syncing = false; }, 50);
  });

  // Case B: Mintlify toggled the dark class → write back to website's theme key
  var observer = new MutationObserver(function () {
    if (syncing) return;
    var isDark = document.documentElement.classList.contains('dark');
    var resolved = isDark ? 'dark' : 'light';
    if (localStorage.getItem('theme') !== resolved) {
      localStorage.setItem('theme', resolved);
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
})();
