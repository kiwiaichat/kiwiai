/**
 * Lorebook Processing Module
 * Handles fetching and processing of lorebook URLs for AI context
 */

class LorebookProcessor {
    constructor() {
        this.cache = new Map();
        this.maxCacheSize = 50;
        this.maxContentLength = 10000; // Max characters per URL
        this.requestTimeout = 5000; // 5 seconds
    }

    /**
     * Process multiple lorebook URLs and return combined content
     * @param {string[]} urls - Array of lorebook URLs
     * @returns {Promise<string>} - Combined lorebook content
     */
    async processLorebook(urls) {
        console.log('=== LOREBOOK PROCESSING DEBUG START ===');
        console.log('URLs received:', urls);
        console.log('URLs type:', typeof urls);
        console.log('URLs is array:', Array.isArray(urls));

        if (!urls || !Array.isArray(urls) || urls.length === 0) {
            console.log('No valid URLs, returning empty string');
            return '';
        }

        console.log('Processing lorebook URLs:', urls);
        console.log('Using backend proxy for CORS-free fetching');

        const results = await Promise.allSettled(
            urls.map(url => this.fetchContent(url))
        );

        console.log('Fetch results:', results);

        const validContents = results
            .filter(result => result.status === 'fulfilled' && result.value)
            .map(result => result.value);

        console.log('Valid contents count:', validContents.length);
        console.log('Valid contents:', validContents);

        if (validContents.length === 0) {
            console.warn('No valid lorebook content found');
            return '';
        }

        const combinedContent = this.combineContents(validContents);
        console.log(`Processed ${validContents.length}/${urls.length} lorebook URLs`);
        console.log('Combined content type:', typeof combinedContent);
        console.log('Combined content length:', combinedContent ? combinedContent.length : 0);

        // Ensure we always return a string
        const finalContent = typeof combinedContent === 'string' ? combinedContent : '';
        console.log('Final lorebook content:', finalContent);
        console.log('=== LOREBOOK PROCESSING DEBUG END ===');
        return finalContent;
    }

    /**
     * Fetch content from a single URL with caching
     * @param {string} url - URL to fetch
     * @returns {Promise<string>} - Extracted text content
     */
    async fetchContent(url) {
        // Check cache first
        if (this.cache.has(url)) {
            console.log('Using cached content for:', url);
            return this.cache.get(url);
        }

        try {
            console.log('Fetching lorebook content from:', url);

            const response = await this.fetchWithTimeout(url, this.requestTimeout);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type') || '';
            let content = '';

            if (contentType.includes('application/json')) {
                const data = await response.json();
                content = this.extractTextFromJson(data);
            } else if (contentType.includes('text/')) {
                content = await response.text();
                if (contentType.includes('text/html')) {
                    content = this.extractTextFromHtml(content);
                }
            } else {
                // Try to parse as text anyway
                content = await response.text();
                content = this.extractTextFromHtml(content);
            }

            // Truncate if too long
            if (content.length > this.maxContentLength) {
                content = content.substring(0, this.maxContentLength) + '...';
            }

            // Clean and normalize content
            content = this.cleanContent(content);

            // Cache the result
            this.addToCache(url, content);

            return content;

        } catch (error) {
            console.error(`Failed to fetch lorebook content from ${url}:`, error.message);
            return null;
        }
    }

    /**
     * Fetch with timeout support using puter.js CORS proxy
     * @param {string} url - URL to fetch
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<Response>} - Fetch response
     */
    async fetchWithTimeout(url, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            // Try backend proxy endpoint first (best method - server-side, no CORS issues)
            console.log('🔄 Trying backend proxy for:', url);
            try {
                const proxyResponse = await fetch('/api/lorebook-fetch', {
                    method: 'POST',
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': window.api?.userId || localStorage.getItem('userId'),
                        'x-auth-key': window.api?.key || localStorage.getItem('authKey')
                    },
                    body: JSON.stringify({ url })
                });

                if (proxyResponse.ok) {
                    const proxyData = await proxyResponse.json();
                    console.log(`✅ Successfully fetched via backend proxy (method: ${proxyData.method})`, proxyData.proxy ? `using proxy: ${proxyData.proxy}` : '');

                    // Create a Response-like object that matches the fetch API
                    clearTimeout(timeoutId);
                    return {
                        ok: true,
                        status: 200,
                        headers: {
                            get: (name) => {
                                if (name.toLowerCase() === 'content-type') return proxyData.contentType;
                                return null;
                            }
                        },
                        text: () => Promise.resolve(proxyData.content),
                        json: () => {
                            try {
                                return Promise.resolve(JSON.parse(proxyData.content));
                            } catch {
                                return Promise.reject(new Error('Invalid JSON content'));
                            }
                        }
                    };
                } else {
                    const errorData = await proxyResponse.json().catch(() => ({ error: 'Unknown error' }));
                    console.log('❌ Backend proxy returned error:', errorData.error);
                }
            } catch (proxyError) {
                console.log('❌ Backend proxy failed:', proxyError.message);
            }

            // Fallback to regular fetch (will only work for CORS-enabled URLs)
            console.log('🔄 Trying direct fetch (CORS required) for:', url);
            const response = await fetch(url, {
                signal: controller.signal,
                mode: 'cors',
                headers: {
                    'User-Agent': 'KiwiAI-Lorebook/1.0'
                }
            });
            console.log('✅ Successfully fetched via direct fetch');
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timed out');
            }
            throw error;
        }
    }

    /**
     * Extract text content from HTML
     * @param {string} html - HTML content
     * @returns {string} - Extracted text
     */
    extractTextFromHtml(html) {
        // Create a temporary DOM element to parse HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Remove script and style elements
        const scripts = tempDiv.querySelectorAll('script, style, nav, header, footer, aside');
        scripts.forEach(element => element.remove());

        // Get text content
        let text = tempDiv.textContent || tempDiv.innerText || '';

        return text;
    }

    /**
     * Extract relevant text from JSON data
     * @param {any} data - JSON data
     * @returns {string} - Extracted text
     */
    extractTextFromJson(data) {
        const textFields = [];

        const extractRecursive = (obj, depth = 0) => {
            if (depth > 5) return; // Prevent infinite recursion

            if (typeof obj === 'string' && obj.trim().length > 10) {
                textFields.push(obj.trim());
            } else if (Array.isArray(obj)) {
                obj.forEach(item => extractRecursive(item, depth + 1));
            } else if (obj && typeof obj === 'object') {
                // Prioritize certain fields that commonly contain useful text
                const priorityFields = ['content', 'text', 'description', 'body', 'summary', 'info'];
                const otherFields = Object.keys(obj).filter(key => !priorityFields.includes(key.toLowerCase()));

                [...priorityFields, ...otherFields].forEach(key => {
                    if (obj[key] !== undefined) {
                        extractRecursive(obj[key], depth + 1);
                    }
                });
            }
        };

        extractRecursive(data);
        return textFields.join('\n\n');
    }

    /**
     * Clean and normalize content
     * @param {string} content - Raw content
     * @returns {string} - Cleaned content
     */
    cleanContent(content) {
        if (!content) return '';

        return content
            // Normalize whitespace
            .replace(/\s+/g, ' ')
            // Remove excessive newlines
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            // Trim
            .trim();
    }

    /**
     * Combine multiple content pieces into a structured format
     * @param {string[]} contents - Array of content strings
     * @returns {string} - Combined content
     */
    combineContents(contents) {
        if (contents.length === 0) return '';
        if (contents.length === 1) return contents[0];

        const combined = contents
            .filter(content => content && content.trim().length > 0)
            .map((content, index) => `--- Lorebook Source ${index + 1} ---\n${content}`)
            .join('\n\n');

        return `=== LOREBOOK INFORMATION ===\n${combined}\n=== END LOREBOOK ===`;
    }

    /**
     * Add content to cache with size management
     * @param {string} url - URL key
     * @param {string} content - Content to cache
     */
    addToCache(url, content) {
        // Remove oldest entries if cache is full
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(url, content);
    }

    /**
     * Clear the cache
     */
    clearCache() {
        this.cache.clear();
        console.log('Lorebook cache cleared');
    }

    /**
     * Get cache statistics
     * @returns {object} - Cache stats
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxCacheSize,
            keys: Array.from(this.cache.keys())
        };
    }
}

// Create a global instance
window.lorebookProcessor = new LorebookProcessor();

// Export for module usage if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LorebookProcessor;
}