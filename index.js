const fastify = require('fastify')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const sharp = require('sharp')
const { create } = require('domain')
const app = fastify({ logger: false })

// Tag usage tracking for sorting by frequency
let tagUsage = {}

// Function to update tag usage counts
function updateTagUsage() {
    const bots = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'bots.json'), 'utf-8'))
    const counts = {}
    Object.values(bots).forEach(bot => {
        if (bot.tags) {
            bot.tags.forEach(tag => {
                counts[tag] = (counts[tag] || 0) + 1
            })
        }
    })
    tagUsage = counts
}

app.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/'
})

app.register(require('@fastify/multipart'))

app.get("/profile/:profile", async (request, reply) => {
    await reply.sendFile('profiles.html')
})

app.get("/chat/:id", async (request, reply) => {
    await reply.sendFile('chat.html')
})

app.get("/login" , async (request, reply) => {
    await reply.sendFile('login.html')
})

app.get("/maker", async (request, reply) => {
    await reply.sendFile('maker.html')
})

app.get('/api/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() }
})

app.get('/api/profile/:profile', async (request, reply) => {
    const profile = request.params.profile
    const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf-8'))
    let user = null
    let userId = null
    for (const id in users) {
        if (id === profile || users[id].name === profile) {
            user = users[id]
            userId = id
            break
        }
    }
    if (!user) {
        return reply.code(404).send({ error: 'Profile not found' })
    }
    const bots = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'bots.json'), 'utf-8'))
    let userBots = user.bots.map(botId => bots[botId]).filter(Boolean)
    // filter out sys_pmt item from bots, so none of them have the sys_pmt attribute
    /* bots are in this format:
    {
    "name": "Koishi Komeiji",
    "description": "koishi bot imported from jai for testing | og bot by  @MuyoMuyo3",
    "author": "iusedtohavehoopdreams",
    "status": "public",
    "avatar": "/assets/bots/2.png",
    "sys_pmt": "",
    "chats": ""
}
    */
    userBots = userBots.map(bot => ({ id: bot.id, ...Object.entries(bot).filter(([key]) => key !== 'sys_pmt').reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {}) }))
    return { ...user, id: userId, bots: userBots }
})

app.get('/api/tags', async (request, reply) => {
    const bots = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'bots.json'), 'utf-8'))
    const allTags = new Set()
    Object.values(bots).forEach(bot => {
        if (bot.tags) {
            bot.tags.forEach(tag => allTags.add(tag))
        }
    })
    const tagsArray = Array.from(allTags)
    // Sort by usage count descending, then alphabetically for ties
    tagsArray.sort((a, b) => {
        const countA = tagUsage[a] || 0
        const countB = tagUsage[b] || 0
        if (countA !== countB) {
            return countB - countA
        }
        return a.localeCompare(b)
    })
    return { tags: tagsArray }
})

app.get('/api/bots', async (request, reply) => {
    const offset = parseInt(request.query.offset) || 0
    const limit = parseInt(request.query.limit) || 20
    const search = request.query.search || ''
    const tags = request.query.tags ? request.query.tags.split(',').map(t => t.trim()) : []
    const sortParam = request.query.sort
    let field = 'name'
    let direction = 'asc'
    if (sortParam) {
        const sortParts = sortParam.split('_')
        field = sortParts[0] || 'name'
        direction = sortParts[1] || 'asc'
    }

    const userId = request.headers['x-user-id']
    const bots = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'bots.json'), 'utf-8'))
    const users = userId ? JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf-8')) : {}
    let botIds = Object.keys(bots)

    // Apply filters
    botIds = botIds.filter(id => {
        const bot = bots[id]

        // Privacy filter - only show bots the user can access
        if (!canAccessBot(bot, userId, users)) {
            return false
        }

        // Search filter
        if (search && !bot.name.toLowerCase().includes(search.toLowerCase()) && !bot.description.toLowerCase().includes(search.toLowerCase())) {
            return false
        }
        // Tags filter
        if (tags.length > 0) {
            if (!bot.tags || !bot.tags.some(tag => tags.includes(tag))) {
                return false
            }
        }
        return true
    })

    // Apply sorting
    botIds.sort((a, b) => {
        const valA = bots[a][field]
        const valB = bots[b][field]
        if (direction === 'asc') {
            return valA > valB ? 1 : -1
        } else {
            return valA < valB ? 1 : -1
        }
    })

    // Apply pagination
    const paginatedIds = botIds.slice(offset, offset + limit)
    const botList = paginatedIds.map(id => ({ id, ...Object.entries(bots[id]).filter(([key]) => key !== 'sys_pmt').reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {}) }))
    return { bots: botList }
})

app.get('/api/bots/:id', async (request, reply) => {
    const botId = request.params.id
    const userId = request.headers['x-user-id']
    const bots = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'bots.json'), 'utf-8'))
    const users = userId ? JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf-8')) : {}

    if (!bots[botId]) {
        return reply.code(404).send({ error: 'Bot not found' })
    }

    const bot = bots[botId]
    if (!canAccessBot(bot, userId, users)) {
        return reply.code(404).send({ error: 'Bot not found' })
    }

    return { id: botId, ...bot }
})

app.put('/api/bots/:id', async (request, reply) => {
    await auth_middleware(request, reply)

    const botId = request.params.id
    const userId = request.headers['x-user-id']

    const bots = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'bots.json'), 'utf-8'))
    const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf-8'))

    if (!bots[botId]) {
        return reply.code(404).send({ error: 'Bot not found' })
    }

    if (bots[botId].author !== users[userId].name) {
        return reply.code(403).send({ error: 'Unauthorized' })
    }

    const updatedData = { ...request.body }
    delete updatedData.author // Prevent changing ownership
    Object.assign(bots[botId], updatedData)

    fs.writeFileSync(path.join(__dirname, 'data', 'bots.json'), JSON.stringify(bots, null, 2))
    return { status: 'ok' }
})

app.delete('/api/bots/:id', async (request, reply) => {
    await auth_middleware(request, reply)

    const botId = request.params.id
    const userId = request.headers['x-user-id']

    const bots = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'bots.json'), 'utf-8'))
    const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf-8'))

    if (!bots[botId]) {
        return reply.code(404).send({ error: 'Bot not found' })
    }

    if (bots[botId].author !== users[userId].name) {
        return reply.code(403).send({ error: 'Unauthorized' })
    }

    // Delete associated image files before removing the bot
    deleteImageFile(bots[botId].avatar)

    delete bots[botId]
    fs.writeFileSync(path.join(__dirname, 'data', 'bots.json'), JSON.stringify(bots, null, 2))

    users[userId].bots = users[userId].bots.filter(id => id != botId)
    fs.writeFileSync(path.join(__dirname, 'data', 'users.json'), JSON.stringify(users, null, 2))

    return { status: 'ok' }
})

app.post('/api/register', async (request, reply) => {
    const { username, password } = request.body
    if (!username || !password) {
        return reply.code(400).send({ error: 'Username and password are required' })
    }
    const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf-8'))
    
    const existingUser = Object.values(users).find(user => user.name === username)
    if (existingUser) {
        return reply.code(409).send({ error: 'Username already exists' })
    }
    
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = crypto.scryptSync(password, salt, 64).toString('hex')
    
    const key = crypto.randomBytes(64).toString('hex')
    
    const id = Object.keys(users).length.toString()
    users[id] = {
        name: username,
        password: { salt, hash },
        key: key,
        bots: [],
        conversations: [],
        avatar: '/assets/users/default.png', 
        bio: ''
    }
    fs.writeFileSync(path.join(__dirname, 'data', 'users.json'), JSON.stringify(users, null, 2))
    return { status: 'ok', userId: id, key: key }
})

app.post('/api/login', async (request, reply) => {
    const { username, password } = request.body
    if (!username || !password) {
        return reply.code(400).send({ error: 'Username and password are required' })
    }
    const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf-8'))
    
    let userId = null
    let user = null
    for (const id in users) {
        if (users[id].name === username) {
            userId = id
            user = users[id]
            break
        }
    }
    if (!user) {
        return reply.code(401).send({ error: 'Invalid username or password' })
    }
    
    const { salt, hash } = user.password
    const inputHash = crypto.scryptSync(password, salt, 64).toString('hex')
    if (inputHash !== hash) {
        return reply.code(401).send({ error: 'Invalid username or password' })
    }
    return { status: 'ok', userId: userId, key: user.key }
})

async function auth_middleware(request, reply) {
    let key = request.headers['x-auth-key']
    let id = request.headers['x-user-id']

    if (!key || !id) {
        return reply.redirect('/login')
    }

    let users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf-8'))

    if (!users[id] || users[id]['key'] !== key) {
        return reply.redirect('/login')
    }

    return { status: 'ok', timestamp: new Date().toISOString() }
}

function canAccessBot(bot, userId, users) {
    if (bot.status === 'public') {
        return true
    }
    if (!userId || !users[userId]) {
        return false
    }
    return bot.author === users[userId].name
}

async function optimizeAndSaveImage(base64Data, fileName) {
    const buffer = Buffer.from(base64Data, 'base64')
    const filePath = path.join(__dirname, 'public', 'assets', 'bots', fileName)

    // Optimize the image: resize to max 512x512, compress to webp format for better compression
    await sharp(buffer)
        .resize(512, 512, {
            fit: 'inside',
            withoutEnlargement: true
        })
        .webp({ quality: 80 })
        .toFile(filePath.replace('.png', '.webp'))

    // Also save as PNG for compatibility
    await sharp(buffer)
        .resize(512, 512, {
            fit: 'inside',
            withoutEnlargement: true
        })
        .png({ compressionLevel: 9 })
        .toFile(filePath)

    return `/assets/bots/${fileName}`
}

function deleteImageFile(avatarPath) {
    if (avatarPath && avatarPath.startsWith('/assets/bots/')) {
        const filePath = path.join(__dirname, 'public', avatarPath)
        const webpPath = filePath.replace('.png', '.webp')

        // Delete both PNG and WebP versions if they exist
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath)
            }
            if (fs.existsSync(webpPath)) {
                fs.unlinkSync(webpPath)
            }
        } catch (error) {
            console.error('Error deleting image files:', error)
        }
    }
}

app.post("/api/upload-bot", async (request, reply) => {
    await auth_middleware(request, reply)

    const { name, description, author, status, avatar, sys_pmt, greeting, chats, tags } = request.body
    if (!name || !description || !author || !status || !sys_pmt || !greeting) {
        return reply.code(400).send({ error: 'All required fields must be filled' })
    }
    const id = request.headers['x-user-id']

    const bots = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'bots.json'), 'utf-8'))
    const bot_id = Object.keys(bots).length

    // Handle avatar
    let avatarPath = '/assets/general/noresponse.png'
    if (avatar && avatar.startsWith('data:image/')) {
        // Decode base64, optimize and save
        const base64Data = avatar.split(',')[1]
        const fileName = `${bot_id}.png`
        avatarPath = await optimizeAndSaveImage(base64Data, fileName)
    }

    bots[bot_id] = { name, description, author, status, avatar: avatarPath, sys_pmt, greeting, chats, tags: tags || [] }
    fs.writeFileSync(path.join(__dirname, 'data', 'bots.json'), JSON.stringify(bots))

    const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf-8'))
    users[id]['bots'].push(bot_id)
    fs.writeFileSync(path.join(__dirname, 'data', 'users.json'), JSON.stringify(users))

    return { status: 'ok', timestamp: new Date().toISOString() }
})

app.get('/api/chats', async (request, reply) => {
    await auth_middleware(request, reply)

    const userId = request.headers['x-user-id']
    const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf-8'))
    const userConversations = users[userId].conversations

    const conversations = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'conversations.json'), 'utf-8'))
    const chats = {}
    userConversations.forEach(id => {
        if (conversations[id]) {
            chats[id] = conversations[id]
        }
    })

    return { chats }
})

app.post('/api/chats', async (request, reply) => {
    await auth_middleware(request, reply)

    const { id, with: withUser, messages } = request.body
    if (!id || !withUser || !messages) {
        return reply.code(400).send({ error: 'id, with, and messages are required' })
    }
    const userId = request.headers['x-user-id']

    const conversations = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'conversations.json'), 'utf-8'))
    conversations[id] = { id, with: withUser, messages, createdAt: new Date().toISOString() }
    fs.writeFileSync(path.join(__dirname, 'data', 'conversations.json'), JSON.stringify(conversations, null, 2))

    const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf-8'))
    if (!users[userId].conversations.includes(id)) {
        users[userId].conversations.push(id)
        fs.writeFileSync(path.join(__dirname, 'data', 'users.json'), JSON.stringify(users, null, 2))
    }

    return { status: 'ok', conversationId: id }
})

app.delete('/api/chats/:id', async (request, reply) => {
    await auth_middleware(request, reply)

    const conversationId = request.params.id
    const userId = request.headers['x-user-id']

    const conversations = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'conversations.json'), 'utf-8'))
    if (!conversations[conversationId]) {
        return reply.code(404).send({ error: 'Conversation not found' })
    }

    delete conversations[conversationId]
    fs.writeFileSync(path.join(__dirname, 'data', 'conversations.json'), JSON.stringify(conversations, null, 2))

    const users = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'users.json'), 'utf-8'))
    users[userId].conversations = users[userId].conversations.filter(id => id !== conversationId)
    fs.writeFileSync(path.join(__dirname, 'data', 'users.json'), JSON.stringify(users, null, 2))

    return { status: 'ok' }
})

app.setNotFoundHandler(async (request, reply) => {
  const filePath = path.join(__dirname, 'public', request.url)
  try {
    await reply.sendFile(request.url, path.join(__dirname, 'public'))
  } catch (err) {
    reply.code(404).send({ error: 'Not Found' })
  }
})

const start = async () => {
  try {
    await app.listen({ port: 4000, host: '0.0.0.0' })
    app.log.info(`Server is running on http://localhost:400`)

    // Initialize tag usage on startup
    updateTagUsage()

    // Update tag usage every hour
    setInterval(updateTagUsage, 60 * 60 * 1000)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()