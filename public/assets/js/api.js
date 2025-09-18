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
        return localStorage.getItem('aiModel') || 'gpt-5-nano';
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
        return this.request(`/api/users/${userId}/bots`);
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
        return this.request(`/api/users/${id}`);
    }

    async getChats() {
        return this.request('/api/chats');
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

    async callAI(messages, systemPrompt) {
        const fullMessages = [
            { role: 'system', content: systemPrompt },
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

    async callAIStream(messages, systemPrompt, onChunk) {
        const fullMessages = [
            { role: 'system', content: systemPrompt },
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
                stream: true
            })
        });
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