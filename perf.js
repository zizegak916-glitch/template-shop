/**
 * perf.js - Performance Optimization Module for Template Shop
 * Handles pagination, lazy loading, virtual scroll, animations, and search
 */

(function () {
  'use strict';

  // ==================== CONFIGURATION ====================
  const CONFIG = {
    ITEMS_PER_PAGE: 12,
    ANIMATION_STAGGER_DELAY: 50,
    SEARCH_DEBOUNCE_MS: 300,
    SCROLL_THROTTLE_MS: 16,
    IFRAME_MAX_CONCURRENT: 3,
    LAZY_LOAD_ROOT_MARGIN: '300px',
    UNLOAD_DISTANCE_PX: 1500,
    FADE_DURATION_MS: 400,
  };

  // ==================== STATE ====================
  const state = {
    allTemplates: [],
    filteredTemplates: [],
    displayedCount: 0,
    searchIndex: new Map(),
    iframeQueue: [],
    activeIframeLoads: 0,
    observers: new Map(),
    animationTimers: [],
    currentQuery: '',
    isSearchActive: false,
  };

  // ==================== DOM CACHE ====================
  const dom = {
    container: null,
    cards: [],
    loadMoreBtn: null,
    searchInput: null,
    countDisplay: null,
    init() {
      this.container = document.querySelector('.template-grid') ||
                       document.querySelector('.tpl-grid') ||
                       document.querySelector('[data-template-grid]') ||
                       document.getElementById('template-grid') ||
                       document.getElementById('tpl-grid');
      this.loadMoreBtn = document.querySelector('.load-more-btn') ||
                         document.querySelector('.tpl-load-more') ||
                         document.querySelector('[data-load-more]');
      this.searchInput = document.querySelector('.template-search') ||
                         document.querySelector('#searchInput') ||
                         document.querySelector('[data-search]') ||
                         document.querySelector('input[type="search"]');
      this.countDisplay = document.querySelector('.template-count') ||
                          document.querySelector('#tplCount') ||
                          document.querySelector('[data-count]');
    },
    refreshCards() {
      this.cards = this.container
        ? Array.from(this.container.querySelectorAll('.template-card, .tpl-card'))
        : [];
    }
  };

  // ==================== UTILITY FUNCTIONS ====================

  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function throttle(fn, ms) {
    let lastTime = 0;
    let timer;
    return function (...args) {
      const now = Date.now();
      const remaining = ms - (now - lastTime);
      clearTimeout(timer);
      if (remaining <= 0) {
        lastTime = now;
        fn.apply(this, args);
      } else {
        timer = setTimeout(() => {
          lastTime = Date.now();
          fn.apply(this, args);
        }, remaining);
      }
    };
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ==================== 1. PAGINATION ====================

  function initPagination() {
    state.allTemplates = collectTemplateData();
    state.filteredTemplates = [...state.allTemplates];
    state.displayedCount = state.allTemplates.length;

    // Don't hide cards - let existing filterCards handle visibility
    // Only set up iframe lazy loading
    state.allTemplates.forEach(t => {
      t.element.style.opacity = '1';
      t.element.style.transform = 'none';
    });
  }

  function collectTemplateData() {
    const cards = dom.container
      ? Array.from(dom.container.querySelectorAll('.template-card, .tpl-card'))
      : [];

    return cards.map((card, index) => ({
      element: card,
      name: getTextContent(card, '.template-name, .template-title, h3, h4'),
      description: getTextContent(card, '.template-desc, .template-description, p'),
      tags: getTextContent(card, '.template-tags, .template-category, .badge'),
      index: index,
      id: card.dataset.templateId || card.id || `template-${index}`,
    }));
  }

  function getTextContent(parent, selector) {
    const el = parent.querySelector(selector);
    return el ? el.textContent.trim() : '';
  }

  function hideAllCards() {
    state.allTemplates.forEach(t => {
      const el = t.element;
      el.style.display = 'none';
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.willChange = 'transform, opacity';
    });
  }

  function handleLoadMore() {
    loadNextBatch();
    const newCards = getVisibleCards().slice(-CONFIG.ITEMS_PER_PAGE);
    smoothScrollToCards(newCards);
  }

  function loadNextBatch() {
    const start = state.displayedCount;
    const end = Math.min(
      start + CONFIG.ITEMS_PER_PAGE,
      state.filteredTemplates.length
    );

    if (start >= state.filteredTemplates.length) return;

    const batch = state.filteredTemplates.slice(start, end);

    batch.forEach((template, i) => {
      const delay = i * CONFIG.ANIMATION_STAGGER_DELAY;
      const timer = setTimeout(() => {
        revealCard(template.element);
      }, delay);
      state.animationTimers.push(timer);
    });

    state.displayedCount = end;
    updateCountDisplay();
    updateLoadMoreButton();
  }

  function revealCard(card) {
    card.style.display = '';
    card.style.willChange = 'transform, opacity';

    requestAnimationFrame(() => {
      card.style.transition = `opacity ${CONFIG.FADE_DURATION_MS}ms ease-out, transform ${CONFIG.FADE_DURATION_MS}ms ease-out`;
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';

      const cleanup = setTimeout(() => {
        card.style.willChange = 'auto';
      }, CONFIG.FADE_DURATION_MS + 50);

      state.animationTimers.push(cleanup);
    });

    setupLazyIframe(card);
    setupVirtualScrollObserver(card);
  }

  function getVisibleCards() {
    return state.filteredTemplates
      .slice(0, state.displayedCount)
      .map(t => t.element);
  }

  function smoothScrollToCards(cards) {
    if (!cards.length) return;
    const firstNew = cards[0];
    requestAnimationFrame(() => {
      firstNew.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  function updateCountDisplay() {
    if (dom.countDisplay) {
      dom.countDisplay.textContent = `显示 ${state.displayedCount}/${state.filteredTemplates.length} 个模板`;
    }

    if (dom.loadMoreBtn) {
      const remaining = state.filteredTemplates.length - state.displayedCount;
      const nextBatch = Math.min(remaining, CONFIG.ITEMS_PER_PAGE);
      const label = dom.loadMoreBtn.querySelector('.btn-label');
      if (label) {
        label.textContent = remaining > 0
          ? `加载更多 (${remaining}个剩余)`
          : '已加载全部';
      }
    }
  }

  function updateLoadMoreButton() {
    if (!dom.loadMoreBtn) return;

    const hasMore = state.displayedCount < state.filteredTemplates.length;
    dom.loadMoreBtn.style.display = hasMore ? '' : 'none';
    dom.loadMoreBtn.disabled = !hasMore;
    dom.loadMoreBtn.setAttribute('aria-expanded', String(hasMore));
  }

  // ==================== 2. VIRTUAL SCROLL & LAZY IFRAME LOADING ====================

  const lazyObserver = new IntersectionObserver(handleLazyIntersection, {
    rootMargin: CONFIG.LAZY_LOAD_ROOT_MARGIN,
    threshold: 0,
  });

  const unloadObserver = new IntersectionObserver(handleUnloadIntersection, {
    rootMargin: `${CONFIG.UNLOAD_DISTANCE_PX}px`,
    threshold: 0,
  });

  function setupLazyIframe(card) {
    const iframe = card.querySelector('iframe');
    if (!iframe) return;

    const src = iframe.getAttribute('src') ||
                iframe.dataset.src ||
                iframe.getAttribute('data-preview');

    if (src) {
      iframe.dataset.originalSrc = src;
      iframe.removeAttribute('src');
      iframe.setAttribute('loading', 'lazy');
      lazyObserver.observe(card);
    }
  }

  function setupVirtualScrollObserver(card) {
    unloadObserver.observe(card);
  }

  function handleLazyIntersection(entries) {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      const card = entry.target;
      const iframe = card.querySelector('iframe');
      if (!iframe) return;

      const originalSrc = iframe.dataset.originalSrc;
      if (!originalSrc) return;

      if (!iframe.dataset.loaded) {
        enqueueIframeLoad(iframe, originalSrc);
      }

      lazyObserver.unobserve(card);
    });
  }

  function handleUnloadIntersection(entries) {
    entries.forEach(entry => {
      const card = entry.target;
      const iframe = card.querySelector('iframe');
      if (!iframe || !iframe.dataset.loaded) return;

      if (!entry.isIntersecting) {
        pauseIframe(iframe);
      } else {
        resumeIframe(iframe);
      }
    });
  }

  function enqueueIframeLoad(iframe, src) {
    state.iframeQueue.push({ iframe, src });
    processIframeQueue();
  }

  function processIframeQueue() {
    if (state.activeIframeLoads >= CONFIG.IFRAME_MAX_CONCURRENT) return;
    if (state.iframeQueue.length === 0) return;

    const { iframe, src } = state.iframeQueue.shift();

    if (!document.body.contains(iframe)) {
      processIframeQueue();
      return;
    }

    state.activeIframeLoads++;

    iframe.addEventListener('load', function onLoad() {
      iframe.removeEventListener('load', onLoad);
      iframe.dataset.loaded = 'true';
      state.activeIframeLoads--;
      processIframeQueue();
    }, { once: true });

    iframe.addEventListener('error', function onError() {
      iframe.removeEventListener('error', onError);
      state.activeIframeLoads--;
      processIframeQueue();
    }, { once: true });

    iframe.src = src;
  }

  function pauseIframe(iframe) {
    if (iframe.dataset.paused === 'true') return;
    iframe.dataset.paused = 'true';
    iframe.dataset.currentSrc = iframe.src;
    iframe.srcdoc = '<html><body style="margin:0;display:flex;align-items:center;justify-content:center;background:#f5f5f5;color:#999;font-family:sans-serif;font-size:14px;">预览已暂停</body></html>';
  }

  function resumeIframe(iframe) {
    if (iframe.dataset.paused !== 'true') return;
    iframe.dataset.paused = 'false';
    const src = iframe.dataset.currentSrc || iframe.dataset.originalSrc;
    if (src) {
      iframe.removeAttribute('srcdoc');
      iframe.src = src;
    }
  }

  // ==================== 3. SEARCH OPTIMIZATION ====================

  function buildSearchIndex() {
    state.searchIndex.clear();

    state.allTemplates.forEach(template => {
      const text = [
        template.name,
        template.description,
        template.tags,
      ].filter(Boolean).join(' ').toLowerCase();

      const words = text.split(/\s+/).filter(Boolean);

      words.forEach(word => {
        if (!state.searchIndex.has(word)) {
          state.searchIndex.set(word, new Set());
        }
        state.searchIndex.get(word).add(template.index);
      });

      // Also index substrings for partial matching
      const uniqueChars = new Set();
      words.forEach(word => {
        for (let i = 0; i < word.length; i++) {
          for (let j = i + 2; j <= word.length; j++) {
            const sub = word.substring(i, j);
            if (!state.searchIndex.has(sub)) {
              state.searchIndex.set(sub, new Set());
            }
            state.searchIndex.get(sub).add(template.index);
          }
        }
      });
    });
  }

  function searchTemplates(query) {
    if (!query || !query.trim()) {
      resetSearch();
      return;
    }

    state.isSearchActive = true;
    state.currentQuery = query.trim().toLowerCase();
    const queryWords = state.currentQuery.split(/\s+/).filter(Boolean);

    const matchSets = queryWords
      .map(word => {
        const exact = state.searchIndex.get(word);
        if (exact) return new Set(exact);

        const partialMatches = new Set();
        state.searchIndex.forEach((indices, key) => {
          if (key.includes(word)) {
            indices.forEach(idx => partialMatches.add(idx));
          }
        });
        return partialMatches;
      })
      .filter(set => set.size > 0);

    if (matchSets.length === 0) {
      state.filteredTemplates = [];
    } else {
      const result = matchSets.reduce((intersection, current) => {
        const next = new Set();
        intersection.forEach(idx => {
          if (current.has(idx)) next.add(idx);
        });
        return next;
      });

      state.filteredTemplates = state.allTemplates.filter(t => result.has(t.index));
    }

    resetDisplay();
    loadNextBatch();
    highlightMatches(state.currentQuery);
  }

  function resetSearch() {
    state.isSearchActive = false;
    state.currentQuery = '';
    state.filteredTemplates = [...state.allTemplates];
    clearHighlights();
    resetDisplay();
    loadNextBatch();
  }

  function resetDisplay() {
    cancelAnimationTimers();

    state.allTemplates.forEach(template => {
      const el = template.element;
      el.style.display = 'none';
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.willChange = 'transform, opacity';
      clearHighlightsOnCard(el);
    });

    state.displayedCount = 0;
    updateCountDisplay();
  }

  function highlightMatches(query) {
    if (!query) return;

    const escaped = escapeRegex(query);
    const regex = new RegExp(`(${escaped})`, 'gi');

    state.filteredTemplates.slice(0, state.displayedCount).forEach(template => {
      highlightElementText(template.element, '.template-name, .template-title, h3, h4', regex);
      highlightElementText(template.element, '.template-desc, .template-description, p', regex);
    });
  }

  function highlightElementText(parent, selector, regex) {
    const elements = parent.querySelectorAll(selector);
    elements.forEach(el => {
      const original = el.textContent;
      if (!regex.test(original)) return;
      regex.lastIndex = 0;

      const highlighted = escapeHTML(original).replace(
        new RegExp(`(${escapeRegex(escapeHTML(state.currentQuery))})`, 'gi'),
        '<mark class="search-highlight">$1</mark>'
      );
      el.innerHTML = highlighted;
    });
  }

  function clearHighlights() {
    state.allTemplates.forEach(t => clearHighlightsOnCard(t.element));
  }

  function clearHighlightsOnCard(card) {
    const marks = card.querySelectorAll('mark.search-highlight');
    marks.forEach(mark => {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });
  }

  // ==================== 4. ANIMATION HELPERS ====================

  function cancelAnimationTimers() {
    state.animationTimers.forEach(timerId => clearTimeout(timerId));
    state.animationTimers.length = 0;
  }

  // ==================== 5. MEMORY MANAGEMENT ====================

  function cleanup() {
    cancelAnimationTimers();

    if (dom.cards.length > 0) {
      dom.cards.forEach(card => {
        lazyObserver.unobserve(card);
        unloadObserver.unobserve(card);
      });
    }

    state.allTemplates.forEach(template => {
      lazyObserver.unobserve(template.element);
      unloadObserver.unobserve(template.element);

      const iframe = template.element.querySelector('iframe');
      if (iframe) {
        iframe.removeAttribute('src');
        iframe.removeAttribute('srcdoc');
        delete iframe.dataset.originalSrc;
        delete iframe.dataset.loaded;
        delete iframe.dataset.paused;
        delete iframe.dataset.currentSrc;
      }
    });

    state.iframeQueue.length = 0;
    state.activeIframeLoads = 0;
    state.searchIndex.clear();
    state.allTemplates.length = 0;
    state.filteredTemplates.length = 0;
    state.observers.clear();
  }

  function setupMutationObserver() {
    if (!dom.container) return;

    const observer = new MutationObserver(
      throttle((mutations) => {
        mutations.forEach(mutation => {
          mutation.removedNodes.forEach(node => {
            if (node.nodeType !== 1) return;

            const cards = node.matches && node.matches('.template-card')
              ? [node]
              : node.querySelectorAll
                ? Array.from(node.querySelectorAll('.template-card'))
                : [];

            cards.forEach(card => {
              lazyObserver.unobserve(card);
              unloadObserver.unobserve(card);

              const iframe = card.querySelector('iframe');
              if (iframe) {
                iframe.removeAttribute('src');
                iframe.removeAttribute('srcdoc');
              }
            });
          });
        });

        // Refresh card references
        dom.refreshCards();
      }, 200)
    );

    observer.observe(dom.container, { childList: true, subtree: true });
    state.observers.set('mutation', observer);
  }

  // ==================== 6. SCROLL HANDLER ====================

  const handleScroll = throttle(() => {
    // Trigger lazy observer recheck on fast scrolling
    dom.refreshCards();
  }, CONFIG.SCROLL_THROTTLE_MS);

  // ==================== INITIALIZATION ====================

  function injectStyles() {
    if (document.getElementById('perf-module-styles')) return;

    const style = document.createElement('style');
    style.id = 'perf-module-styles';
    style.textContent = `
      .template-card {
        will-change: transform, opacity;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }
      .template-card[style*="display: none"] {
        will-change: auto;
      }
      .search-highlight {
        background-color: #fff3cd;
        color: #856404;
        padding: 1px 3px;
        border-radius: 2px;
        font-weight: 600;
      }
      .load-more-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      @media (prefers-reduced-motion: reduce) {
        .template-card {
          transition: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function init() {
    dom.init();

    if (!dom.container) {
      console.warn('[perf.js] Template grid container not found. Ensure .template-grid exists.');
      return;
    }

    injectStyles();

    dom.refreshCards();

    if (dom.cards.length === 0) {
      console.warn('[perf.js] No template cards found.');
      return;
    }

    initPagination();
    buildSearchIndex();
    setupMutationObserver();

    if (dom.searchInput) {
      const debouncedSearch = debounce((e) => {
        searchTemplates(e.target.value);
      }, CONFIG.SEARCH_DEBOUNCE_MS);

// [disabled]       dom.searchInput.addEventListener('input', debouncedSearch);
// [disabled] 
// [disabled]       // Clear search on ESC
// [disabled]       dom.searchInput.addEventListener('keydown', (e) => {
// [disabled]         if (e.key === 'Escape') {
// [disabled]           dom.searchInput.value = '';
// [disabled]           resetSearch();
// [disabled]           dom.searchInput.blur();
        }
      });
    }

    // Scroll handler disabled - no pagination, just iframe lazy loading
    // window.addEventListener('scroll', handleScroll, { passive: true });

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanup, { once: true });

    // Expose API for external use
    window.PerfModule = {
      search: searchTemplates,
      resetSearch,
      loadMore: handleLoadMore,
      cleanup,
      getState: () => ({
        displayed: state.displayedCount,
        total: state.filteredTemplates.length,
        allTotal: state.allTemplates.length,
        activeIframeLoads: state.activeIframeLoads,
        queueLength: state.iframeQueue.length,
      }),
    };

    console.log(
      `[perf.js] Initialized with ${state.allTemplates.length} templates. ` +
      `Showing ${state.displayedCount} per page.`
    );
  }

  // ==================== BOOT ====================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

})();