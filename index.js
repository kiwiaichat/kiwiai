const fastify = require("fastify");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const sharp = require("sharp");
const { HttpsProxyAgent } = require('https-proxy-agent');
const app = fastify({ logger: false });


const authAttempts = new Map();

// Proxy cache for lorebook fetching
let proxyList = [];
let proxyLastFetched = 0;
const PROXY_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = authAttempts.get(ip) || {
    attempts: 0,
    lastAttempt: 0,
    blocked: false,
  };

  
  if (now - entry.lastAttempt > 15 * 60 * 1000) {
    entry.attempts = 0;
    entry.blocked = false;
  }

  
  if (entry.attempts >= 5) {
    entry.blocked = true;
    authAttempts.set(ip, entry);
    return false;
  }

  return true;
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const entry = authAttempts.get(ip) || {
    attempts: 0,
    lastAttempt: 0,
    blocked: false,
  };
  entry.attempts++;
  entry.lastAttempt = now;
  authAttempts.set(ip, entry);
}

function recordSuccessfulAuth(ip) {
  
  authAttempts.delete(ip);
}


function validateAndSanitizeInput(input, type, maxLength = 10000) {
  if (typeof input !== "string") {
    throw new Error("Input must be a string");
  }

  if (input.length > maxLength) {
    throw new Error(`Input too long. Maximum length: ${maxLength}`);
  }

  
  const sanitized = input.replace(/[<>'"]/g, "");

  switch (type) {
    case "username":
      if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
        throw new Error(
          "Username can only contain alphanumeric characters, hyphens, and underscores"
        );
      }
      if (sanitized.length < 3 || sanitized.length > 30) {
        throw new Error("Username must be between 3 and 30 characters");
      }
      break;
    case "text":
      
      break;
    case "filename":
      if (!/^[a-zA-Z0-9._-]+$/.test(sanitized)) {
        throw new Error("Invalid filename");
      }
      break;
  }

  return sanitized;
}


let tagUsage = {};


function updateTagUsage() {
  const bots = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "bots.json"), "utf-8")
  );
  const counts = {};
  Object.values(bots).forEach((bot) => {
    if (bot.tags && Array.isArray(bot.tags)) {
      bot.tags.forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    }
  });
  tagUsage = counts;
}

// Fetch and cache proxy list
async function fetchProxyList() {
  const now = Date.now();
  if (proxyList.length > 0 && (now - proxyLastFetched) < PROXY_CACHE_DURATION) {
    return proxyList;
  }

  try {
    const response = await fetch('https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc');
    const data = await response.json();

    // Filter for working HTTP proxies with good uptime
    proxyList = data.data
      .filter(proxy =>
        proxy.protocols.includes('http') &&
        proxy.upTime >= 80 &&
        proxy.speed > 100 &&
        proxy.anonymityLevel === 'elite'
      )
      .slice(0, 20); // Keep top 20 proxies

    proxyLastFetched = now;
    console.log(`Fetched ${proxyList.length} working proxies`);
    return proxyList;
  } catch (error) {
    console.error('Failed to fetch proxy list:', error);
    return proxyList; // Return cached list if available
  }
}

// Lorebook proxy endpoint
app.post('/api/lorebook-fetch', async (request, reply) => {
   try {
     await auth_middleware(request, reply);
   } catch (e) {
     return;
   }

   const { url } = request.body;
   if (!url || typeof url !== 'string') {
     return reply.code(400).send({ error: 'URL is required' });
   }

   // Validate URL
   try {
     new URL(url);
   } catch {
     return reply.code(400).send({ error: 'Invalid URL' });
   }

   console.log('Fetching lorebook content from:', url);

   // Try direct fetch first
   try {
     const response = await fetch(url, {
       headers: {
         'User-Agent': 'KiwiAI-Lorebook/1.0',
         'Accept': 'text/html,application/xhtml+xml,application/xml,text/plain,application/json'
       },
       timeout: 10000
     });

     if (response.ok) {
       const content = await response.text();
       const contentType = response.headers.get('content-type') || '';
       return {
         content,
         contentType,
         method: 'direct'
       };
     }
   } catch (directError) {
     console.log('Direct fetch failed, trying proxies:', directError.message);
   }

   // If direct fetch fails, try proxies
   const proxies = await fetchProxyList();

   for (const proxy of proxies.slice(0, 5)) { // Try top 5 proxies
     try {
       const proxyUrl = `http://${proxy.ip}:${proxy.port}`;
       console.log(`Trying proxy: ${proxyUrl}`);

       // Create proxy agent
       const agent = new HttpsProxyAgent(proxyUrl);

       const response = await fetch(url, {
         agent: agent,
         headers: {
           'User-Agent': 'KiwiAI-Lorebook/1.0',
           'Accept': 'text/html,application/xhtml+xml,application/xml,text/plain,application/json'
         },
         signal: AbortSignal.timeout(8000)
       });

       if (response.ok) {
         const content = await response.text();
         const contentType = response.headers.get('content-type') || '';
         console.log(`Successfully fetched via proxy: ${proxyUrl}`);
         return {
           content,
           contentType,
           method: 'proxy',
           proxy: proxyUrl
         };
       }
     } catch (proxyError) {
       console.log(`Proxy ${proxy.ip}:${proxy.port} failed:`, proxyError.message);
       continue;
     }
   }

   return reply.code(500).send({
     error: 'Failed to fetch content via direct connection or proxies',
     attempted: proxies.length > 0 ? 'direct + proxy' : 'direct only'
   });
 });

// AI-powered message enhancement endpoint
app.post('/api/enhance-message', async (request, reply) => {
  try {
    await auth_middleware(request, reply);
  } catch (e) {
    return;
  }

  const { message, context, enhancementType = 'improve' } = request.body;

  if (!message || typeof message !== 'string') {
    return reply.code(400).send({ error: 'Message is required' });
  }

  if (message.trim().length === 0) {
    return reply.code(400).send({ error: 'Message cannot be empty' });
  }

  console.log('Enhancing message:', message.substring(0, 100) + '...');

  // Get user settings for AI
  const userId = request.headers['x-user-id'];
  const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf-8'));
  const user = users[userId];

  let systemPrompt = '';
  switch (enhancementType) {
    case 'improve':
      systemPrompt = `You are an expert writing assistant. Improve the following message by making it more clear, engaging, and well-written while preserving the original meaning and intent. Fix any grammatical errors, improve sentence structure, and make the language more polished and professional. Only return the improved message, no explanations.`;
      break;
    case 'formal':
      systemPrompt = `You are a professional writing assistant. Rewrite the following message in a more formal, professional tone while preserving the original meaning. Use proper grammar, eliminate contractions, and make the language more sophisticated. Only return the rewritten message, no explanations.`;
      break;
    case 'casual':
      systemPrompt = `You are a friendly writing assistant. Rewrite the following message in a more casual, conversational tone while preserving the original meaning. Use contractions, simpler language, and a friendly voice. Only return the rewritten message, no explanations.`;
      break;
    case 'expand':
      systemPrompt = `You are a writing assistant. Expand the following message by adding more detail, examples, and elaboration while preserving the core meaning. Make it more comprehensive and informative. Only return the expanded message, no explanations.`;
      break;
    case 'summarize':
      systemPrompt = `You are a writing assistant. Summarize the following message by making it more concise while preserving the key points and main ideas. Remove unnecessary details but keep all important information. Only return the summarized message, no explanations.`;
      break;
    default:
      systemPrompt = `You are a writing assistant. Improve the following message by making it clearer and more engaging while preserving the original meaning. Only return the improved message, no explanations.`;
  }

  try {
    const aiProvider = user ? (user.aiProvider || 'https://text.pollinations.ai/openai') : 'https://text.pollinations.ai/openai';
    const apiKey = user ? (user.apiKey || '') : '';
    const model = user ? (user.aiModel || 'mistral') : 'mistral';

    const headers = {
      'Content-Type': 'application/json'
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];

    if (context && context.trim()) {
      messages.splice(1, 0, { role: 'assistant', content: `Context: ${context}` });
    }

    const response = await fetch(aiProvider, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`AI API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const enhancedMessage = data.choices[0].message.content.trim();

    return {
      original: message,
      enhanced: enhancedMessage,
      enhancementType: enhancementType
    };

  } catch (error) {
    console.error('Error enhancing message:', error);
    return reply.code(500).send({
      error: 'Failed to enhance message',
      details: error.message
    });
  }
});

// AI-powered message creation endpoint
app.post('/api/create-message', async (request, reply) => {
  try {
    await auth_middleware(request, reply);
  } catch (e) {
    return;
  }

  const { context, messageType = 'reply', botPersonality, style = 'natural' } = request.body;

  if (!context || typeof context !== 'string' || context.trim().length === 0) {
    return reply.code(400).send({ error: 'Context is required' });
  }

  console.log('Creating message with context:', context.substring(0, 100) + '...');

  // Get user settings for AI
  const userId = request.headers['x-user-id'];
  const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf-8'));
  const user = users[userId];

  let systemPrompt = '';
  switch (messageType) {
    case 'reply':
      systemPrompt = `You are a helpful assistant. Based on the conversation context provided, generate a natural and relevant reply. The reply should be contextually appropriate and engaging.`;
      break;
    case 'question':
      systemPrompt = `You are a curious assistant. Based on the conversation context provided, generate an insightful question that would continue the conversation naturally and show genuine interest.`;
      break;
    case 'elaboration':
      systemPrompt = `You are an articulate assistant. Based on the conversation context provided, generate a message that elaborates on the previous topic, adding valuable insights or additional information.`;
      break;
    case 'summary':
      systemPrompt = `You are an organized assistant. Based on the conversation context provided, generate a message that summarizes the key points discussed so far.`;
      break;
    default:
      systemPrompt = `You are a helpful assistant. Based on the conversation context provided, generate a natural and relevant message.`;
  }

  // Adjust for style
  if (style === 'formal') {
    systemPrompt += ` Use a professional and formal tone.`;
  } else if (style === 'casual') {
    systemPrompt += ` Use a friendly and casual tone.`;
  } else if (style === 'humorous') {
    systemPrompt += ` Add some humor and wit to make it entertaining.`;
  }

  // Add bot personality if provided
  if (botPersonality && botPersonality.trim()) {
    systemPrompt += ` Consider this personality/context: ${botPersonality}`;
  }

  try {
    const aiProvider = user ? (user.aiProvider || 'https://text.pollinations.ai/openai') : 'https://text.pollinations.ai/openai';
    const apiKey = user ? (user.apiKey || '') : '';
    const model = user ? (user.aiModel || 'mistral') : 'mistral';

    const headers = {
      'Content-Type': 'application/json'
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Context: ${context}` }
    ];

    const response = await fetch(aiProvider, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model,
        messages: messages,
        max_tokens: 500,
        temperature: 0.8
      })
    });

    if (!response.ok) {
      throw new Error(`AI API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const generatedMessage = data.choices[0].message.content.trim();

    return {
      generated: generatedMessage,
      messageType: messageType,
      style: style,
      context: context
    };

  } catch (error) {
    console.error('Error creating message:', error);
    return reply.code(500).send({
      error: 'Failed to create message',
      details: error.message
    });
  }
});

app.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/",
});

app.register(require("@fastify/multipart"));

app.get("/profile/:profile", async (request, reply) => {
  await reply.sendFile("profiles.html");
});

app.get("/chat/:id", async (request, reply) => {
  await reply.sendFile("chat.html");
});

app.get("/login", async (request, reply) => {
  await reply.sendFile("login.html");
});

app.get("/maker", async (request, reply) => {
  await reply.sendFile("maker.html");
});

app.get("/api/health", async (request, reply) => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

app.get("/api/profile/:profile", async (request, reply) => {
  const profile = request.params.profile;
  const requestingUserId = request.headers["x-user-id"];
  const users = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
  );
  let user = null;
  let userId = null;
  for (const id in users) {
    if (id === profile || users[id].name === profile) {
      user = users[id];
      userId = id;
      break;
    }
  }
  if (!user) {
    return reply.code(404).send({ error: "Profile not found" });
  }
  const bots = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "bots.json"), "utf-8")
  );
  let userBots = user.bots.map((botId) => bots[botId]).filter(Boolean);

  
  const isOwnProfile = requestingUserId === userId;

  
  userBots = userBots.filter((bot) => {
    
    if (bot.status === "public") {
      return true;
    }
    
    if (bot.status === "private") {
      return (
        isOwnProfile ||
        (requestingUserId &&
          users[requestingUserId] &&
          bot.author === users[requestingUserId].name)
      );
    }
    return false;
  });

  
  userBots = userBots.map((bot) => {

    if (typeof bot.views !== "number") {
      bot.views = 0;
    }

    // Only include sys_pmt if user owns the bot or is viewing their own profile
    const canSeeSysPmt = isOwnProfile || (requestingUserId && users[requestingUserId] && bot.author === users[requestingUserId].name);

    if (canSeeSysPmt) {
      // Include full bot data including sys_pmt
      return {
        id: bot.id,
        ...bot,
      };
    } else {
      // Filter out sys_pmt for public listings
      return {
        id: bot.id,
        ...Object.entries(bot)
          .filter(([key]) => key !== "sys_pmt")
          .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {}),
      };
    }
  });

  
  const safeUserData = {
    name: user.name,
    bots: userBots,
    avatar: user.avatar,
    bio: user.bio,
  };

  
  if (isOwnProfile) {
    safeUserData.conversations = user.conversations;
    safeUserData.recentBots = user.recentBots;
  }

  return { ...safeUserData, id: userId };
});

app.get("/api/tags", async (request, reply) => {
  const userId = request.headers["x-user-id"];
  const bots = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "bots.json"), "utf-8")
  );
  const users = userId
    ? JSON.parse(
        fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
      )
    : {};
  const allTags = new Set();

  Object.values(bots).forEach((bot) => {
    
    if (
      canAccessBot(bot, userId, users) &&
      bot.tags &&
      Array.isArray(bot.tags)
    ) {
      bot.tags.forEach((tag) => allTags.add(tag));
    }
  });

  const tagsArray = Array.from(allTags);
  
  tagsArray.sort((a, b) => {
    const countA = tagUsage[a] || 0;
    const countB = tagUsage[b] || 0;
    if (countA !== countB) {
      return countB - countA;
    }
    return a.localeCompare(b);
  });
  return { tags: tagsArray };
});

app.get("/api/bots", async (request, reply) => {
  const offset = Math.max(0, parseInt(request.query.offset) || 0);
  let limit = parseInt(request.query.limit) || 20;
  limit = Math.min(limit, 100); 
  const search = (request.query.search || "").toString().slice(0, 100); 
  const tags = request.query.tags
    ? request.query.tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    : [];
  const sortParam = (request.query.sort || "").toString();
  let field = "name";
  let direction = "asc";
  if (sortParam) {
    const sortParts = sortParam.split("_");
    field = sortParts[0] || "name";
    direction = sortParts[1] || "asc";
  }
  const allowedFields = ["name", "description", "author", "status"];
  if (!allowedFields.includes(field)) {
    field = "name";
  }

  const userId = request.headers["x-user-id"];
  const bots = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "bots.json"), "utf-8")
  );
  const users = userId
    ? JSON.parse(
        fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
      )
    : {};
  let botIds = Object.keys(bots);

  
  botIds = botIds.filter((id) => {
    const bot = bots[id];

    
    if (!canAccessBot(bot, userId, users)) {
      return false;
    }

    
    if (
      search &&
      !bot.name.toLowerCase().includes(search.toLowerCase()) &&
      !bot.description.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    
    if (tags.length > 0) {
      if (
        !bot.tags ||
        !Array.isArray(bot.tags) ||
        !bot.tags.some((tag) => tags.includes(tag))
      ) {
        return false;
      }
    }
    return true;
  });

  
  botIds.sort((a, b) => {
    const valA = bots[a][field] || "";
    const valB = bots[b][field] || "";
    if (direction === "asc") {
      return valA > valB ? 1 : -1;
    } else {
      return valA < valB ? 1 : -1;
    }
  });

  
  const paginatedIds = botIds.slice(offset, offset + limit);
  const botList = paginatedIds.map((id) => {
    const bot = bots[id];
    
    if (typeof bot.views !== "number") {
      bot.views = 0;
    }
    return {
      id,
      ...Object.entries(bot)
        .filter(([key]) => key !== "sys_pmt")
        .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {}),
    };
  });
  return { bots: botList };
});

app.get("/api/bots/:id", async (request, reply) => {
  const botId = request.params.id;
  const userId = request.headers["x-user-id"];
  const bots = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "bots.json"), "utf-8")
  );
  const users = userId
    ? JSON.parse(
        fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
      )
    : {};

  if (!bots[botId]) {
    return reply.code(404).send({ error: "Bot not found" });
  }

  const bot = bots[botId];
  if (!canAccessBot(bot, userId, users)) {
    return reply.code(404).send({ error: "Bot not found" });
  }

  
  if (typeof bot.views !== "number") {
    bot.views = 0;
  }

  // Include sys_pmt for users who can access the bot (needed for AI generation)
  const safeBot = {
    id: botId,
    ...bot,
  };
  return safeBot;
});

app.put("/api/bots/:id", async (request, reply) => {
  try {
    await auth_middleware(request, reply);
  } catch (e) {
    return;
  }

  const botId = request.params.id;
  const userId = request.headers["x-user-id"];

  const bots = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "bots.json"), "utf-8")
  );
  const users = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
  );

  if (!bots[botId]) {
    return reply.code(404).send({ error: "Bot not found" });
  }

  if (bots[botId].author !== users[userId].name) {
    return reply.code(403).send({ error: "Unauthorized" });
  }

  const updatedData = { ...request.body };
  delete updatedData.author; 
  Object.assign(bots[botId], updatedData);

  fs.writeFileSync(
    path.join(__dirname, "data", "bots.json"),
    JSON.stringify(bots, null, 2)
  );
  return { status: "ok" };
});

app.delete("/api/bots/:id", async (request, reply) => {
  try {
    await auth_middleware(request, reply);
  } catch (e) {
    return;
  }

  const botId = request.params.id;
  const userId = request.headers["x-user-id"];

  const bots = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "bots.json"), "utf-8")
  );
  const users = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
  );

  if (!bots[botId]) {
    return reply.code(404).send({ error: "Bot not found" });
  }

  if (bots[botId].author !== users[userId].name) {
    return reply.code(403).send({ error: "Unauthorized" });
  }

  
  deleteImageFile(bots[botId].avatar);

  delete bots[botId];
  fs.writeFileSync(
    path.join(__dirname, "data", "bots.json"),
    JSON.stringify(bots, null, 2)
  );

  users[userId].bots = users[userId].bots.filter((id) => id !== botId);
  fs.writeFileSync(
    path.join(__dirname, "data", "users.json"),
    JSON.stringify(users, null, 2)
  );

  return { status: "ok" };
});

app.post("/api/bots/:id/view", async (request, reply) => {
  const botId = request.params.id;
  const bots = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "bots.json"), "utf-8")
  );

  if (!bots[botId]) {
    return reply.code(404).send({ error: "Bot not found" });
  }

  
  if (typeof bots[botId].views !== "number") {
    bots[botId].views = 0;
  }

  bots[botId].views++;
  fs.writeFileSync(
    path.join(__dirname, "data", "bots.json"),
    JSON.stringify(bots, null, 2)
  );

  return { status: "ok", views: bots[botId].views };
});

app.post("/api/register", async (request, reply) => {
  
  if (!checkRateLimit(request.ip)) {
    return reply
      .code(429)
      .send({
        error: "Too many registration attempts. Please try again later.",
      });
  }

  const { username, password } = request.body;
  if (!username || !password) {
    return reply
      .code(400)
      .send({ error: "Username and password are required" });
  }

  try {
    const sanitizedUsername = validateAndSanitizeInput(username, "username");

    if (password.length < 8) {
      return reply
        .code(400)
        .send({ error: "Password must be at least 8 characters long" });
    }
    if (password.length > 128) {
      return reply.code(400).send({ error: "Password too long" });
    }
  } catch (error) {
    return reply.code(400).send({ error: error.message });
  }
  const users = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
  );

  const existingUser = Object.values(users).find(
    (user) => user.name === sanitizedUsername
  );
  if (existingUser) {
    recordFailedAttempt(request.ip);
    return reply.code(409).send({ error: "Username already exists" });
  }

  const salt = crypto.randomBytes(32).toString("hex");
  const hash = crypto
    .scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
    .toString("hex");

  const key = crypto.randomBytes(64).toString("hex");

  const id = Object.keys(users).length.toString();
  const ipAddress = request.ip;

  users[id] = {
    name: sanitizedUsername,
    password: { salt, hash },
    ipAddress: ipAddress,
    key: key,
    bots: [],
    conversations: [],
    recentBots: [],
    avatar: "/assets/users/default.png",
    bio: "",
  };
  fs.writeFileSync(
    path.join(__dirname, "data", "users.json"),
    JSON.stringify(users, null, 2)
  );

  
  recordSuccessfulAuth(request.ip);
  return { status: "ok", userId: id, key: key };
});

app.post("/api/login", async (request, reply) => {
  
  if (!checkRateLimit(request.ip)) {
    return reply
      .code(429)
      .send({ error: "Too many login attempts. Please try again later." });
  }

  const { username, password } = request.body;
  if (!username || !password) {
    return reply
      .code(400)
      .send({ error: "Username and password are required" });
  }

  let sanitizedUsername;
  try {
    sanitizedUsername = validateAndSanitizeInput(username, "username");
    if (password.length > 128) {
      return reply.code(400).send({ error: "Invalid username or password" });
    }
  } catch (error) {
    return reply.code(400).send({ error: "Invalid username or password" });
  }
  const users = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
  );

  let userId = null;
  let user = null;
  for (const id in users) {
    if (users[id].name === sanitizedUsername) {
      userId = id;
      user = users[id];
      break;
    }
  }
  if (!user) {
    recordFailedAttempt(request.ip);
    return reply.code(401).send({ error: "Invalid username or password" });
  }

  const { salt, hash } = user.password;
  const inputHash = crypto
    .scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
    .toString("hex");
  if (inputHash !== hash) {
    recordFailedAttempt(request.ip);
    return reply.code(401).send({ error: "Invalid username or password" });
  }

  
  fs.writeFileSync(
    path.join(__dirname, "data", "users.json"),
    JSON.stringify(users, null, 2)
  );

  
  recordSuccessfulAuth(request.ip);
  return { status: "ok", userId: userId, key: user.key };
});

async function auth_middleware(request, reply) {
  let key = request.headers["x-auth-key"];
  let id = request.headers["x-user-id"];

  if (!key || !id) {
    reply.code(401).send({ error: "Unauthorized" });
    throw new Error("Auth failed");
  }

  let users = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
  );

  if (!users[id] || users[id]["key"] !== key) {
    reply.code(401).send({ error: "Unauthorized" });
    throw new Error("Auth failed");
  }

  return true;
}

function canAccessBot(bot, userId, users) {
  if (bot.status === "public") {
    return true;
  }
  if (!userId || !users[userId]) {
    return false;
  }
  return bot.author === users[userId].name;
}

async function optimizeAndSaveImage(base64Data, fileName) {
  
  if (!base64Data || typeof base64Data !== "string") {
    throw new Error("Invalid image data");
  }

  
  const sizeInBytes = (base64Data.length * 3) / 4;
  if (sizeInBytes > 5 * 1024 * 1024) {
    throw new Error("Image too large. Maximum size: 5MB");
  }

  const buffer = Buffer.from(base64Data, "base64");

  
  try {
    const metadata = await sharp(buffer).metadata();
    if (
      !metadata.format ||
      !["jpeg", "png", "webp", "gif", "bmp"].includes(metadata.format)
    ) {
      throw new Error("Invalid image format");
    }
  } catch (error) {
    throw new Error("Invalid image file");
  }

  
  const useWebP = fileName.endsWith(".webp");
  const finalFileName = useWebP
    ? fileName
    : fileName.replace(/\.(jpg|jpeg|gif|bmp)$/i, ".png");
  const filePath = path.join(
    __dirname,
    "public",
    "assets",
    "bots",
    finalFileName
  );

  if (useWebP) {
    
    await sharp(buffer)
      .resize(512, 512, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toFile(filePath);
  } else {
    
    await sharp(buffer)
      .resize(512, 512, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9 })
      .toFile(filePath);
  }

  return `/assets/bots/${finalFileName}`;
}

function deleteImageFile(avatarPath) {
  if (avatarPath && avatarPath.startsWith("/assets/bots/")) {
    const filePath = path.join(__dirname, "public", avatarPath);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error("Error deleting image file:", error);
    }
  }
}

async function optimizeAndSaveUserImage(base64Data, fileName) {
  
  if (!base64Data || typeof base64Data !== "string") {
    throw new Error("Invalid image data");
  }

  
  const sizeInBytes = (base64Data.length * 3) / 4;
  if (sizeInBytes > 2 * 1024 * 1024) {
    throw new Error("Image too large. Maximum size: 2MB");
  }

  const buffer = Buffer.from(base64Data, "base64");

  
  try {
    const metadata = await sharp(buffer).metadata();
    if (
      !metadata.format ||
      !["jpeg", "png", "webp", "gif", "bmp"].includes(metadata.format)
    ) {
      throw new Error("Invalid image format");
    }
  } catch (error) {
    throw new Error("Invalid image file");
  }

  
  const usersDir = path.join(__dirname, "public", "assets", "users");
  if (!fs.existsSync(usersDir)) {
    fs.mkdirSync(usersDir, { recursive: true });
  }

  const filePath = path.join(usersDir, fileName);

  
  await sharp(buffer)
    .resize(200, 200, {
      fit: "cover",
      position: "center",
    })
    .png({ compressionLevel: 9 })
    .toFile(filePath);

  return `/assets/users/${fileName}`;
}

function deleteUserImageFile(avatarPath) {
  if (
    avatarPath &&
    avatarPath.startsWith("/assets/users/") &&
    avatarPath !== "/assets/users/default.png"
  ) {
    const filePath = path.join(__dirname, "public", avatarPath);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error("Error deleting user image file:", error);
    }
  }
}

app.post("/api/upload-bot", async (request, reply) => {
  try {
    await auth_middleware(request, reply);
  } catch (e) {
    return;
  }

  const { name, description, status, avatar, sys_pmt, greeting, chats, tags, lorebook } =
    request.body;
  if (!name || !description || !status || !sys_pmt || !greeting) {
    return reply
      .code(400)
      .send({ error: "All required fields must be filled" });
  }

  let sanitizedName,
    sanitizedDescription,
    sanitizedSysPmt,
    sanitizedGreeting,
    sanitizedChats,
    sanitizedTags,
    sanitizedLorebook;

  try {
    sanitizedName = validateAndSanitizeInput(name, "text", 100);
    sanitizedDescription = validateAndSanitizeInput(description, "text", 1000);
    sanitizedSysPmt = validateAndSanitizeInput(sys_pmt, "text", 15000);
    sanitizedGreeting = validateAndSanitizeInput(greeting, "text", 15000);
    sanitizedChats = validateAndSanitizeInput(chats || "", "text", 500_000);

    sanitizedTags = [];
    if (Array.isArray(tags)) {
      sanitizedTags = tags
        .filter((t) => typeof t === "string")
        .map((t) => validateAndSanitizeInput(t.trim(), "text", 50))
        .filter((t) => t.length > 0);
    }

    sanitizedLorebook = [];
    if (Array.isArray(lorebook)) {
      sanitizedLorebook = lorebook
        .filter((url) => typeof url === "string")
        .map((url) => {
          const trimmedUrl = url.trim();
          // Basic URL validation
          try {
            new URL(trimmedUrl);
            return trimmedUrl;
          } catch {
            return null;
          }
        })
        .filter((url) => url !== null && url.length > 0 && url.length <= 2000);
    }

    if (!["public", "private"].includes(status)) {
      return reply.code(400).send({ error: "Invalid status value" });
    }
  } catch (error) {
    return reply.code(400).send({ error: error.message });
  }
  const id = request.headers["x-user-id"];

  const bots = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "bots.json"), "utf-8")
  );
  const users = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
  );
  const user = users[id];
  const bot_id = (Math.max(-1, ...Object.keys(bots).map(Number)) + 1).toString();

  bots[bot_id] = {
    name: sanitizedName,
    description: sanitizedDescription,
    author: user.name,
    status,
    avatar: avatar || "/assets/bots/noresponse.png",
    sys_pmt: sanitizedSysPmt,
    greeting: sanitizedGreeting,
    chats: sanitizedChats,
    tags: sanitizedTags,
    lorebook: sanitizedLorebook,
    views: 0,
  };
  fs.writeFileSync(
    path.join(__dirname, "data", "bots.json"),
    JSON.stringify(bots, null, 2)
  );

  users[id]["bots"].push(bot_id);
  fs.writeFileSync(
    path.join(__dirname, "data", "users.json"),
    JSON.stringify(users, null, 2)
  );

  updateTagUsage();

  return { status: "ok", timestamp: new Date().toISOString() };
});

app.get("/api/chats", async (request, reply) => {
  try {
    await auth_middleware(request, reply);
  } catch (e) {
    return;
  }

  const userId = request.headers["x-user-id"];
  const users = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
  );
  const userConversations = users[userId].conversations;

  const conversations = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "conversations.json"), "utf-8")
  );
  const includeFull = request.query.full === 'true';
  const chats = {};
  userConversations.forEach((id) => {
    if (conversations[id]) {
      if (includeFull) {
        // Include full chat data for backward compatibility
        chats[id] = conversations[id];
      } else {
        // Only include metadata, not full messages
        chats[id] = {
          id: conversations[id].id,
          with: conversations[id].with,
          lastModified: conversations[id].lastModified || Date.now(),
          messageCount: conversations[id].messages ? conversations[id].messages.length : 0
        };
      }
    }
  });

  return { chats };
});

// New endpoint to get full chat with messages
app.get("/api/chats/:id", async (request, reply) => {
  try {
    await auth_middleware(request, reply);
  } catch (e) {
    return;
  }

  const chatId = request.params.id;
  const userId = request.headers["x-user-id"];
  const users = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
  );

  // Check if user owns this conversation
  if (!users[userId].conversations.includes(chatId)) {
    return reply.code(403).send({ error: "Access denied" });
  }

  const conversations = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "conversations.json"), "utf-8")
  );

  if (!conversations[chatId]) {
    return reply.code(404).send({ error: "Chat not found" });
  }

  return { chat: conversations[chatId] };
});

app.post("/api/chats", async (request, reply) => {
  try {
    await auth_middleware(request, reply);
  } catch (e) {
    return;
  }

  const { id: providedId, with: withUser, messages } = request.body;
  if (!withUser || !messages || !Array.isArray(messages)) {
    return reply
      .code(400)
      .send({
        error: "with and messages are required; messages must be an array",
      });
  }
  if (messages.length > 1000) {

    return reply.code(400).send({ error: "Too many messages" });
  }
  const userId = request.headers["x-user-id"];

  const conversations = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "conversations.json"), "utf-8")
  );
  const users = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
  );

  let id = providedId;
  let isUpdate = false;

  // Check if this is an update to existing conversation
  if (id && conversations[id]) {
    // Verify user owns this conversation
    if (!users[userId].conversations.includes(id)) {
      return reply.code(403).send({ error: "Access denied" });
    }
    isUpdate = true;
  } else {
    // Create new conversation
    id = crypto.randomBytes(16).toString("hex");
  }

  conversations[id] = {
    id,
    with: withUser,
    messages,
    createdAt: conversations[id]?.createdAt || new Date().toISOString(),
    lastModified: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(__dirname, "data", "conversations.json"),
    JSON.stringify(conversations, null, 2)
  );

  // Add to user's conversation list if it's a new chat
  if (!isUpdate && !users[userId].conversations.includes(id)) {
    users[userId].conversations.push(id);
    fs.writeFileSync(
      path.join(__dirname, "data", "users.json"),
      JSON.stringify(users, null, 2)
    );
  }

  return { status: "ok", conversationId: id, id };
});

app.delete("/api/chats/:id", async (request, reply) => {
  try {
    await auth_middleware(request, reply);
  } catch (e) {
    return;
  }

  const conversationId = request.params.id;
  const userId = request.headers["x-user-id"];

  const conversations = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "conversations.json"), "utf-8")
  );
  if (!conversations[conversationId]) {
    return reply.code(404).send({ error: "Conversation not found" });
  }

  const users = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
  );
  if (!users[userId].conversations.includes(conversationId)) {
    return reply.code(403).send({ error: "Unauthorized" });
  }

  delete conversations[conversationId];
  fs.writeFileSync(
    path.join(__dirname, "data", "conversations.json"),
    JSON.stringify(conversations, null, 2)
  );

  users[userId].conversations = users[userId].conversations.filter(
    (id) => id !== conversationId
  );
  fs.writeFileSync(
    path.join(__dirname, "data", "users.json"),
    JSON.stringify(users, null, 2)
  );

  return { status: "ok" };
});

app.post("/api/log-bot-use", async (request, reply) => {
  try {
    await auth_middleware(request, reply);
  } catch (e) {
    return;
  }

  const { botId } = request.body;
  if (!botId) {
    return reply.code(400).send({ error: "botId is required" });
  }
  const userId = request.headers["x-user-id"];

  const users = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
  );
  if (!users[userId].recentBots) {
    users[userId].recentBots = [];
  }
  
  users[userId].recentBots = users[userId].recentBots.filter(
    (id) => id !== botId
  );
  users[userId].recentBots.unshift(botId);
  
  users[userId].recentBots = users[userId].recentBots.slice(0, 10);
  fs.writeFileSync(
    path.join(__dirname, "data", "users.json"),
    JSON.stringify(users, null, 2)
  );

  return { status: "ok" };
});

app.get("/api/recent-bots", async (request, reply) => {
  try {
    await auth_middleware(request, reply);
  } catch (e) {
    return;
  }

  const userId = request.headers["x-user-id"];
  const users = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
  );
  const bots = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "bots.json"), "utf-8")
  );

  const recentBots = (users[userId].recentBots || [])
    .map((botId) => {
      const bot = bots[botId];
      if (bot) {
        
        if (typeof bot.views !== "number") {
          bot.views = 0;
        }
        return {
          id: botId,
          ...Object.entries(bot)
            .filter(([key]) => key !== "sys_pmt")
            .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {}),
        };
      }
      return null;
    })
    .filter(Boolean);

  return { bots: recentBots };
});

app.put("/api/profile/update", async (request, reply) => {
  try {
    await auth_middleware(request, reply);
  } catch (e) {
    return;
  }

  const userId = request.headers["x-user-id"];
  const { bio, avatar } = request.body;

  try {
    const users = JSON.parse(
      fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
    );

    if (!users[userId]) {
      return reply.code(404).send({ error: "User not found" });
    }

    
    if (bio !== undefined) {
      const sanitizedBio = validateAndSanitizeInput(bio, "text", 500);
      users[userId].bio = sanitizedBio;
    }

    
    if (avatar && avatar.startsWith("data:image/")) {
      
      if (
        users[userId].avatar &&
        users[userId].avatar !== "/assets/users/default.png"
      ) {
        deleteUserImageFile(users[userId].avatar);
      }

      
      const base64Data = avatar.split(",")[1];
      const fileName = `${userId}.png`;
      const avatarPath = await optimizeAndSaveUserImage(base64Data, fileName);
      users[userId].avatar = avatarPath;
    }

    
    fs.writeFileSync(
      path.join(__dirname, "data", "users.json"),
      JSON.stringify(users, null, 2)
    );

    return { status: "ok", message: "Profile updated successfully" };
  } catch (error) {
    console.error("Error updating profile:", error);
    return reply.code(500).send({ error: "Internal server error" });
  }
});

app.delete("/api/delete-account", async (request, reply) => {
  try {
    await auth_middleware(request, reply);
  } catch (e) {
    return;
  }

  const userId = request.headers["x-user-id"];

  try {
    const users = JSON.parse(
      fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
    );
    const bots = JSON.parse(
      fs.readFileSync(path.join(__dirname, "data", "bots.json"), "utf-8")
    );
    const conversations = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "data", "conversations.json"),
        "utf-8"
      )
    );

    if (!users[userId]) {
      return reply.code(404).send({ error: "User not found" });
    }

    const user = users[userId];

    
    if (user.bots && Array.isArray(user.bots)) {
      user.bots.forEach((botId) => {
        if (bots[botId]) {
          
          deleteImageFile(bots[botId].avatar);
          
          delete bots[botId];
        }
      });
    }

    
    if (user.conversations && Array.isArray(user.conversations)) {
      user.conversations.forEach((conversationId) => {
        delete conversations[conversationId];
      });
    }

    
    deleteUserImageFile(user.avatar);
    delete users[userId];

    
    fs.writeFileSync(
      path.join(__dirname, "data", "users.json"),
      JSON.stringify(users, null, 2)
    );
    fs.writeFileSync(
      path.join(__dirname, "data", "bots.json"),
      JSON.stringify(bots, null, 2)
    );
    fs.writeFileSync(
      path.join(__dirname, "data", "conversations.json"),
      JSON.stringify(conversations, null, 2)
    );

    return { status: "ok", message: "Account deleted successfully" };
  } catch (error) {
    console.error("Error deleting account:", error);
    return reply.code(500).send({ error: "Internal server error" });
  }
});

app.setNotFoundHandler(async (request, reply) => {
  
  const normalizedPath = path
    .normalize(request.url)
    .replace(/^(\.\.[\/\\])+/, "");
  const safePath = path.join(__dirname, "public", normalizedPath);

  
  if (!safePath.startsWith(path.join(__dirname, "public"))) {
    return reply.code(403).send({ error: "Access denied" });
  }

  try {
    await reply.sendFile(normalizedPath, path.join(__dirname, "public"));
  } catch (err) {
    reply.code(404).send({ error: "Not Found" });
  }
});

const start = async () => {
  try {
    await app.listen({ port: 4000, host: "0.0.0.0" });
    
    updateTagUsage();

    
    setInterval(updateTagUsage, 60 * 60 * 1000);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
