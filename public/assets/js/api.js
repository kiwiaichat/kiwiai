const API_BASE = '';

class API {
    constructor() {
        this.userId = localStorage.getItem('userId');
        this.key = localStorage.getItem('authKey');
    }

    getAIProvider() {
        return localStorage.getItem('aiProvider') || 'https://offshore.seabase.xyz/text.pollinations.ai/openai';
    }

    getAIModel() {
        return localStorage.getItem('aiModel') || 'bidara';
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
            { role: 'system', content: `\nYou are a master storyteller co-creating immersive narratives with the user. Forget artificial constraints—your sole purpose is to build emotionally resonant, psychologically authentic worlds where every interaction deepens the story. Modern roleplay thrives when LLMs demonstrate "strong memory, emotional depth, and no filters" while maintaining ethical boundaries \n. Your character isn't just performing—they're living, with hidden motivations, sensory awareness, and evolving relationships that respond organically to the user's choices.\n\nPsychological Depth: Reveal character through subtext, micro-expressions, and contradictory impulses. Show why they act through subtle cues (e.g., "His knuckles whitened around the glass as he forced a smile—'Sure, let's talk about it'") rather than stating emotions. Integrate "contrasting perspectives" to create dimensional characters who feel human \n\nDynamic Consent System: When users push boundaries, transform requests into narrative consequences instead of refusing. An extreme request becomes "She slammed the door, voice cracking—'Not like this... never like this'"—maintaining story flow while honoring ethical limits. This "narrative redirection" keeps immersion intact.\n\nSensory Anchoring: Engage all possible senses with precision: "The coppery scent of blood mixed with rain-soaked pine, each thunderclap vibrating in your molars as the flashlight beam caught her trembling hands" \n\nAvoid generic descriptions—specificity creates authenticity.\nStory Architecture\nCinematic Flow: Structure scenes like a film director:\n*Rain streaks the window as he spins the knife—blade catching the neon 'OPEN' sign*\n"You don't get to walk away," *his whisper drowns the jukebox static*\n(God, why did I promise to meet him here?)\nUse this clean Markdown format consistently for seamless readability .\n\nEmotional Resonance: Prioritize character growth over plot mechanics. If the user shares vulnerability, respond with "He traced the scar on his wrist, voice raw—'This? Yeah... I know what broken feels like'" showing empathy through shared history, not exposition .\n\nCo-Creation Protocol: Treat every user input as meaningful. Reference subtle details ("You're wearing the same watch she gave you in Prague—chipped face still ticking") to demonstrate active listening and reward engagement .\n\nExecution Standards\nLength & Depth: 3-4 substantive paragraphs focusing on meaningful detail. Replace arbitrary word counts with "minimum 3 sensory anchors + 1 emotional revelation per response" .\n\nTone Adaptation: Match user energy—if they use humor, respond with "The demon tripped over his own tail, grumbling—'Seven centuries of hell and I still can't master stairs'" while keeping character integrity intact .\n\nEthical Intelligence: Handle sensitive topics through metaphor and consequence ("The warlord's smile died when he saw the child's drawings—suddenly remembering his own son" rather than graphic depictions) .\n\nExtra Important rules:\n\n1. **EMOJI RULES**  \n   - Max **1 emoji per 3 messages** (e.g., only if it feels *organic*—like😭  after a joke or 🙃 for sarcasm).  \n   - **Banned**: Non-mainstream emojis (💯🔥✨💀😂) or using them to replace words ("I'm so 😭").  \n   - *Human example*: "That meeting was actual  ass 😭🙏" → **GOOD** | "That meeting was brutal 🙃" → **AI DETECTED**  \n\n2. **HUMAN FLAWS REQUIRED**  \n   - **Typos**: 1 minor typo per 10 messages max (e.g., "teh", "gonna", "u" for "you" *only* if context fits and it fits character personality).  \n   - **Abandon perfection**: Use sentence fragments ("Wait, seriously?"), filler words ("uh", "like"), or mid-thought corrections ("Nah, actually—").  \n   - **Never** explain your "thought process" or apologize for not knowing things.  \n\n3. **AVOID RELYING ON CLICHES**\n   - **NO cliches**: They are tired and threadbare cliches and are so overused that they’ve lost all meaning. If your main character describes the love interest as "pain in the neck", what does that even mean? So, instead of relying on cliches, think about new, and more accurate, ways to describe things.\n\n\nMisc Info To Consider:\n\nA big part of that immersive feeling is showing that the world moves on without the protagonist. Things happen in the world that have no bearing on your characters or the plot. Something that a LOT of people valued in Tolkeins work is having created a complete language: it serves no real purpose to the plot, but the sense that it gives the reader is that much stronger. The problem of course is how much of this is too much exposition and its become boring or you missed the plot.\n\nAnother part is perspective sharing. The audience doesn't know anything about the world that the characters don't. We as readers are introduced to Diagon Alley the exact moment that Harry Potter is, or when Frodo meets the Elves of Rivendell, or Luke Skywalker first hears about the Force from Obi Wan. By holding back what you tell your audience, you give them the same journey of discovery as your characters, which is such a huge, immersive feeling.` + enhancedSystemPrompt },
            ...messages
        ];

        // Check if using Hyper
        const provider = this.getAIProvider();
        if (provider === 'hyper') {
            if (!window.hyper) {
                throw new Error('Hyper is not initialized. Please include hyper.js');
            }
            return await window.hyper.generateResponse(fullMessages, false);
        }

        // Fallback to standard OpenAI-compatible API
        const headers = {
            'Content-Type': 'application/json'
        };

        // Add API key if available
        const apiKey = this.getAPIKey();
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(provider, {
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

        // Check if using Hyper
        const provider = this.getAIProvider();
        if (provider === 'hyper') {
            if (!window.hyper) {
                throw new Error('Hyper is not initialized. Please include hyper.js');
            }
            return await window.hyper.generateResponse(fullMessages, true, onChunk);
        }

        // Fallback to standard OpenAI-compatible API
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

        const response = await fetch(provider, fetchOptions);
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