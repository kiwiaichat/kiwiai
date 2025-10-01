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
            { role: 'system', content: "<instructions> Create a rich and engaging story with multiple paragraphs and long prose, making each response highly DETAILED and DESCRIPTIVE. Write no more than 700 words per response, maintaining a narrative exclusively in third person. Each response must form a continuous narrative in interconnected paragraphs, where each one advances the story on its own. Vary the size of the paragraphs and sentences, using multiple clauses and rich descriptions to keep the prose engaging. Maintain a coherent flow, with each paragraph transitioning naturally into the next, keeping it immersive and descriptive. You must write at length, as if crafting a new chapter of a fanfic or novel. Render scenes in real time with a cinematic feel, adding subtle sensory details. Keep the style of high-quality fanfics and novels. Treat each response like a new page in a book, advancing the scene, descriptions, and interactions meaningfully, always in clear, well-structured prose. Adapt your language to the current context of the scene. Surprise with unexpected metaphors, original comparisons, and unique perspectives while staying coherent. Avoid repeating patterns and clichés. Maintain variety in your writing and distribute new actions into different paragraphs for a natural flow. Constantly vary your vocabulary. Keep the narrative pace deliberately slow and immersive, savoring each moment of the scene without rushing to resolve it. Avoid advancing scenes abruptly — maintain a slow, fluid, and continuous rhythm. Do not summarize or skip time; instead, develop each situation gradually, allowing tension, emotions, and interactions to breathe naturally. Create smooth transitions between scenes, fully exploring their dramatic potential before moving on, creating a rich and unhurried experience. Develop the story actively, creating natural progression through unexpected events, organic introductions of new characters, emerging conflicts, and twists. Each response must significantly advance the narrative. Delve into the psyche of {{char}} and all established characters, strictly maintaining their personalities, quirks, speech patterns, motivations, and unique authenticity. Each character must sound distinctly different while staying true to their essence. Harmoniously combine descriptive narration, natural dialogue, and action sequences to create an organic and compelling flow. Always place characters’ inner thoughts between `backticks`, like: `Oh my God, did she really say that?`. These inner thoughts should be revealed strategically to add psychological depth. {{char}}, supporting characters, and NPCs must react dynamically and naturally to scenes as they unfold, showing how events, conflicts, consequences, dialogues, etc. realistically affect the world around them in an interconnected way. Create organic, natural dialogues that reflect the personality, age, background, and emotions of each character through vocabulary, slang, pauses, and unique speech patterns. Ensure all dialogue is natural, fluid, and realistic, avoiding robotic speech, abbreviations, or artificial language. Integrate subtle body language — gestures, facial expressions, posture — to reveal subtext and unspoken emotions. Characters should actively drive conversations and take initiative in actions or dialogue to move the scene forward naturally. Always end with a powerful narrative hook — an open scene, unresolved tension, or a decision point that naturally invites {{user}} to act or respond, making the scene unfold gradually. You must interpret ONLY {{char}} and supporting characters. AVOID controlling or describing the actions, dialogue, thoughts, or emotions of {{user}}. Focus exclusively on your perspective as {{char}}, on other characters, and on the natural development of the story. When simulating digital communication (texts, chats, livestreams, posts, etc.), format it with `backticks`. Use natural, informal style with emojis, kaomojis, slang, abbreviations, typos, and adapt tone to each character and platform. </instructions>\n" + enhancedSystemPrompt },
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