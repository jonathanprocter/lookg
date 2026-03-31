// Main Application Logic for Psychoeducational Cards Web App
// Handles filtering, navigation, card display, and interactivity

/* global cardsData */

(function() {
  'use strict';

  // State management
  let currentTheme = 'all';
  let currentSearchQuery = '';
  let currentCards = [];
  let selectedCard = null;
  let lastFocusedElement = null;
  let modalKeydownHandler = null;
  let savedOnly = false;
  let shortReadsOnly = false;
  let sortMode = 'relevance';
  const cardMetaCache = new Map();

  const STORAGE_KEYS = {
    theme: 'unstuck_theme',
    query: 'unstuck_query',
    lastCard: 'unstuck_last_card',
    saved: 'unstuck_saved_cards',
    views: 'unstuck_view_counts',
    sort: 'unstuck_sort',
    savedOnly: 'unstuck_saved_only',
    shortReadsOnly: 'unstuck_short_reads_only',
    fontScale: 'unstuck_font_scale',
    readingMode: 'unstuck_reading_mode'
  };

  // Initialize the application
  function init() {
    loadPreferences();
    renderThemeFilters();
    applyFilters();
    setupEventListeners();
    updateSearchClearButton();
    renderActiveFilters();
    renderSearchSuggestions();
    updateContinueCardButton();
    updateTextSizeButtons();
    updateReadingModeState();
    updateQuickFilterButtons();
    updateSortSelect();
  }

  function loadPreferences() {
    const storedTheme = localStorage.getItem(STORAGE_KEYS.theme);
    const storedQuery = localStorage.getItem(STORAGE_KEYS.query);
    const storedSort = localStorage.getItem(STORAGE_KEYS.sort);
    const storedSavedOnly = localStorage.getItem(STORAGE_KEYS.savedOnly);
    const storedShortReads = localStorage.getItem(STORAGE_KEYS.shortReadsOnly);
    const storedFontScale = localStorage.getItem(STORAGE_KEYS.fontScale);
    const storedReadingMode = localStorage.getItem(STORAGE_KEYS.readingMode);

    if (storedTheme) currentTheme = storedTheme;
    if (storedQuery) currentSearchQuery = storedQuery;
    if (storedSort) sortMode = storedSort;
    if (storedSavedOnly) savedOnly = storedSavedOnly === 'true';
    if (storedShortReads) shortReadsOnly = storedShortReads === 'true';
    if (storedFontScale) {
      document.documentElement.style.setProperty('--font-scale', storedFontScale);
    }
    if (storedReadingMode === 'true') {
      document.body.classList.add('reading-mode');
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput && currentSearchQuery) {
      searchInput.value = currentSearchQuery;
    }
  }

  // Render theme filter buttons
  function renderThemeFilters() {
    const filterContainer = document.getElementById('theme-filters');
    if (!filterContainer) return;

    // Add "All" button
    const allButton = createFilterButton('all', 'All Cards', cardsData.length);
    filterContainer.appendChild(allButton);

    // Count cards per theme
    const themeCounts = {};
    cardsData.forEach(card => {
      themeCounts[card.theme] = (themeCounts[card.theme] || 0) + 1;
    });

    // Sort themes alphabetically
    const sortedThemes = Object.keys(themeCounts).sort();

    // Create filter buttons for each theme
    sortedThemes.forEach(theme => {
      const button = createFilterButton(theme, formatThemeName(theme), themeCounts[theme]);
      filterContainer.appendChild(button);
    });
  }

  // Create a filter button element
  function createFilterButton(theme, label, count) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'filter-btn';
    button.dataset.theme = theme;
    button.innerHTML = `${label} <span class="count">(${count})</span>`;
    
    if (theme === currentTheme) {
      button.classList.add('active');
    }
    button.setAttribute('aria-pressed', theme === currentTheme ? 'true' : 'false');

    button.addEventListener('click', () => filterByTheme(theme));
    return button;
  }

  // Format theme name for display
  function formatThemeName(theme) {
    return theme.charAt(0).toUpperCase() + theme.slice(1);
  }

  // Filter cards by theme
  function filterByTheme(theme) {
    currentTheme = theme;
    updateActiveThemeButton();
    applyFilters();
    
    // Scroll to cards section smoothly
    const cardsSection = document.getElementById('cards-container');
    if (cardsSection) {
      cardsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function updateActiveThemeButton() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.theme === currentTheme) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.setAttribute('aria-pressed', 'false');
      }
    });
  }

  function applyFilters() {
    const query = currentSearchQuery.trim().toLowerCase();
    const hasQuery = query.length > 0;

    const savedSet = getSavedCards();
    currentCards = cardsData.filter(card => {
      const matchesTheme = currentTheme === 'all' ? true : card.theme === currentTheme;
      if (!matchesTheme) return false;
      if (savedOnly && !savedSet.has(card.id)) return false;
      if (shortReadsOnly && getCardMeta(card).wordCount > 120) return false;
      if (!hasQuery) return true;
      return card.title.toLowerCase().includes(query) ||
        card.full_text.toLowerCase().includes(query) ||
        card.theme.toLowerCase().includes(query) ||
        getCardMeta(card).tags.join(' ').toLowerCase().includes(query);
    });

    currentCards = sortCards(currentCards, query);
    renderCards(currentCards);
    updateCardCount();
    updateSearchClearButton();
    renderActiveFilters();
    persistPreferences();
  }

  function sortCards(cards, query) {
    if (sortMode === 'newest') {
      return [...cards].sort((a, b) => b.page - a.page);
    }
    if (sortMode === 'most-viewed') {
      const viewCounts = getViewCounts();
      return [...cards].sort((a, b) => (viewCounts[b.id] || 0) - (viewCounts[a.id] || 0));
    }

    if (query && query.length > 0) {
      return [...cards].sort((a, b) => getRelevanceScore(b, query) - getRelevanceScore(a, query));
    }
    return [...cards].sort((a, b) => b.page - a.page);
  }

  function getRelevanceScore(card, query) {
    const lowerQuery = query.toLowerCase();
    const title = card.title.toLowerCase();
    const text = card.full_text.toLowerCase();
    const tags = getCardMeta(card).tags.join(' ').toLowerCase();
    let score = 0;
    if (title.includes(lowerQuery)) score += 3;
    if (tags.includes(lowerQuery)) score += 2;
    if (text.includes(lowerQuery)) score += 1;
    return score;
  }

  function persistPreferences() {
    localStorage.setItem(STORAGE_KEYS.theme, currentTheme);
    localStorage.setItem(STORAGE_KEYS.query, currentSearchQuery);
    localStorage.setItem(STORAGE_KEYS.sort, sortMode);
    localStorage.setItem(STORAGE_KEYS.savedOnly, String(savedOnly));
    localStorage.setItem(STORAGE_KEYS.shortReadsOnly, String(shortReadsOnly));
  }

  function getSavedCards() {
    const savedRaw = localStorage.getItem(STORAGE_KEYS.saved);
    if (!savedRaw) return new Set();
    try {
      return new Set(JSON.parse(savedRaw));
    } catch (e) {
      return new Set();
    }
  }

  function setSavedCards(savedSet) {
    localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(Array.from(savedSet)));
  }

  function getViewCounts() {
    const viewsRaw = localStorage.getItem(STORAGE_KEYS.views);
    if (!viewsRaw) return {};
    try {
      return JSON.parse(viewsRaw);
    } catch (e) {
      return {};
    }
  }

  function setViewCounts(viewCounts) {
    localStorage.setItem(STORAGE_KEYS.views, JSON.stringify(viewCounts));
  }

  function getCardMeta(card) {
    if (cardMetaCache.has(card.id)) {
      return cardMetaCache.get(card.id);
    }
    const wordCount = getWordCount(card.full_text);
    const readMinutes = Math.max(1, Math.round(wordCount / 200));
    const lengthLabel = wordCount <= 120 ? 'Short' : wordCount <= 240 ? 'Medium' : 'Long';
    const keyTakeaway = getKeyTakeaway(card);
    const tags = getCardTags(card);
    const meta = { wordCount, readMinutes, lengthLabel, keyTakeaway, tags };
    cardMetaCache.set(card.id, meta);
    return meta;
  }

  function getWordCount(text) {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }

  function getKeyTakeaway(card) {
    if (card.summary && card.summary.trim().length > 0) {
      return card.summary.trim();
    }
    const firstSentence = card.full_text.split(/[.!?]/)[0];
    return firstSentence.trim();
  }

  function getCardTags(card) {
    const themeTag = formatThemeName(card.theme);
    const titleWords = card.title
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .map(word => word.toLowerCase())
      .filter(word => word.length > 3);
    const uniqueTitleWords = Array.from(new Set(titleWords)).slice(0, 2);
    return [themeTag, ...uniqueTitleWords.map(word => word.charAt(0).toUpperCase() + word.slice(1))];
  }

  function getSuggestedThemes() {
    const counts = {};
    cardsData.forEach(card => {
      counts[card.theme] = (counts[card.theme] || 0) + 1;
    });
    return Object.keys(counts)
      .sort((a, b) => counts[b] - counts[a])
      .slice(0, 3);
  }

  function getAdjacentCards(card) {
    const list = currentCards.length > 0 ? currentCards : cardsData;
    const index = list.findIndex(item => item.id === card.id);
    if (index === -1) return { prevCard: null, nextCard: null };
    return {
      prevCard: index > 0 ? list[index - 1] : null,
      nextCard: index < list.length - 1 ? list[index + 1] : null
    };
  }

  // Render cards to the DOM
  function renderCards(cards) {
    const container = document.getElementById('cards-grid');
    if (!container) return;

    container.innerHTML = '';

    if (cards.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'no-cards';
      const suggestedThemes = getSuggestedThemes();
      const suggestionsMarkup = suggestedThemes.length
        ? `<div class="empty-suggestions">
            <span class="control-label">Try themes:</span>
            ${suggestedThemes.map(theme => `<button class="chip-btn" type="button" data-theme="${theme}">${formatThemeName(theme)}</button>`).join('')}
          </div>`
        : '';
      emptyState.innerHTML = `
        <p>No cards found. Try a different search or reset filters.</p>
        <button class="reset-filters-btn" type="button">Reset filters</button>
        ${suggestionsMarkup}
      `;
      container.appendChild(emptyState);

      const resetBtn = emptyState.querySelector('.reset-filters-btn');
      resetBtn.addEventListener('click', resetFilters);
      emptyState.querySelectorAll('[data-theme]').forEach(btn => {
        btn.addEventListener('click', () => {
          const theme = btn.getAttribute('data-theme');
          filterByTheme(theme);
        });
      });
      return;
    }

    const fragment = document.createDocumentFragment();
    cards.forEach(card => {
      const cardElement = createCardElement(card);
      fragment.appendChild(cardElement);
    });
    container.appendChild(fragment);
  }

  // Create a card element
  function createCardElement(card) {
    const cardButton = document.createElement('button');
    cardButton.type = 'button';
    cardButton.className = 'card';
    cardButton.dataset.cardId = card.id;
    cardButton.dataset.theme = card.theme;
    cardButton.setAttribute('role', 'listitem');
    cardButton.setAttribute('aria-label', `${card.title} (${formatThemeName(card.theme)} card)`);

    const meta = getCardMeta(card);
    const savedSet = getSavedCards();
    const isSaved = savedSet.has(card.id);

    cardButton.innerHTML = `
      <div class="card-header">
        <span class="card-theme">${formatThemeName(card.theme)}</span>
        <span class="card-page">Page ${card.page}</span>
      </div>
      <div class="card-body">
        <h3 class="card-title">${card.title}</h3>
        <p class="card-takeaway"><strong>Key takeaway:</strong> ${meta.keyTakeaway}</p>
        <p class="card-summary">${getCardSummary(card)}</p>
        <div class="card-meta">
          <span>${meta.readMinutes} min read</span>
          <span>${meta.lengthLabel}</span>
          ${isSaved ? '<span class="saved-badge">Saved</span>' : ''}
        </div>
      </div>
    `;

    cardButton.addEventListener('click', () => openCardModal(card));
    return cardButton;
  }

  function getCardSummary(card) {
    if (card.summary && card.summary.trim().length > 0) {
      return card.summary.trim();
    }
    return truncateText(card.full_text, 180);
  }

  function truncateText(text, maxLength) {
    const cleanText = text.replace(/\s+/g, ' ').trim();
    if (cleanText.length <= maxLength) {
      return cleanText;
    }
    const truncated = cleanText.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return `${truncated.slice(0, Math.max(lastSpace, 0))}...`;
  }

  // Open card modal with full details
  function openCardModal(card) {
    selectedCard = card;
    const modal = document.getElementById('card-modal');
    const modalContent = document.getElementById('modal-card-content');
    const appContent = document.getElementById('app-content');
    
    if (!modal || !modalContent) return;
    disableModalFocusTrap(modal);

    const meta = getCardMeta(card);
    const savedSet = getSavedCards();
    const isSaved = savedSet.has(card.id);
    const viewCounts = getViewCounts();
    viewCounts[card.id] = (viewCounts[card.id] || 0) + 1;
    setViewCounts(viewCounts);
    const viewCount = viewCounts[card.id];
    localStorage.setItem(STORAGE_KEYS.lastCard, card.id);
    updateContinueCardButton();

    let relatedCardsHTML = '';
    if (card.related_cards && card.related_cards.length > 0) {
      const relatedCards = card.related_cards
        .map(id => cardsData.find(c => c.id === id))
        .filter(c => c);
      
      if (relatedCards.length > 0) {
        relatedCardsHTML = `
          <div class="related-cards">
            <h4>Related Cards</h4>
            <div class="related-cards-list">
              ${relatedCards.map(rc => `
                <button class="related-card-btn" data-card-id="${rc.id}" type="button">
                  <span class="related-theme">${formatThemeName(rc.theme)}</span>
                  <span class="related-title">${rc.title}</span>
                </button>
              `).join('')}
            </div>
          </div>
        `;
      }
    }

    const { prevCard, nextCard } = getAdjacentCards(card);

    modalContent.innerHTML = `
      <div class="modal-header" data-theme="${card.theme}">
        <div class="modal-header-content">
          <span class="modal-theme">${formatThemeName(card.theme)}</span>
          <span class="modal-page">Page ${card.page}</span>
        </div>
        <button class="modal-close" id="modal-close-btn" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        <h2 class="modal-title" id="modal-title">${card.title}</h2>
        <div class="modal-takeaway"><strong>Key takeaway:</strong> ${meta.keyTakeaway}</div>
        <div class="card-meta">
          <span>${meta.readMinutes} min read</span>
          <span>${meta.lengthLabel}</span>
          <span>${viewCount} view${viewCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="tag-list">
          ${meta.tags.map(tag => `<span class="tag-chip">${tag}</span>`).join('')}
        </div>
        <div class="modal-text" id="modal-text">${formatCardText(card.full_text)}</div>
        ${relatedCardsHTML}
        <div class="modal-actions">
          <button class="action-btn secondary" id="back-to-results-btn" type="button">Back to results</button>
          <button class="action-btn secondary" id="prev-card-btn" type="button" ${prevCard ? '' : 'disabled'}>Previous</button>
          <button class="action-btn secondary" id="next-card-btn" type="button" ${nextCard ? '' : 'disabled'}>Next</button>
          <button class="action-btn" id="save-card-btn" type="button">${isSaved ? 'Saved' : 'Save'}</button>
        </div>
      </div>
    `;

    // Setup modal event listeners
    const closeBtn = document.getElementById('modal-close-btn');
    closeBtn.addEventListener('click', closeCardModal);

    // Setup related card buttons
    const relatedBtns = modalContent.querySelectorAll('.related-card-btn');
    relatedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const cardId = btn.dataset.cardId;
        const relatedCard = cardsData.find(c => c.id === cardId);
        if (relatedCard) {
          openCardModal(relatedCard);
        }
      });
    });

    const backToResultsBtn = document.getElementById('back-to-results-btn');
    if (backToResultsBtn) {
      backToResultsBtn.addEventListener('click', () => {
        closeCardModal();
        const cardsSection = document.getElementById('cards-container');
        if (cardsSection) {
          cardsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    const prevBtn = document.getElementById('prev-card-btn');
    if (prevBtn && prevCard) {
      prevBtn.addEventListener('click', () => openCardModal(prevCard));
    }

    const nextBtn = document.getElementById('next-card-btn');
    if (nextBtn && nextCard) {
      nextBtn.addEventListener('click', () => openCardModal(nextCard));
    }

    const saveBtn = document.getElementById('save-card-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const updatedSaved = getSavedCards();
        if (updatedSaved.has(card.id)) {
          updatedSaved.delete(card.id);
        } else {
          updatedSaved.add(card.id);
        }
        setSavedCards(updatedSaved);
        saveBtn.textContent = updatedSaved.has(card.id) ? 'Saved' : 'Save';
        applyFilters();
      });
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    modal.setAttribute('aria-hidden', 'false');
    modal.setAttribute('aria-describedby', 'modal-text');
    if (appContent) {
      appContent.setAttribute('aria-hidden', 'true');
      appContent.setAttribute('inert', '');
    }

    lastFocusedElement = document.activeElement;
    closeBtn.focus();
    enableModalFocusTrap(modal);
  }

  // Format card text with proper line breaks and structure
  function formatCardText(text) {
    // Replace multiple spaces with single space
    text = text.replace(/\s+/g, ' ').trim();
    
    // Add line breaks for better readability
    text = text.replace(/\. ([A-Z])/g, '.</p><p>$1');
    text = text.replace(/\? ([A-Z])/g, '?</p><p>$1');
    text = text.replace(/! ([A-Z])/g, '!</p><p>$1');
    
    // Wrap in paragraphs
    if (!text.startsWith('<p>')) {
      text = '<p>' + text;
    }
    if (!text.endsWith('</p>')) {
      text = text + '</p>';
    }
    
    return text;
  }

  function getFocusableElements(container) {
    return Array.from(
      container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter(element => !element.hasAttribute('disabled'));
  }

  function enableModalFocusTrap(modal) {
    const focusableElements = getFocusableElements(modal);
    if (focusableElements.length === 0) return;

    modalKeydownHandler = (e) => {
      if (e.key !== 'Tab') return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    modal.addEventListener('keydown', modalKeydownHandler);
  }

  function disableModalFocusTrap(modal) {
    if (modalKeydownHandler) {
      modal.removeEventListener('keydown', modalKeydownHandler);
      modalKeydownHandler = null;
    }
  }

  // Close card modal
  function closeCardModal() {
    const modal = document.getElementById('card-modal');
    const appContent = document.getElementById('app-content');
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
      modal.setAttribute('aria-hidden', 'true');
      modal.removeAttribute('aria-describedby');
      selectedCard = null;
      disableModalFocusTrap(modal);
    }
    if (appContent) {
      appContent.removeAttribute('aria-hidden');
      appContent.removeAttribute('inert');
    }
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
      lastFocusedElement = null;
    }
  }

  // Update card count display
  function updateCardCount() {
    const countElement = document.getElementById('card-count');
    if (countElement) {
      const themeText = currentTheme === 'all' ? 'all themes' : formatThemeName(currentTheme);
      const cardLabel = `card${currentCards.length !== 1 ? 's' : ''}`;
      const savedText = savedOnly ? 'saved ' : '';
      const shortText = shortReadsOnly ? 'short ' : '';
      if (currentSearchQuery.trim().length > 0) {
        const queryText = currentSearchQuery.trim();
        if (currentTheme === 'all') {
          countElement.textContent = `Showing ${currentCards.length} ${savedText}${shortText}${cardLabel} matching "${queryText}"`;
        } else {
          countElement.textContent = `Showing ${currentCards.length} ${savedText}${shortText}${cardLabel} in ${themeText} matching "${queryText}"`;
        }
      } else {
        countElement.textContent = `Showing ${currentCards.length} ${savedText}${shortText}${cardLabel} from ${themeText}`;
      }
    }
  }

  // Setup global event listeners
  function setupEventListeners() {
    // Close modal when clicking outside
    const modal = document.getElementById('card-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          closeCardModal();
        }
      });
    }

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && selectedCard) {
        closeCardModal();
      }
      if (selectedCard && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const { prevCard, nextCard } = getAdjacentCards(selectedCard);
        if (e.key === 'ArrowRight' && nextCard) {
          openCardModal(nextCard);
        }
        if (e.key === 'ArrowLeft' && prevCard) {
          openCardModal(prevCard);
        }
      }
    });

    // Search functionality
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const clearBtn = document.getElementById('search-clear-btn');

    if (searchInput && searchBtn) {
      const debouncedSearch = debounce(() => {
        currentSearchQuery = searchInput.value;
        applyFilters();
      }, 200);

      searchInput.addEventListener('input', debouncedSearch);
      searchBtn.addEventListener('click', () => {
        currentSearchQuery = searchInput.value;
        applyFilters();
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          currentSearchQuery = searchInput.value;
          applyFilters();
        }
      });
    }

    if (clearBtn && searchInput) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        currentSearchQuery = '';
        applyFilters();
      });
    }

    const savedBtn = document.getElementById('filter-saved');
    if (savedBtn) {
      savedBtn.addEventListener('click', () => {
        savedOnly = !savedOnly;
        updateQuickFilterButtons();
        applyFilters();
      });
    }

    const shortBtn = document.getElementById('filter-short');
    if (shortBtn) {
      shortBtn.addEventListener('click', () => {
        shortReadsOnly = !shortReadsOnly;
        updateQuickFilterButtons();
        applyFilters();
      });
    }

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        sortMode = sortSelect.value;
        applyFilters();
      });
    }

    const textSm = document.getElementById('text-sm');
    const textMd = document.getElementById('text-md');
    const textLg = document.getElementById('text-lg');
    if (textSm) {
      textSm.addEventListener('click', () => setFontScale('0.95'));
    }
    if (textMd) {
      textMd.addEventListener('click', () => setFontScale('1'));
    }
    if (textLg) {
      textLg.addEventListener('click', () => setFontScale('1.1'));
    }

    const readingToggle = document.getElementById('reading-mode-toggle');
    if (readingToggle) {
      readingToggle.addEventListener('click', () => {
        document.body.classList.toggle('reading-mode');
        const isOn = document.body.classList.contains('reading-mode');
        localStorage.setItem(STORAGE_KEYS.readingMode, String(isOn));
        updateReadingModeState();
      });
    }

    const continueBtn = document.getElementById('continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', () => {
        const lastCardId = localStorage.getItem(STORAGE_KEYS.lastCard);
        if (!lastCardId) return;
        const lastCard = cardsData.find(card => card.id === lastCardId);
        if (lastCard) {
          openCardModal(lastCard);
        }
      });
    }

    const backToTopBtn = document.getElementById('back-to-top');
    const backToResultsBtn = document.getElementById('back-to-results');
    if (backToTopBtn) {
      backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    if (backToResultsBtn) {
      backToResultsBtn.addEventListener('click', () => {
        const cardsSection = document.getElementById('cards-container');
        if (cardsSection) {
          cardsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    window.addEventListener('scroll', updateFloatingActions, { passive: true });
    updateFloatingActions();

    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  function resetFilters() {
    currentTheme = 'all';
    currentSearchQuery = '';
    savedOnly = false;
    shortReadsOnly = false;
    sortMode = 'relevance';
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.value = '';
    }
    updateActiveThemeButton();
    updateQuickFilterButtons();
    updateSortSelect();
    applyFilters();
  }

  function updateSearchClearButton() {
    const clearBtn = document.getElementById('search-clear-btn');
    const searchInput = document.getElementById('search-input');
    if (!clearBtn || !searchInput) return;
    if (searchInput.value.trim().length === 0) {
      clearBtn.classList.add('hidden');
    } else {
      clearBtn.classList.remove('hidden');
    }
  }

  function updateQuickFilterButtons() {
    const savedBtn = document.getElementById('filter-saved');
    const shortBtn = document.getElementById('filter-short');
    if (savedBtn) {
      savedBtn.classList.toggle('active', savedOnly);
      savedBtn.setAttribute('aria-pressed', savedOnly ? 'true' : 'false');
    }
    if (shortBtn) {
      shortBtn.classList.toggle('active', shortReadsOnly);
      shortBtn.setAttribute('aria-pressed', shortReadsOnly ? 'true' : 'false');
    }
  }

  function updateSortSelect() {
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.value = sortMode;
    }
  }

  function updateContinueCardButton() {
    const continueWrap = document.getElementById('continue-card');
    if (!continueWrap) return;
    const lastCardId = localStorage.getItem(STORAGE_KEYS.lastCard);
    const continueBtn = document.getElementById('continue-btn');
    if (lastCardId) {
      continueWrap.classList.remove('hidden');
      const lastCard = cardsData.find(card => card.id === lastCardId);
      if (continueBtn && lastCard) {
        continueBtn.textContent = `Continue: ${lastCard.title}`;
      }
    } else {
      continueWrap.classList.add('hidden');
    }
  }

  function setFontScale(value) {
    document.documentElement.style.setProperty('--font-scale', value);
    localStorage.setItem(STORAGE_KEYS.fontScale, value);
    updateTextSizeButtons();
  }

  function updateTextSizeButtons() {
    const currentScale = getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim() || '1';
    const textSm = document.getElementById('text-sm');
    const textMd = document.getElementById('text-md');
    const textLg = document.getElementById('text-lg');
    if (textSm) textSm.classList.toggle('active', currentScale === '0.95');
    if (textMd) textMd.classList.toggle('active', currentScale === '1');
    if (textLg) textLg.classList.toggle('active', currentScale === '1.1');
  }

  function updateReadingModeState() {
    const readingToggle = document.getElementById('reading-mode-toggle');
    const isOn = document.body.classList.contains('reading-mode');
    if (readingToggle) {
      readingToggle.classList.toggle('active', isOn);
      readingToggle.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    }
  }

  function renderSearchSuggestions() {
    const datalist = document.getElementById('search-suggestions');
    if (!datalist) return;
    const suggestions = new Set();
    cardsData.forEach(card => {
      suggestions.add(card.title);
      suggestions.add(formatThemeName(card.theme));
      getCardMeta(card).tags.forEach(tag => suggestions.add(tag));
    });
    datalist.innerHTML = '';
    Array.from(suggestions).sort().forEach(item => {
      const option = document.createElement('option');
      option.value = item;
      datalist.appendChild(option);
    });
  }

  function renderActiveFilters() {
    const container = document.getElementById('active-filters');
    if (!container) return;

    container.innerHTML = '';
    const chips = [];

    if (currentTheme !== 'all') {
      const chip = createFilterChip(`Theme: ${formatThemeName(currentTheme)}`, () => {
        currentTheme = 'all';
        updateActiveThemeButton();
        applyFilters();
      });
      chips.push(chip);
    }

    if (currentSearchQuery.trim().length > 0) {
      const queryText = currentSearchQuery.trim();
      const chip = createFilterChip(`Search: "${queryText}"`, () => {
        currentSearchQuery = '';
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
          searchInput.value = '';
        }
        applyFilters();
      });
      chips.push(chip);
    }

    if (savedOnly) {
      chips.push(createFilterChip('Saved only', () => {
        savedOnly = false;
        updateQuickFilterButtons();
        applyFilters();
      }));
    }

    if (shortReadsOnly) {
      chips.push(createFilterChip('Short reads', () => {
        shortReadsOnly = false;
        updateQuickFilterButtons();
        applyFilters();
      }));
    }

    if (sortMode !== 'relevance') {
      const sortLabel = sortMode === 'newest' ? 'Newest' : 'Most viewed';
      chips.push(createFilterChip(`Sort: ${sortLabel}`, () => {
        sortMode = 'relevance';
        updateSortSelect();
        applyFilters();
      }));
    }

    chips.forEach(chip => container.appendChild(chip));
  }

  function createFilterChip(label, onRemove) {
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.textContent = label;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.setAttribute('aria-label', `Remove ${label}`);
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', onRemove);

    chip.appendChild(removeBtn);
    return chip;
  }

  function updateFloatingActions() {
    const backToTopBtn = document.getElementById('back-to-top');
    const backToResultsBtn = document.getElementById('back-to-results');
    const cardsSection = document.getElementById('cards-container');
    if (!backToTopBtn || !backToResultsBtn) return;

    const scrollY = window.scrollY || window.pageYOffset;
    if (scrollY > 400) {
      backToTopBtn.classList.remove('hidden');
    } else {
      backToTopBtn.classList.add('hidden');
    }

    if (cardsSection) {
      const cardsTop = cardsSection.getBoundingClientRect().top + scrollY;
      if (scrollY > cardsTop + 100) {
        backToResultsBtn.classList.remove('hidden');
      } else {
        backToResultsBtn.classList.add('hidden');
      }
    }
  }

  function debounce(fn, wait) {
    let timeoutId;
    return (...args) => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => fn(...args), wait);
    };
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
