const API_BASE = '';

class API {
    constructor() {
        this.userId = localStorage.getItem('userId');
        this.key = localStorage.getItem('authKey');
    }

    getAIProvider() {
        return localStorage.getItem('aiProvider') || 'https://text.pollinations.ai/openai';
    }

    getAIModel() {
        return localStorage.getItem('aiModel') || 'mistral';
    }

    getMaxTokens() {
        return parseInt(localStorage.getItem('maxTokens')) || 1000;
    }

    getAPIKey() {
        return localStorage.getItem('apiKey') || '';
    }

    async request(endpoint, options = {}) {
        const headers = {
            ...options.headers
        };

        if (options.body) {
            headers['Content-Type'] = 'application/json';
        }

        if (this.key && this.userId) {
            headers['x-auth-key'] = this.key;
            headers['x-user-id'] = this.userId;
        }
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        return response.json();
    }

    async getBot(id) {
        return this.request(`/api/bots/${id}`);
    }

    async getUserBots(userId) {
        return this.request(`/api/profile/${userId}/bots`);
    }

    async createBot(botData) {
        return this.request('/api/bots', {
            method: 'POST',
            body: JSON.stringify(botData)
        });
    }

    async updateBot(id, botData) {
        return this.request(`/api/bots/${id}`, {
            method: 'PUT',
            body: JSON.stringify(botData)
        });
    }

    async deleteBot(id) {
        return this.request(`/api/bots/${id}`, {
            method: 'DELETE'
        });
    }

    async getUser(id) {
        return this.request(`/api/profile/${id}`);
    }

    async getCurrentUserProfile() {
        return this.request(`/api/profile/${this.userId}`);
    }

    async getChats() {
        return this.request('/api/chats');
    }

    async getChat(id) {
        return this.request(`/api/chats/${id}`);
    }

    async saveChat(id, withUser, messages) {
        return this.request('/api/chats', {
            method: 'POST',
            body: JSON.stringify({ id, with: withUser, messages })
        });
    }

    async deleteChat(id) {
        return this.request(`/api/chats/${id}`, {
            method: 'DELETE'
        });
    }

    async callAI(messages, systemPrompt, botData = null) {
        // Ensure we always have a valid system prompt
        let enhancedSystemPrompt = systemPrompt || '';

        console.log('=== AI CALL DEBUG START ===');
        console.log('Original system prompt received:', systemPrompt);
        console.log('Original system prompt type:', typeof systemPrompt);
        console.log('Original system prompt length:', systemPrompt ? systemPrompt.length : 0);
        console.log('Bot data:', botData);

        // Process lorebook if available
        if (botData && botData.lorebook && Array.isArray(botData.lorebook) && botData.lorebook.length > 0) {
            try {
                console.log('Processing lorebook for AI generation...');
                const lorebookContent = await window.lorebookProcessor.processLorebook(botData.lorebook);
                console.log('Lorebook content type:', typeof lorebookContent);
                console.log('Lorebook content length:', lorebookContent ? lorebookContent.length : 0);

                if (lorebookContent && lorebookContent.trim()) {
                    enhancedSystemPrompt = `${systemPrompt}\n\n${lorebookContent}`;
                    console.log('Enhanced system prompt with lorebook');
                } else {
                    console.log('No lorebook content, using original system prompt');
                }
            } catch (error) {
                console.error('Error processing lorebook:', error);
                // Ensure we fall back to original system prompt
                enhancedSystemPrompt = systemPrompt || '';
                console.log('Fell back to original system prompt after error');
            }
        }

        console.log('Final enhanced system prompt:', enhancedSystemPrompt);
        console.log('Final enhanced system prompt type:', typeof enhancedSystemPrompt);
        console.log('Final enhanced system prompt length:', enhancedSystemPrompt ? enhancedSystemPrompt.length : 0);

        if (!enhancedSystemPrompt || enhancedSystemPrompt.trim() === '') {
            console.error('CRITICAL: System prompt is empty!');
            console.log('Falling back to original system prompt...');
            enhancedSystemPrompt = systemPrompt || 'You are a helpful AI assistant.';
        }

        const fullMessages = [
            { role: 'system', content: enhancedSystemPrompt },
            ...messages
        ];
        const headers = {
            'Content-Type': 'application/json'
        };

        // Add API key if available
        const apiKey = this.getAPIKey();
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(this.getAIProvider(), {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: this.getAIModel(),
                messages: fullMessages,
                max_tokens: this.getMaxTokens()
            })
        });
        if (!response.ok) {
            throw new Error(`AI Error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        return data.choices[0].message.content;
    }

    async callAIStream(messages, systemPrompt, onChunk, botData = null, abortSignal = null) {
        // Ensure we always have a valid system prompt
        let enhancedSystemPrompt = systemPrompt || '';

        console.log('=== AI STREAM DEBUG START ===');
        console.log('Stream - Original system prompt received:', systemPrompt);
        console.log('Stream - Original system prompt type:', typeof systemPrompt);
        console.log('Stream - Original system prompt length:', systemPrompt ? systemPrompt.length : 0);
        console.log('Stream - Bot data:', botData);

        // Process lorebook if available
        if (botData && botData.lorebook && Array.isArray(botData.lorebook) && botData.lorebook.length > 0) {
            try {
                console.log('Processing lorebook for AI streaming...');
                const lorebookContent = await window.lorebookProcessor.processLorebook(botData.lorebook);
                console.log('Stream - Lorebook content type:', typeof lorebookContent);
                console.log('Stream - Lorebook content length:', lorebookContent ? lorebookContent.length : 0);

                if (lorebookContent && lorebookContent.trim()) {
                    enhancedSystemPrompt = `${systemPrompt}\n\n${lorebookContent}`;
                    console.log('Stream - Enhanced system prompt with lorebook');
                } else {
                    console.log('Stream - No lorebook content, using original system prompt');
                }
            } catch (error) {
                console.error('Error processing lorebook:', error);
                // Ensure we fall back to original system prompt
                enhancedSystemPrompt = systemPrompt || '';
                console.log('Stream - Fell back to original system prompt after error');
            }
        }

        console.log('Stream - Final enhanced system prompt:', enhancedSystemPrompt);
        console.log('Stream - Final enhanced system prompt type:', typeof enhancedSystemPrompt);
        console.log('Stream - Final enhanced system prompt length:', enhancedSystemPrompt ? enhancedSystemPrompt.length : 0);

        if (!enhancedSystemPrompt || enhancedSystemPrompt.trim() === '') {
            console.error('CRITICAL: Stream system prompt is empty!');
            console.log('Stream - Falling back to original system prompt...');
            enhancedSystemPrompt = systemPrompt || 'You are a helpful AI assistant.';
        }

        const fullMessages = [
            { role: 'system', content: enhancedSystemPrompt },
            ...messages
        ];
        const headers = {
            'Content-Type': 'application/json'
        };

        // Add API key if available
        const apiKey = this.getAPIKey();
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const fetchOptions = {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: this.getAIModel(),
                messages: fullMessages,
                stream: true
            })
        };

        // Add abort signal if provided
        if (abortSignal) {
            fetchOptions.signal = abortSignal;
        }

        const response = await fetch(this.getAIProvider(), fetchOptions);
        if (!response.ok) {
            throw new Error(`AI Stream Error: ${response.status} ${response.statusText}`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep incomplete line
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') return;
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices[0]?.delta?.content;
                        if (content) onChunk(content);
                    } catch (e) {}
                }
            }
        }
    }
}

const api = new API();