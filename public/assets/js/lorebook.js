/**
 * Lorebook Processing Module
 * Handles fetching and processing of lorebook URLs for AI context
 */

import { BareClient } from 'https://esm.sh/@tomphttp/bare-client@latest';

// Initialize BareClient
let bareClient;
fetch("./config.json").then(response => response.json()).then(res => {
    bareClient = new BareClient(res["bareClient"]);
});

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
        console.log('Using BareClient for CORS-free fetching');

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


    async fetchWithTimeout(url, timeout) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            // Wait for bareClient to be initialized
            while (!bareClient) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log('🔄 Fetching lorebook via BareClient from:', url);

            const response = await bareClient.fetch(url, {
                signal: controller.signal,
                headers: {
                    "accept": "*/*",
                    "accept-language": "en-US,en;q=0.5",
                },
                method: "GET",
                mode: "cors",
                credentials: "include"
            });

            console.log('✅ Successfully fetched via BareClient');
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