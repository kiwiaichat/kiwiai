// Shared Card Component Logic

/**
 * Creates a bot card element with standardized structure and behavior
 * @param {Object} bot - Bot data object
 * @param {Object} options - Configuration options
 * @returns {HTMLElement} - The created card element
 */
function createBotCard(bot, options = {}) {
    const {
        showActions = false,
        currentUserId = null,
        onEdit = null,
        onDelete = null,
        onClick = null
    } = options;

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.botId = bot.id;

    // Format view count
    const viewCount = typeof bot.views === 'number' ? bot.views : 0;
    const viewText = viewCount === 1 ? '1 view' : `${viewCount.toLocaleString()} views`;

    // Create tags HTML if tags exist
    let tagsHtml = '';
    if (bot.tags && Array.isArray(bot.tags) && bot.tags.length > 0) {
        const sortedTags = window.tagOrder ? bot.tags.sort((a, b) => {
            const orderA = window.tagOrder.has(a) ? window.tagOrder.get(a) : Infinity;
            const orderB = window.tagOrder.has(b) ? window.tagOrder.get(b) : Infinity;
            return orderA - orderB;
        }) : bot.tags;

        const tagElements = sortedTags.map(tag => {
            const tagIndex = window.tagOrder ? window.tagOrder.get(tag) : undefined;
            let tagClass = 'tag';
            if (tagIndex !== undefined && window.tags) {
                if (tagIndex < 3) {
                    tagClass += ' popular';
                } else if (tagIndex > window.tags.length * 0.7) {
                    tagClass += ' rare';
                }
            }
            return `<span class="${tagClass}">${escapeHtml(tag)}</span>`;
        }).join('');

        tagsHtml = `<div class="tags">${tagElements}</div>`;
    }

    // Create actions HTML if needed
    const actionsHTML = showActions && currentUserId && bot.author === getCurrentUserName() ? `
        <div class="bot-actions">
            <button class="bot-action-btn" onclick="handleEditBot('${bot.id}')" title="Edit Bot">✏️</button>
            <button class="bot-action-btn" onclick="handleDeleteBot('${bot.id}')" title="Delete Bot">🗑️</button>
        </div>
    ` : '';

    card.innerHTML = `
        ${actionsHTML}
        <img src="${bot.avatar || '/assets/general/noresponse.png'}" alt="${bot.name}" class="avatar">
        <div id="name">${escapeHtml(bot.name)}</div>
        <div id="description">${escapeHtml(bot.description || 'No description available')}</div>
        ${tagsHtml}
        <div id="author" onclick="event.stopPropagation(); window.location.href = '/profile/${escapeHtml(bot.author)}'" style="cursor: pointer;">by ${escapeHtml(bot.author)}</div>
        <div id="views">${viewText}</div>
    `;

    // Add click handler
    card.onclick = (e) => {
        // Don't trigger if clicking on action buttons or author element
        if (e.target.classList.contains('bot-action-btn') || e.target.id === 'author') {
            e.stopPropagation();
            return;
        }

        if (onClick) {
            onClick(bot, e);
        } else {
            // Default behavior - navigate to chat
            window.location.href = `/chat/${bot.id}`;
        }
    };

    // Add mobile touch handlers
    addCardTouchHandlers(card);

    // Set up action button handlers if they exist
    if (showActions) {
        setupCardActionHandlers(card, bot, { onEdit, onDelete });
    }

    return card;
}

/**
 * Adds mobile-friendly touch handlers to a card
 * @param {HTMLElement} card - The card element
 */
function addCardTouchHandlers(card) {
    let touchStartTime = 0;
    let touchMoved = false;
    let startX = 0;
    let startY = 0;

    // Enhanced touch feedback
    card.addEventListener('touchstart', (e) => {
        touchStartTime = Date.now();
        touchMoved = false;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;

        // Add touch feedback
        card.style.transform = 'scale(0.98)';
        card.style.transition = 'transform 0.1s ease';
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
        const deltaX = Math.abs(e.touches[0].clientX - startX);
        const deltaY = Math.abs(e.touches[0].clientY - startY);

        if (deltaX > 10 || deltaY > 10) {
            touchMoved = true;
            // Remove touch feedback on move
            card.style.transform = '';
        }
    }, { passive: true });

    card.addEventListener('touchend', (e) => {
        const touchDuration = Date.now() - touchStartTime;

        // Remove touch feedback
        card.style.transform = '';
        card.style.transition = '';

        // Only trigger click if it was a quick tap without movement
        if (!touchMoved && touchDuration < 300) {
            // Prevent ghost clicks
            e.preventDefault();

            // Trigger the card click after a small delay
            setTimeout(() => {
                card.click();
            }, 50);
        }
    }, { passive: false });
}

/**
 * Sets up action button handlers for a card
 * @param {HTMLElement} card - The card element
 * @param {Object} bot - Bot data
 * @param {Object} handlers - Event handlers
 */
function setupCardActionHandlers(card, bot, handlers) {
    const editBtn = card.querySelector('.bot-action-btn[title="Edit Bot"]');
    const deleteBtn = card.querySelector('.bot-action-btn[title="Delete Bot"]');

    if (editBtn && handlers.onEdit) {
        editBtn.onclick = (e) => {
            e.stopPropagation();
            handlers.onEdit(bot.id);
        };
    }

    if (deleteBtn && handlers.onDelete) {
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            handlers.onDelete(bot.id);
        };
    }
}

/**
 * Creates a loading card placeholder
 * @returns {HTMLElement} - The loading card element
 */
function createLoadingCard() {
    const card = document.createElement('div');
    card.className = 'card loading';
    card.innerHTML = `
        <div class="avatar" style="background-color: rgba(150, 214, 150, 0.1);"></div>
        <div id="name" style="height: 20px; background-color: rgba(150, 214, 150, 0.1); border-radius: 4px;"></div>
        <div id="description" style="height: 60px; background-color: rgba(150, 214, 150, 0.05); border-radius: 4px; margin-top: 8px;"></div>
        <div id="author" style="height: 16px; background-color: rgba(150, 214, 150, 0.05); border-radius: 4px; margin-top: auto;"></div>
    `;
    return card;
}

/**
 * Renders bot cards to a container
 * @param {Array} bots - Array of bot objects
 * @param {HTMLElement} container - Container element
 * @param {Object} options - Configuration options
 */
function renderBotCards(bots, container, options = {}) {
    const fragment = document.createDocumentFragment();

    bots.forEach(bot => {
        const card = createBotCard(bot, options);
        fragment.appendChild(card);
    });

    // Clear container and add new cards
    container.innerHTML = '';
    container.appendChild(fragment);
}

/**
 * Adds multiple loading cards to a container
 * @param {HTMLElement} container - Container element
 * @param {number} count - Number of loading cards to add
 */
function showLoadingCards(container, count = 6) {
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < count; i++) {
        fragment.appendChild(createLoadingCard());
    }

    container.appendChild(fragment);
}

/**
 * Removes loading cards from a container
 * @param {HTMLElement} container - Container element
 */
function hideLoadingCards(container) {
    const loadingCards = container.querySelectorAll('.card.loading');
    loadingCards.forEach(card => card.remove());
}

/**
 * Utility function to escape HTML
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Gets the current user's name from localStorage or API
 * @returns {string|null} - Current user's name
 */
function getCurrentUserName() {
    // This should be implemented based on your auth system
    // For now, we'll use a placeholder
    return window.currentUserName || null;
}

/**
 * Global handlers for card actions (to be implemented by each page)
 */
window.handleEditBot = window.handleEditBot || function(botId) {
    console.warn('handleEditBot not implemented for bot:', botId);
};

window.handleDeleteBot = window.handleDeleteBot || function(botId) {
    console.warn('handleDeleteBot not implemented for bot:', botId);
};

// Set up mutation observer for dynamically added cards
document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && node.classList && node.classList.contains('card') && !node.classList.contains('loading')) {
                    addCardTouchHandlers(node);
                }
            });
        });
    });

    // Observe all card containers
    const cardContainers = document.querySelectorAll('#cards, .bot-grid, .cards-container');
    cardContainers.forEach(container => {
        if (container) {
            observer.observe(container, { childList: true });
        }
    });
});