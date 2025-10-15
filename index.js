const fastify = require("fastify");
const atomicWriteFileSync = require("./atomicWriteFileSync");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const sharp = require("sharp");
const tf = require('@tensorflow/tfjs');
const fetch = require('node-fetch');
const { createCanvas, loadImage } = require('canvas');
const sanitizeHtml = require("sanitize-html");
const app = fastify({ logger: false });
const helmet = require('@fastify/helmet')

app.register(helmet, {
  contentSecurityPolicy: {
    useDefaults: false,  // Override defaults to avoid 'script-src-attr 'none''
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",  // For inline <script> tags
        "'unsafe-eval'",    // For eval() in libs (e.g., if TF.js or bundlers use it)
        "blob:",            // Crucial: Allows blob: URLs for dynamic scripts
        "data:",            // If data: scripts are used
        "'wasm-unsafe-eval'" // Matches the browser fallback you saw
      ],
      scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"],  // Allows inline event handlers (onclick=...) and hashes for them
      scriptSrcElem: ["'self'", "blob:", "'unsafe-inline'"],  // Specifically for <script> elements
      styleSrc: ["'self'", "'unsafe-inline'", "data:"],       // If inline styles are an issue
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "*"],  // Broaden for fetches/XHR if needed
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
      // Add if workers are used: workerSrc: ["'self'", "blob:"],
    },
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});

app.register(require('@fastify/rate-limit'), {
  max: 100,
  timeWindow: '1 minute'
})

let nsfwModel = null;
const NSFW_CLASSES = ['NSFW', 'REGULAR'];

async function loadNSFWModel() {
  if (nsfwModel) return nsfwModel;

  try {
    console.log('Loading NSFW detection model...');

    const modelDir = path.join(__dirname, 'glitch-network-nsfw-detector');
    const modelJsonPath = path.join(modelDir, 'model.json');


    const customHandler = {
      load: async () => {

        const modelData = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));


        const weightsManifest = modelData.weightsManifest;
        const weightSpecs = [];
        const weightData = [];

        for (const group of weightsManifest) {
          weightSpecs.push(...group.weights);
          for (const weightPath of group.paths) {
            const fullPath = path.join(modelDir, weightPath);
            const buffer = fs.readFileSync(fullPath);
            weightData.push(buffer);
          }
        }


        const totalSize = weightData.reduce((sum, buf) => sum + buf.length, 0);
        const concatenated = new Uint8Array(totalSize);
        let offset = 0;
        for (const buf of weightData) {
          concatenated.set(new Uint8Array(buf), offset);
          offset += buf.length;
        }

        return {
          modelTopology: modelData.modelTopology,
          weightSpecs: weightSpecs,
          weightData: concatenated.buffer
        };
      }
    };


    nsfwModel = await tf.loadLayersModel(customHandler);

    console.log('NSFW model loaded successfully');
    return nsfwModel;
  } catch (error) {
    console.error('Failed to load NSFW model:', error);
    throw error;
  }
}


loadNSFWModel().catch(err => console.error('Error loading NSFW model on startup:', err));


const authAttempts = new Map();

function recordFailedAttempt(ip) {
  const now = Date.now();
  const attempts = authAttempts.get(ip) || [];

  // Remove attempts older than 15 minutes
  const recentAttempts = attempts.filter(time => now - time < 15 * 60 * 1000);
  recentAttempts.push(now);
  authAttempts.set(ip, recentAttempts);
}

function recordSuccessfulAuth(ip) {
  // Clear failed attempts on successful auth
  authAttempts.delete(ip);
}

const STATS_FILE = path.join(__dirname, "data", "stats.json");

function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      return JSON.parse(fs.readFileSync(STATS_FILE, "utf-8"));
    }
  } catch (error) {
    console.error("Error loading stats:", error);
  }
  return {
    dailyActiveUsers: {},
    totalRequests: 0,
    lastUpdated: new Date().toISOString()
  };
}

function saveStats(stats) {
  try {
    stats.lastUpdated = new Date().toISOString();
    atomicWriteFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error("Error saving stats:", error);
  }
}

function trackDailyUser(userId) {
  if (!userId) return;

  const stats = loadStats();
  const today = new Date().toISOString().split('T')[0];

  if (!stats.dailyActiveUsers[today]) {
    stats.dailyActiveUsers[today] = [];
  }

  if (!stats.dailyActiveUsers[today].includes(userId)) {
    stats.dailyActiveUsers[today].push(userId);
  }


  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];

  Object.keys(stats.dailyActiveUsers).forEach(date => {
    if (date < cutoffDate) {
      delete stats.dailyActiveUsers[date];
    }
  });

  saveStats(stats);
}


app.addHook('onRequest', async (request, reply) => {
  const userId = request.headers['x-user-id'];
  if (userId) {
    trackDailyUser(userId);
  }
});



function validateAndSanitizeInput(input, type, maxLength = 10000) {
  if (typeof input !== "string") {
    throw new Error("Input must be a string");
  }

  // remove HTML
  input = sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {}
  }
  )

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

app.post('/api/check-nsfw', async (request, reply) => {
  try {
    const data = await request.file();

    if (!data) {
      return reply.code(400).send({ error: 'No image file provided' });
    }


    const buffer = await data.toBuffer();


    const img = await loadImage(buffer);


    const canvas = createCanvas(224, 224);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 224, 224);


    const model = await loadNSFWModel();

    // Get image data from canvas
    const imageData = ctx.getImageData(0, 0, 224, 224);

    // Manually convert ImageData to tensor (browser.fromPixels doesn't work in Node.js)
    const imageTensor = tf.tidy(() => {
      // Create tensor from raw pixel data [224, 224, 4] (RGBA)
      const tensor = tf.tensor3d(imageData.data, [224, 224, 4]);

      // Remove alpha channel to get [224, 224, 3] (RGB)
      const rgb = tensor.slice([0, 0, 0], [224, 224, 3]);

      // Normalize to [0, 1] and add batch dimension
      return rgb.toFloat().div(255.0).expandDims(0);
    });


    const logits = model.predict(imageTensor);
    const probabilities = await logits.data();


    imageTensor.dispose();
    logits.dispose();


    const predictions = NSFW_CLASSES.map((className, index) => ({
      className,
      probability: probabilities[index]
    })).sort((a, b) => b.probability - a.probability);

    console.log('NSFW Predictions:', predictions);

    // Threshold for NSFW detection (50% confidence)
    const NSFW_THRESHOLD = 0.5;

    const nsfwPrediction = predictions.find(p => p.className === 'NSFW');
    const isNSFW = nsfwPrediction && nsfwPrediction.probability > NSFW_THRESHOLD;

    if (isNSFW) {
      return reply.send({
        safe: false,
        reason: 'NSFW content detected',
        predictions: predictions
      });
    }

    return reply.send({
      safe: true,
      reason: 'Image appears safe',
      predictions: predictions
    });

  } catch (error) {
    console.error('Error checking NSFW:', error);
    console.error('Error checking NSFW:', error);
    return reply.code(500).send({
      error: 'Failed to check image.'
    });
  }
});


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


  if (style === 'formal') {
    systemPrompt += ` Use a professional and formal tone.`;
  } else if (style === 'casual') {
    systemPrompt += ` Use a friendly and casual tone.`;
  } else if (style === 'humorous') {
    systemPrompt += ` Add some humor and wit to make it entertaining.`;
  }


  if (botPersonality && botPersonality.trim()) {
    systemPrompt += ` Consider this personality/context: ${botPersonality}`;
  }

  try {
    const aiProvider = user.aiProvider;
    const apiKey = user.apiKey;
    const model = user.aiModel;

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
    console.error('Error creating message:', error);
    return reply.code(500).send({
      error: 'Failed to create message.'
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
  let userBots = user.bots.map((botId) => ({ id: botId, ...bots[botId] })).filter(bot => bot.name);


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


    const canSeeSysPmt = isOwnProfile || (requestingUserId && users[requestingUserId] && bot.author === users[requestingUserId].name);

    if (canSeeSysPmt) {

      return {
        id: bot.id,
        ...bot,
      };
    } else {

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

app.get("/api/stats", async (request, reply) => {
  try {
    const bots = JSON.parse(
      fs.readFileSync(path.join(__dirname, "data", "bots.json"), "utf-8")
    );
    const users = JSON.parse(
      fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
    );
    const stats = loadStats();


    const totalUsers = Object.keys(users).length;
    const totalBots = Object.keys(bots).length;

    const publicBots = Object.values(bots).filter(bot => bot.status === 'public').length;
    const privateBots = Object.values(bots).filter(bot => bot.status === 'private').length;


    const today = new Date().toISOString().split('T')[0];
    const dailyActiveUsers = stats.dailyActiveUsers[today] ? stats.dailyActiveUsers[today].length : 0;


    const last7Days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      if (stats.dailyActiveUsers[dateStr]) {
        last7Days.push(stats.dailyActiveUsers[dateStr].length);
      }
    }
    const averageDailyUsers = last7Days.length > 0
      ? Math.round(last7Days.reduce((a, b) => a + b, 0) / last7Days.length)
      : 0;


    const dailyUserData = {};
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyUserData[dateStr] = stats.dailyActiveUsers[dateStr] ? stats.dailyActiveUsers[dateStr].length : 0;
    }

    return {
      totalUsers,
      totalBots,
      publicBots,
      privateBots,
      dailyActiveUsers,
      averageDailyUsers,
      dailyUserData,
      lastUpdated: stats.lastUpdated
    };
  } catch (error) {
    console.error("Error fetching stats:", error);
  console.error("Error fetching stats:", error);
  return reply.code(500).send({ error: "Failed to fetch stats" });
  }
});

app.get("/api/tags", async (request, reply) => {
  const userId = request.headers["x-user-id"] || null;
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

  const userId = request.headers["x-user-id"] || null;
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

app.get("/api/bots/id/:encodedId", async (request, reply) => {
  const encodedId = request.params.encodedId;

  try {
    const botId = Buffer.from(encodedId, 'base64').toString('utf-8');
    const bots = JSON.parse(
      fs.readFileSync(path.join(__dirname, "data", "bots.json"), "utf-8")
    );

    if (!bots[botId]) {
      return reply.code(404).send({ error: "Bot not found" });
    }

    return { id: botId, encodedId: encodedId };
  } catch (error) {
    return reply.code(400).send({ error: "Invalid bot ID" });
  }
});

app.get("/api/bots/:id", async (request, reply) => {
  const botId = request.params.id;
  const userId = request.headers["x-user-id"] || null;
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


  if (updatedData.avatar && updatedData.avatar.startsWith("data:image/")) {
    try {

      if (bots[botId].avatar && bots[botId].avatar.startsWith("/assets/bots/") && bots[botId].avatar !== "/assets/bots/noresponse.png") {
        deleteImageFile(bots[botId].avatar);
      }

      const base64Data = updatedData.avatar.split(",")[1];
      const fileName = `${botId}.webp`;
      updatedData.avatar = await optimizeAndSaveImage(base64Data, fileName);
    } catch (error) {
      console.error("Error saving avatar:", error);
    console.error("Error saving avatar:", error);
    return reply.code(400).send({ error: "Failed to save avatar." });
    }
  }

  Object.assign(bots[botId], updatedData);

  atomicWriteFileSync(
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
  atomicWriteFileSync(
    path.join(__dirname, "data", "bots.json"),
    JSON.stringify(bots, null, 2)
  );

  users[userId].bots = users[userId].bots.filter((id) => id !== botId);
  atomicWriteFileSync(
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
  atomicWriteFileSync(
    path.join(__dirname, "data", "bots.json"),
    JSON.stringify(bots, null, 2)
  );

  return { status: "ok", views: bots[botId].views };
});

app.post("/api/register",
  {
    config: {
      rateLimit: {
        max: 1,
        timeWindow: '24 hours'
      }
    }
  },
  async (request, reply) => {


    const { username, password } = request.body;
    if (!username || !password) {
      return reply
        .code(400)
        .send({ error: "Username and password are required" });
    }

    let sanitizedUsername;
    try {
      sanitizedUsername = validateAndSanitizeInput(username, "username");

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
    atomicWriteFileSync(
      path.join(__dirname, "data", "users.json"),
      JSON.stringify(users, null, 2)
    );


    recordSuccessfulAuth(request.ip);
    return { status: "ok", userId: id, key: key };
  });

app.post("/api/login", {
  config: {
    rateLimit: {
      max: 3,
      timeWindow: '1 minute'
    }
  }
}, async (request, reply) => {


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


  atomicWriteFileSync(
    path.join(__dirname, "data", "users.json"),
    JSON.stringify(users, null, 2)
  );


  recordSuccessfulAuth(request.ip);
  return { status: "ok", userId: userId, key: user.key };
});

async function auth_middleware(request, reply) {
  const key = request.headers["x-auth-key"];
  const id = request.headers["x-user-id"];

  if (!key || !id) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  try {
    const users = JSON.parse(
      fs.readFileSync(path.join(__dirname, "data", "users.json"), "utf-8")
    );

    if (!users[id] || users[id]["key"] !== key) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  } catch (err) {
    request.log.error("Error in auth middleware:", err);
    return reply.code(500).send({ error: "Internal server error" });
  }
}

function canAccessBot(bot, userId, users) {
  if (bot.status === "public") {
    return true;
  }
  if (!userId || !users[userId]) {
    return false;
  }
  const canAccess = bot.author === users[userId].name;


  if (bot.status === "private" && canAccess) {
    console.log(`[DEBUG] Showing private bot "${bot.name}" to owner ${users[userId].name}`);
  }

  return canAccess;
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
    .webp({ quality: 85 })
    .toFile(filePath);

  return `/assets/users/${fileName}`;
}

function deleteUserImageFile(avatarPath) {
  if (
    avatarPath &&
    avatarPath.startsWith("/assets/users/") &&
    avatarPath !== "/assets/users/default.png" &&
    !avatarPath.endsWith("/default.png")
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


  let avatarPath = "/assets/bots/noresponse.png";
  if (avatar && avatar.startsWith("data:image/")) {
    try {
      const base64Data = avatar.split(",")[1];
      const fileName = `${bot_id}.webp`;
      avatarPath = await optimizeAndSaveImage(base64Data, fileName);
    } catch (error) {
      console.error("Error saving avatar:", error);
  console.error("Error saving avatar:", error);
  return reply.code(400).send({ error: "Failed to save avatar." });
    }
  }

  bots[bot_id] = {
    name: sanitizedName,
    description: sanitizedDescription,
    author: user.name,
    status,
    avatar: avatarPath,
    sys_pmt: sanitizedSysPmt,
    greeting: sanitizedGreeting,
    chats: sanitizedChats,
    tags: sanitizedTags,
    lorebook: sanitizedLorebook,
    views: 0,
  };
  atomicWriteFileSync(
    path.join(__dirname, "data", "bots.json"),
    JSON.stringify(bots, null, 2)
  );

  users[id]["bots"].push(bot_id);
  atomicWriteFileSync(
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

        chats[id] = conversations[id];
      } else {

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


  if (id && conversations[id]) {

    if (!users[userId].conversations.includes(id)) {
      return reply.code(403).send({ error: "Access denied" });
    }
    isUpdate = true;
  } else {

    id = crypto.randomBytes(16).toString("hex");
  }

  conversations[id] = {
    id,
    with: withUser,
    messages,
    createdAt: conversations[id]?.createdAt || new Date().toISOString(),
    lastModified: new Date().toISOString(),
  };

  atomicWriteFileSync(
    path.join(__dirname, "data", "conversations.json"),
    JSON.stringify(conversations, null, 2)
  );


  if (!isUpdate && !users[userId].conversations.includes(id)) {
    users[userId].conversations.push(id);
    atomicWriteFileSync(
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
  atomicWriteFileSync(
    path.join(__dirname, "data", "conversations.json"),
    JSON.stringify(conversations, null, 2)
  );

  users[userId].conversations = users[userId].conversations.filter(
    (id) => id !== conversationId
  );
  atomicWriteFileSync(
    path.join(__dirname, "data", "users.json"),
    JSON.stringify(users, null, 2)
  );

  return { status: "ok" };
});

app.post("/api/log-bot-use", {
  config: {
    rateLimit: {
      max: 1,
      timeWindow: '15 minute'
    }
  }
}, async (request, reply) => {
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
  atomicWriteFileSync(
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
      const fileName = `${userId}.webp`;
      const avatarPath = await optimizeAndSaveUserImage(base64Data, fileName);
      users[userId].avatar = avatarPath;
    }


    atomicWriteFileSync(
      path.join(__dirname, "data", "users.json"),
      JSON.stringify(users, null, 2)
    );

    return { status: "ok", message: "Profile updated successfully" };
  } catch (error) {
    console.error("Error updating profile:", error);
  console.error("Error updating profile:", error);
  return reply.code(500).send({ error: "Internal server error" });
  }
});

app.delete("/api/delete-account",
  {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 minute'
      }
    }
  }, async (request, reply) => {
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


      atomicWriteFileSync(
        path.join(__dirname, "data", "users.json"),
        JSON.stringify(users, null, 2)
      );
      atomicWriteFileSync(
        path.join(__dirname, "data", "bots.json"),
        JSON.stringify(bots, null, 2)
      );
      atomicWriteFileSync(
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

app.listen({ port: 4000, host: "0.0.0.0" });

updateTagUsage();

setInterval(
      function () {

        // duplicate /data/


        fs.mkdirSync(path.join(__dirname, "duplicate"), { recursive: true });
        fs.copyFileSync(path.join(__dirname, "data", "users.json"), path.join(__dirname, "duplicate", "users.json"));
        fs.copyFileSync(path.join(__dirname, "data", "bots.json"), path.join(__dirname, "duplicate", "bots.json"));
        fs.copyFileSync(path.join(__dirname, "data", "conversations.json"), path.join(__dirname, "duplicate", "conversations.json"));
        fs.copyFileSync(path.join(__dirname, "data", "stats.json"), path.join(__dirname, "duplicate", "stats.json"));

        // update tag usage

        updateTagUsage()
}, 60 * 60 * 1000);
