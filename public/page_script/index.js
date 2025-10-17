const wisdom = [
            "you'll never fall asleep if you simply look at a kiwi bird",
            "none of the devs have ever eaten a kiwi",
            "kiwis are birds and fruits?",
            "i feel like pablo when i see me with a kiwi",
            "a oddly lightweight kiwi",
            "wake up mr west",
            "soloing 4 projects at once",
            "life advice: always stand on business",
            "we eat kiwi but we don't eat kiwi. you'll never know which was the bird and which was the fruit",
            "green is a pretty color",
            "FIND GOD ¥$",
            "marimari_en is a mf who loves truckin, fuckin but most importantly? cranking her hog"
        ]

        document.getElementById("wisdom").innerHTML = wisdom[Math.floor(Math.random() * wisdom.length)]

        const authBtn = document.getElementById('auth-btn');
        const userId = localStorage.getItem('userId');
        if (userId) {
            
            authBtn.style.display = 'none';
            const userPfp = document.createElement('img');
            userPfp.className = 'user-pfp';
            userPfp.src = '/assets/users/default.png'; 
            userPfp.alt = 'User Profile';
            userPfp.onclick = () => window.location.href = `/profile/${userId}`;

            
            fetch(`/api/profile/${userId}`)
                .then(response => response.json())
                .then(userData => {
                    if (userData.avatar) {
                        userPfp.src = userData.avatar;
                    }
                })
                .catch(console.error);

            document.querySelector('.nav-actions').appendChild(userPfp);
        } else {
            authBtn.textContent = 'Login';
            authBtn.onclick = () => window.location.href = '/login';
        }

        let offset = 0;
        const limit = 20;
        let loading = false;
        let tags = [];
        let displayedBotIds = new Set();

        async function fetchTags() {
            try {
                const response = await fetch('/api/tags');
                const data = await response.json();
                tags = data.tags || [];
                const tagSelect = document.getElementById('tags');
                tagSelect.innerHTML = '';
                tags.forEach(tag => {
                    const option = document.createElement('option');
                    option.value = tag;
                    option.textContent = tag;
                    tagSelect.appendChild(option);
                });
                
                window.tagOrder = new Map(tags.map((tag, index) => [tag, index]));
            } catch (error) {
                console.error('Error fetching tags:', error);
            }
        }

        async function loadBots(params = {}) {
            loading = true;
            try {
                let query = `offset=${offset}&limit=${limit}`;
                if (params.search) query += `&search=${encodeURIComponent(params.search)}`;
                if (params.tags && params.tags.length > 0) query += `&tags=${encodeURIComponent(params.tags.join(','))}`;
                if (params.sort) query += `&sort=${encodeURIComponent(params.sort)}`;

                const headers = {};
                const authKey = localStorage.getItem('authKey');
                const userId = localStorage.getItem('userId');
                if (authKey && userId) {
                    headers['x-auth-key'] = authKey;
                    headers['x-user-id'] = userId;
                }
                const cards = document.getElementById('cards');
                if (offset === 0) {
                    cards.innerHTML = '';
                    displayedBotIds.clear();
                    showSkeletons(cards, 6);
                }
                const response = await fetch(`/api/bots?${query}`, { headers });
                const data = await response.json();
                if (offset === 0) {
                    cards.innerHTML = '';
                }
                const currentUserId = localStorage.getItem('userId');

                data.bots.forEach(bot => {
                    
                    if (displayedBotIds.has(bot.id)) {
                        return;
                    }
                    displayedBotIds.add(bot.id);
                    const card = document.createElement('div');
                    card.className = 'card';
                    card.dataset.botId = bot.id; // Add bot ID for mobile touch handlers
                    card.onclick = (e) => {

                        if (e.target.classList.contains('bot-action-btn')) {
                            e.stopPropagation();
                            return;
                        }
                        window.location.href = `/chat/${bot.id}`;
                    };

                    const isOwner = currentUserId && bot.author === currentUserId;
                    const botActions = isOwner ? `
                        <div class="bot-actions">
                            <button class="bot-action-btn" onclick="editBot('${bot.id}', event)">Edit</button>
                            <button class="bot-action-btn delete" onclick="deleteBot('${bot.id}', event)">Delete</button>
                        </div>
                    ` : '';

                    const sortedBotTags = bot.tags ? bot.tags.sort((a, b) => {
                        const orderA = window.tagOrder.has(a) ? window.tagOrder.get(a) : Infinity;
                        const orderB = window.tagOrder.has(b) ? window.tagOrder.get(b) : Infinity;
                        return orderA - orderB;
                    }) : [];
                    const tagsHtml = sortedBotTags.map(tag => {
                        const tagIndex = window.tagOrder.get(tag);
                        let tagClass = 'tag';
                        if (tagIndex !== undefined) {
                            if (tagIndex < 3) {
                                tagClass += ' popular';
                            } else if (tagIndex > tags.length * 0.7) {
                                tagClass += ' rare';
                            }
                        }
                        return `<span class="${tagClass}">${tag}</span>`;
                    }).join('');

                    const viewCount = typeof bot.views === 'number' ? bot.views : 0;
                    const viewText = viewCount === 1 ? '1 view' : `${viewCount.toLocaleString()} views`;

                    // Add status badge if bot is private or anonymous
                    let statusBadge = '';
                    if (bot.status === 'private') {
                        statusBadge = '<span class="private-badge">🔒 Private</span>';
                    } else if (bot.status === 'anonymous') {
                        statusBadge = '<span class="anonymous-badge">👤 Anonymous</span>';
                    }

                    card.innerHTML = `
                        ${botActions}
                        <img src="${bot.avatar || '/assets/general/noresponse.png'}" alt="Bot Avatar" class="avatar">
                        <span id="name">${bot.name}${statusBadge}</span>
                        <span id="description">${bot.description}</span>
                        <div class="tags">${tagsHtml}</div>
                        <span id="author" onclick="window.location.href = '/profile/${bot.author}'">${bot.author}</span>
                        <span id="views">${viewText}</span>
                    `;
                    cards.appendChild(card);
                });
                offset += limit;
                loading = false;
            } catch (error) {
                console.error('Error loading bots:', error);
            }
        }

        function reloadBots() {
            offset = 0;
            displayedBotIds.clear();
            const search = document.getElementById('search').value;
            const selectedTags = Array.from(document.getElementById('tags').selectedOptions).map(option => option.value);
            loadBots({ search, tags: selectedTags });
        }

        function editBot(botId, event) {
            event.stopPropagation();
            window.location.href = `/maker?edit=${botId}`;
        }

        async function deleteBot(botId, event) {
            event.stopPropagation();
            if (!confirm('Are you sure you want to delete this bot? This action cannot be undone.')) {
                return;
            }

            try {
                const response = await fetch(`/api/bots/${botId}`, {
                    method: 'DELETE',
                    headers: {
                        'x-auth-key': localStorage.getItem('authKey'),
                        'x-user-id': localStorage.getItem('userId')
                    }
                });

                if (response.ok) {
                    
                    const cards = document.getElementById('cards');
                    const cardToRemove = event.target.closest('.card');
                    cards.removeChild(cardToRemove);
                    displayedBotIds.delete(botId);
                    alert('Bot deleted successfully!');
                } else {
                    throw new Error('Failed to delete bot');
                }
            } catch (error) {
                console.error('Error deleting bot:', error);
                alert('Error deleting bot. Please try again.');
            }
        }

        fetchTags().then(() => {
            loadBots({});
        });


        const searchInput = document.getElementById('search');
        const tagsSelect = document.getElementById('tags');

        // Enhanced mobile input handling
        searchInput.addEventListener('input', reloadBots);
        searchInput.addEventListener('focus', () => {
            if (window.innerWidth <= 768) {
                // Scroll to search input on mobile when focused
                setTimeout(() => {
                    searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        });

        tagsSelect.addEventListener('change', reloadBots);

        // Enhanced mobile scroll handling with touch tracking
        let isScrolling = false;
        let touchStartY = 0;

        document.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        document.addEventListener('touchmove', () => {
            isScrolling = true;
        }, { passive: true });

        document.addEventListener('touchend', () => {
            setTimeout(() => {
                isScrolling = false;
            }, 150);
        }, { passive: true });

        window.addEventListener('scroll', () => {
            const search = searchInput.value;
            const selectedTags = Array.from(tagsSelect.selectedOptions).map(option => option.value);

            // Better infinite scroll detection for mobile
            const threshold = window.innerWidth <= 768 ? 200 : 100;
            const nearBottom = window.scrollY + window.innerHeight >= document.body.scrollHeight - threshold;

            if (!loading && (search || selectedTags.length > 0) === false && nearBottom && !isScrolling) {
                loadBots({});
            }
        }, { passive: true });

        // Add touch feedback to cards
        document.addEventListener('DOMContentLoaded', () => {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1 && node.classList.contains('card')) {
                            addCardTouchHandlers(node);
                        }
                    });
                });
            });

            observer.observe(document.getElementById('cards'), {
                childList: true
            });
        });

        function addCardTouchHandlers(card) {
            let touchStartTime = 0;
            let touchMoved = false;

            card.addEventListener('touchstart', (e) => {
                touchStartTime = Date.now();
                touchMoved = false;
                if (window.innerWidth <= 768) {
                    card.style.transform = 'translateY(-2px) scale(0.98)';
                }
            }, { passive: true });

            card.addEventListener('touchmove', () => {
                touchMoved = true;
                if (window.innerWidth <= 768) {
                    card.style.transform = '';
                }
            }, { passive: true });

            card.addEventListener('touchend', (e) => {
                if (window.innerWidth <= 768) {
                    card.style.transform = '';
                }

                // Only trigger click if it was a tap (not a scroll)
                const touchDuration = Date.now() - touchStartTime;
                if (!touchMoved && touchDuration < 300) {
                    const botId = card.dataset.botId;
                    if (botId) {
                        window.location.href = `/chat/${botId}`;
                    }
                }
            }, { passive: true });
        }


        async function loadRecentBots() {
            const authKey = localStorage.getItem('authKey');
            const userId = localStorage.getItem('userId');
            if (!authKey || !userId) {
                return;
            }
            try {
                const response = await fetch('/api/recent-bots', {
                    headers: {
                        'x-auth-key': authKey,
                        'x-user-id': userId
                    }
                });
                if (response.ok) {
                    const data = await response.json();
                    const container = document.getElementById('recents-cards');
                    container.innerHTML = '';
                    if (data.bots && data.bots.length > 0) {
                        document.getElementById('recents').style.display = 'block';
                        data.bots.forEach(bot => {
                            const card = document.createElement('div');
                            card.className = 'card';

                            const viewCount = typeof bot.views === 'number' ? bot.views : 0;
                            const viewText = viewCount === 1 ? '1 view' : `${viewCount.toLocaleString()} views`;

                            card.innerHTML = `
                                <img src="${bot.avatar || '/assets/general/noresponse.png'}" alt="${bot.name}" class="avatar">
                                <div id="name">${bot.name}</div>
                                <div id="description">${bot.description || 'No description available'}</div>
                                <div id="author">${bot.author}</div>
                                <div id="views">${viewText}</div>
                            `;
                            card.onclick = () => window.location.href = `/chat/${bot.id}`;
                            container.appendChild(card);
                        });
                    } else {
                        document.getElementById('recents').style.display = 'none';
                    }
                }
            } catch (error) {
                console.error('Error loading recent bots:', error);
            }
        }
