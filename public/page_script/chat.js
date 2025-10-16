(function checkAuth() {
  const userId = localStorage.getItem("userId");
  const authKey = localStorage.getItem("authKey");

  if (!userId || !authKey) {
    window.location.href = "/login";
    return;
  }
})();

let currentBot = null;
let currentConversation = null;
let messages = [];
let currentUser = null;
let isGenerating = false;
let generationAbortController = null;

function showToast(message, type = "info", duration = 4000) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 10);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => container.removeChild(toast), 300);
  }, duration);

  return toast;
}

function showDialog(
  title,
  message,
  buttons = [],
  hasInput = false,
  inputPlaceholder = ""
) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("dialog-overlay");
    const dialog = document.getElementById("dialog");
    const titleEl = document.getElementById("dialog-title");
    const messageEl = document.getElementById("dialog-message");
    const inputEl = document.getElementById("dialog-input");
    const buttonsEl = document.getElementById("dialog-buttons");

    titleEl.textContent = title;
    messageEl.textContent = message;

    if (hasInput) {
      inputEl.style.display = "block";
      inputEl.value = "";
      inputEl.placeholder = inputPlaceholder;
    } else {
      inputEl.style.display = "none";
    }

    buttonsEl.innerHTML = "";
    buttons.forEach((button) => {
      const btn = document.createElement("button");
      btn.className = `dialog-button ${button.class || "secondary"}`;
      btn.textContent = button.text;
      btn.onclick = () => {
        hideDialog();
        resolve({
          action: button.action,
          input: hasInput ? inputEl.value : null,
        });
      };
      buttonsEl.appendChild(btn);
    });

    overlay.classList.add("show");
    if (hasInput) {
      setTimeout(() => inputEl.focus(), 100);
    }

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        hideDialog();
        resolve({ action: "cancel", input: null });
      }
    };
  });
}

function hideDialog() {
  const overlay = document.getElementById("dialog-overlay");
  overlay.classList.remove("show");
  overlay.onclick = null;
}

let userHasScrolled = false;
let scrollTimeout = null;
let lastScrollPosition = 0;
let isAutoScrolling = false;

function isUserNearBottom(threshold = 100) {
  const messagesDiv = document.getElementById("messages");
  return (
    messagesDiv.scrollTop + messagesDiv.clientHeight >=
    messagesDiv.scrollHeight - threshold
  );
}

function smoothScrollToBottom(force = false) {
  const messagesDiv = document.getElementById("messages");
  if (force || isUserNearBottom() || !userHasScrolled) {
    isAutoScrolling = true;
    messagesDiv.scrollTo({
      top: messagesDiv.scrollHeight,
      behavior: "smooth",
    });

    setTimeout(() => {
      isAutoScrolling = false;
    }, 300);
  }
}

function instantScrollToBottom() {
  const messagesDiv = document.getElementById("messages");
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function setupScrollTracking() {
  const messagesDiv = document.getElementById("messages");

  // Enhanced mobile scroll handling
  let touchStartY = 0;
  let touchEndY = 0;
  let isTouching = false;

  messagesDiv.addEventListener(
    "touchstart",
    (e) => {
      touchStartY = e.touches[0].clientY;
      isTouching = true;
    },
    { passive: true }
  );

  messagesDiv.addEventListener(
    "touchmove",
    (e) => {
      if (!isTouching) return;
      touchEndY = e.touches[0].clientY;

      // Improve scroll momentum on mobile
      if (Math.abs(touchEndY - touchStartY) > 10) {
        userHasScrolled = true;
      }
    },
    { passive: true }
  );

  messagesDiv.addEventListener(
    "touchend",
    () => {
      isTouching = false;
      // Reset scroll tracking after touch ends with delay
      if (isUserNearBottom(50)) {
        setTimeout(() => {
          userHasScrolled = false;
        }, 1500);
      }
    },
    { passive: true }
  );

  messagesDiv.addEventListener(
    "scroll",
    () => {
      if (isAutoScrolling) return;

      const currentPosition = messagesDiv.scrollTop;

      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }

      if (Math.abs(currentPosition - lastScrollPosition) > 5) {
        userHasScrolled = true;
      }

      if (isUserNearBottom(50)) {
        scrollTimeout = setTimeout(
          () => {
            userHasScrolled = false;
          },
          isTouching ? 1500 : 1000
        );
      }

      lastScrollPosition = currentPosition;
    },
    { passive: true }
  );

  const chatInput = document.getElementById("chat-input");

  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      userHasScrolled = false;
      sendMessage();
    }
  });

  // Add mobile-specific input handling
  chatInput.addEventListener("input", () => {
    // Auto-resize on mobile for better UX
    if (window.innerWidth <= 768) {
      chatInput.style.height = "auto";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
    }
  });

  // Handle virtual keyboard on mobile
  if ("visualViewport" in window) {
    window.visualViewport.addEventListener("resize", () => {
      const chatControls = document.getElementById("chat-controls");
      if (window.visualViewport.height < window.innerHeight * 0.7) {
        chatControls.style.bottom = "10px";
      } else {
        chatControls.style.bottom = "20px";
      }
    });
  }

  const extensionBtn = document.getElementById("extension");
  extensionBtn.addEventListener("click", () => {
    if (isGenerating) {
      cancelGeneration();
    } else {
      userHasScrolled = false;
      sendMessage();
    }
  });

  // Add touch feedback for mobile
  extensionBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    extensionBtn.style.transform = "scale(0.95)";
  });

  extensionBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    extensionBtn.style.transform = "scale(1)";
    if (isGenerating) {
      cancelGeneration();
    } else {
      userHasScrolled = false;
      sendMessage();
    }
  });
}

async function loadData() {
  const urlParams = new URLSearchParams(window.location.search);
  const botId = window.location.pathname.split("/").pop();

  try {
    currentBot = await api.getBot(botId);

    try {
      const response = await fetch(`/api/profile/${api.userId}`, {
        headers: {
          "x-auth-key": api.key,
          "x-user-id": api.userId,
        },
      });
      if (response.ok) {
        currentUser = await response.json();
      }
    } catch (error) {
      console.warn("Could not load user profile:", error);
      currentUser = null;
    }

    document.querySelector(".banner img").src = currentBot.avatar;
    document.querySelector(".banner h4").textContent = currentBot.name;

    const chatsResponse = await api.getChats();
    const chats = chatsResponse.chats || {};

    const botChats = Object.values(chats).filter((chat) => chat.with === botId);
    if (botChats.length > 0) {
      botChats.sort(
        (a, b) =>
          new Date(b.lastModified || b.createdAt) -
          new Date(a.lastModified || a.createdAt)
      );
      const latestChatMeta = botChats[0];

      // Load the full chat with messages
      if (typeof api.getChat === "function") {
        const fullChatResponse = await api.getChat(latestChatMeta.id);
        currentConversation = fullChatResponse.chat;
        messages = currentConversation.messages || [];
      } else {
        // Fallback for cached api.js - reload all chats (temporary)
        console.warn(
          "api.getChat not available, falling back to full chat loading"
        );
        const fullChatsResponse = await fetch("/api/chats?full=true", {
          headers: {
            "x-user-id": api.userId,
            "x-auth-key": api.key,
          },
        });
        const fullChats = await fullChatsResponse.json();
        currentConversation = fullChats.chats[latestChatMeta.id];
        messages = currentConversation.messages || [];
      }
    } else {
      currentConversation = {
        id: `${api.userId}_${botId}_${Date.now()}`,
        with: botId,
        messages: [
          { role: "user", content: ".", timestamp: new Date().toISOString() },
          {
            role: "assistant",
            content: currentBot.greeting,
            timestamp: new Date().toISOString(),
          },
        ],
      };
      messages = currentConversation.messages;
      await api.saveChat(currentConversation.id, botId, messages);
    }

    renderMessages();
  } catch (error) {
    console.error("Error loading data:", error);
    setTimeout(() => {
      showToast("Error loading data. Please report this issue.", "error");
    }, 1000);
  }

  // Log bot usage
  if (api.userId && botId) {
    fetch("/api/log-bot-use", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-auth-key": localStorage.getItem("authKey"),
        "x-user-id": api.userId,
      },
      body: JSON.stringify({ botId }),
    }).catch(console.error);
  }

  // Increment bot view count
  if (botId) {
    fetch(`/api/bots/${botId}/view`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }).catch(console.error);
  }
}

function renderMessages() {
  const messagesDiv = document.getElementById("messages");
  messagesDiv.innerHTML = "";
  messages.forEach((msg, index) => {
    if (msg.role === "user" && msg.content === "." && index === 0) return;
    const msgDiv = document.createElement("div");
    msgDiv.className = msg.role === "user" ? "message-user" : "message-bot";

    const actions =
      msg.role === "assistant"
        ? `<button class="message-action-btn" onclick="editMessage(${index})">Edit</button>
                       <button class="message-action-btn" onclick="regenerateMessage(${index})">Regenerate</button>`
        : `<button class="message-action-btn" onclick="editMessage(${index})">Edit</button>`;

    const userAvatar = currentUser?.avatar || "/assets/users/default.png";
    const userName = currentUser?.name || "You";

    msgDiv.innerHTML = `
                    <img src="${
                      msg.role === "user" ? userAvatar : currentBot.avatar
                    }" class="pfp">
                    <div class="message-text">
                        <div class="message-name">${
                          msg.role === "user" ? userName : currentBot.name
                        }</div>
                        <div class="message-bubble" data-index="${index}">
                            ${formatText(msg.content)}
                        </div>
                        <div class="message-actions">
                            ${actions}
                        </div>
                    </div>
                `;
    messagesDiv.appendChild(msgDiv);
  });
  smoothScrollToBottom();
}

function updateButtonToCancel() {
  const extensionIcon = document.getElementById("extension-icon");
  const extension = document.getElementById("extension");
  extensionIcon.textContent = "stop";
  extension.style.backgroundColor = "#d69696";
  extension.style.color = "#fff";
  isGenerating = true;
}

function updateButtonToSend() {
  const extensionIcon = document.getElementById("extension-icon");
  const extension = document.getElementById("extension");
  const input = document.getElementById("chat-input");

  extensionIcon.textContent = "send";
  extension.style.backgroundColor = "";
  extension.style.color = "";
  extension.style.pointerEvents = "";
  extension.style.opacity = "";
  input.disabled = false;
  isGenerating = false;
}

function cancelGeneration() {
  if (generationAbortController) {
    generationAbortController.abort();
    generationAbortController = null;
  }

  // Instead of removing the output, just stop the loading dots and leave the output as-is
  const streamingBubble = document.getElementById("streaming-bubble");
  if (streamingBubble) {
    // Remove loading dots if present, but keep the text
    const loadingDots = streamingBubble.querySelector(".loading-dots");
    if (loadingDots) {
      loadingDots.remove();
    }
    // Remove the id so it doesn't get targeted again
    streamingBubble.removeAttribute("id");
  }

  updateButtonToSend();
  showToast("Generation cancelled", "info");
}

async function sendMessage() {
  const input = document.getElementById("chat-input");
  const extension = document.getElementById("extension");
  const text = input.value.trim();
  if (!text) return;

  messages.push({
    role: "user",
    content: text,
    timestamp: new Date().toISOString(),
  });
  input.value = "";
  input.disabled = true;

  // Update button to cancel mode
  updateButtonToCancel();

  renderMessages();

  // Create abort controller for this generation
  generationAbortController = new AbortController();

  const msgDiv = document.createElement("div");
  msgDiv.className = "message-bot";
  msgDiv.innerHTML = `
                <img src="${currentBot.avatar}" class="pfp">
                <div class="message-text">
                    <div class="message-name">${currentBot.name}</div>
                    <div class="message-bubble" id="streaming-bubble">
                        <div class="loading-dots">
                            <div class="loading-dot"></div>
                            <div class="loading-dot"></div>
                            <div class="loading-dot"></div>
                        </div>
                    </div>
                </div>
            `;
  document.getElementById("messages").appendChild(msgDiv);
  const bubble = document.getElementById("streaming-bubble");

  let aiContent = "";
  let displayedContent = "";
  let isFirstChunk = true;
  let typingTimer = null;
  let streamEnded = false;

  const startTyping = () => {
    if (typingTimer) return;

    const typeChar = () => {
      if (displayedContent.length < aiContent.length) {
        displayedContent += aiContent[displayedContent.length];
        bubble.innerHTML = formatText(displayedContent);

        smoothScrollToBottom();

        const delay = streamEnded ? 1 : Math.random() * 3 + 1;
        typingTimer = setTimeout(typeChar, delay);
      } else {
        typingTimer = null;
      }
    };

    typeChar();
  };

  try {

    await api.callAIStream(
      messages,
      currentBot.sys_pmt,
      (chunk) => {
        if (isFirstChunk) {
          bubble.innerHTML = "";
          isFirstChunk = false;
        }

        aiContent += chunk;
        if (!typingTimer) {
          startTyping();
        }
      },
      currentBot,
      generationAbortController.signal
    );

    streamEnded = true;

    const waitForTyping = () => {
      if (displayedContent.length < aiContent.length && typingTimer) {
        setTimeout(waitForTyping, 100);
      } else {
        if (typingTimer) {
          clearTimeout(typingTimer);
          typingTimer = null;
        }
        if (displayedContent.length < aiContent.length) {
          displayedContent = aiContent;
          bubble.innerHTML = formatText(displayedContent);
        }
      }
    };
    waitForTyping();

    bubble.removeAttribute("id");

    messages.push({
      role: "assistant",
      content: aiContent,
      timestamp: new Date().toISOString(),
    });

    await api.saveChat(currentConversation.id, currentBot.id, messages);
  } catch (error) {
    console.error("Error sending message:", error);

    // Check if it was cancelled
    if (error.name === "AbortError") {
      console.log("Generation was cancelled by user");
      return; // Don't show error toast for user cancellations
    }

    showToast("Error sending message.", "error");
    msgDiv.remove();
  } finally {
    // Reset button to send mode
    updateButtonToSend();
    generationAbortController = null;
  }
}

const hamburgerMenu = document.getElementById("hamburger-menu");
const dropdownMenu = document.getElementById("dropdown-menu");

hamburgerMenu.addEventListener("click", (e) => {
  e.stopPropagation();
  hamburgerMenu.classList.toggle("active");
  dropdownMenu.classList.toggle("active");
});

dropdownMenu.addEventListener("click", (e) => {
  e.stopPropagation();
});

document.addEventListener("click", (e) => {
  if (!hamburgerMenu.contains(e.target)) {
    hamburgerMenu.classList.remove("active");
    dropdownMenu.classList.remove("active");
  }
});

let allBotChats = [];

async function loadChatHistory() {
  try {
    const chatsResponse = await api.getChats();
    const chats = chatsResponse.chats || {};

    const botId = window.location.pathname.split("/").pop();
    allBotChats = Object.values(chats).filter((chat) => chat.with === botId);
    allBotChats.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    renderChatList();
  } catch (error) {
    console.error("Error loading chat history:", error);
  }
}

function renderChatList() {
  const chatList = document.getElementById("chat-list");
  chatList.innerHTML = "";

  if (allBotChats.length === 0) {
    chatList.innerHTML =
      '<div style="text-align: center; color: rgba(204, 218, 206, 0.5); font-size: 12px; padding: 20px;">No chat history</div>';
    return;
  }

  allBotChats.forEach((chat, index) => {
    const isCurrentChat =
      currentConversation && chat.id === currentConversation.id;
    const messageCount = chat.messageCount || 0;
    const preview =
      messageCount > 0 ? `${messageCount} messages` : "No messages";
    const chatDate = new Date(
      chat.lastModified || chat.createdAt
    ).toLocaleDateString();

    const chatItem = document.createElement("div");
    chatItem.className = `chat-item ${isCurrentChat ? "current" : ""}`;
    chatItem.innerHTML = `
                    <div class="chat-info" onclick="switchToChat('${chat.id}')">
                        <div class="chat-name">Chat ${
                          index + 1
                        } - ${chatDate}</div>
                        <div class="chat-preview">${preview}</div>
                    </div>
                    <div class="chat-actions">
                        <button class="chat-action" onclick="deleteChat('${
                          chat.id
                        }')" title="Delete">X</button>
                    </div>
                `;
    chatList.appendChild(chatItem);
  });
}

async function createNewChat() {
  const botId = window.location.pathname.split("/").pop();
  const newChatId = `${api.userId}_${botId}_${Date.now()}`;

  try {
    currentBot = await api.getBot(botId);

    const newConversation = {
      id: newChatId,
      with: botId,
      messages: [
        { role: "user", content: ".", timestamp: new Date().toISOString() },
        {
          role: "assistant",
          content: currentBot.greeting,
          timestamp: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
    };

    await api.saveChat(newConversation.id, botId, newConversation.messages);

    currentConversation = newConversation;
    messages = newConversation.messages;

    renderMessages();
    loadChatHistory();

    hamburgerMenu.classList.remove("active");
    dropdownMenu.classList.remove("active");

    showToast("New chat created!", "success");
  } catch (error) {
    console.error("Error creating new chat:", error);
    showToast("Error creating new chat.", "error");
  }
}

async function switchToChat(chatId) {
  try {
    // Load the full chat with messages
    if (typeof api.getChat === "function") {
      const fullChatResponse = await api.getChat(chatId);
      currentConversation = fullChatResponse.chat;
      messages = currentConversation.messages || [];
    } else {
      // Fallback for cached api.js - reload all chats (temporary)
      console.warn(
        "api.getChat not available in switchToChat, falling back to full chat loading"
      );
      const fullChatsResponse = await fetch("/api/chats?full=true", {
        headers: {
          "x-user-id": api.userId,
          "x-auth-key": api.key,
        },
      });
      const fullChats = await fullChatsResponse.json();
      currentConversation = fullChats.chats[chatId];
      messages = currentConversation.messages || [];
    }

    renderMessages();
    renderChatList();
    hamburgerMenu.classList.remove("active");
    dropdownMenu.classList.remove("active");
  } catch (error) {
    console.error("Error switching to chat:", error);
    showToast("Error loading chat", "error");
  }
}

async function deleteChat(chatId) {
  try {
    await api.deleteChat(chatId);

    if (currentConversation && currentConversation.id === chatId) {
      await createNewChat();
    } else {
      loadChatHistory();
    }
  } catch (error) {
    console.error("Error deleting chat:", error);
    showToast("Error deleting chat.", "error");
  }
}

async function deleteCurrentChat() {
  if (!currentConversation) {
    showToast("No current chat to delete.", "warning");
    return;
  }

  const result = await showDialog(
    "Delete Chat",
    "Are you sure you want to delete this chat? This action cannot be undone.",
    [
      { text: "Cancel", action: "cancel", class: "secondary" },
      { text: "Delete", action: "delete", class: "danger" },
    ]
  );

  if (result.action === "delete") {
    await deleteChat(currentConversation.id);
  }
}

async function clearCurrentChat() {
  if (!currentConversation) {
    showToast("No current chat to clear.", "warning");
    return;
  }

  const result = await showDialog(
    "Clear Chat",
    "Are you sure you want to clear the current chat? This will remove all messages.",
    [
      { text: "Cancel", action: "cancel", class: "secondary" },
      { text: "Clear", action: "clear", class: "danger" },
    ]
  );

  if (result.action !== "clear") return;

  messages = [
    {
      role: "user",
      content: "(OOC: Give your greeting )",
      timestamp: new Date().toISOString(),
    },
    {
      role: "assistant",
      content: currentBot.greeting,
      timestamp: new Date().toISOString(),
    },
  ];

  currentConversation.messages = messages;
  api.saveChat(currentConversation.id, currentConversation.with, messages);

  renderMessages();

  hamburgerMenu.classList.remove("active");
  dropdownMenu.classList.remove("active");

  showToast("Chat cleared!", "success");
}

async function branchCurrentChat() {
  if (!currentConversation) {
    showToast("No current chat to branch.", "warning");
    return;
  }

  if (!messages || messages.length === 0) {
    showToast("Cannot branch an empty chat.", "warning");
    return;
  }

  try {
    const botId = window.location.pathname.split("/").pop();
    const branchChatId = `${api.userId}_${botId}_${Date.now()}_branch`;

    // Create a deep copy of the current messages
    const branchedMessages = JSON.parse(JSON.stringify(messages));

    const branchedConversation = {
      id: branchChatId,
      with: botId,
      messages: branchedMessages,
      createdAt: new Date().toISOString(),
      branchedFrom: currentConversation.id,
    };

    await api.saveChat(branchedConversation.id, botId, branchedMessages);

    currentConversation = branchedConversation;
    messages = branchedMessages;

    renderMessages();
    loadChatHistory();

    hamburgerMenu.classList.remove("active");
    dropdownMenu.classList.remove("active");

    showToast(
      "Chat branched! You can now create a different timeline.",
      "success"
    );
  } catch (error) {
    console.error("Error branching chat:", error);
    showToast("Error branching chat.", "error");
  }
}

function exportChat() {
  if (!currentConversation || !messages.length) {
    showToast("No chat to export.", "warning");
    return;
  }

  const exportData = {
    bot: currentBot.name,
    date: new Date(currentConversation.createdAt).toLocaleString(),
    messages: messages.filter(
      (msg) => !(msg.role === "user" && msg.content === ".")
    ),
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], { type: "application/json" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(dataBlob);
  link.download = `chat_${currentBot.name}_${
    new Date().toISOString().split("T")[0]
  }.json`;
  link.click();

  hamburgerMenu.classList.remove("active");
  dropdownMenu.classList.remove("active");
}

function formatText(text) {
  if (!text) return "";

  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  formatted = formatted.replace(/\\n|\n/g, "<br>");

  formatted = formatted.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  formatted = formatted.replace(
    /"([^"]+)"/g,
    '<span class="quoted-text">"$1"</span>'
  );

  return formatted;
}

function editMessage(index) {
  const messageBubble = document.querySelector(`[data-index="${index}"]`);
  if (!messageBubble || messageBubble.querySelector(".message-edit-area"))
    return;

  const currentContent = messages[index].content;
  const originalHTML = messageBubble.innerHTML;

  const messageContainer = messageBubble.closest(".message-user, .message-bot");
  if (messageContainer) {
    messageContainer.classList.add("editing");
  }

  messageBubble.innerHTML = `
                <textarea class="message-edit-area" id="edit-area-${index}">${currentContent}</textarea>
                <div class="edit-controls">
                    <button class="edit-btn save" onclick="saveEdit(${index})">Save</button>
                    <button class="edit-btn cancel" onclick="cancelEdit(${index}, \`${originalHTML
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")}\`)">Cancel</button>
                </div>
            `;

  const textarea = document.getElementById(`edit-area-${index}`);
  textarea.focus();
  textarea.select();
}

async function saveEdit(index) {
  const textarea = document.getElementById(`edit-area-${index}`);
  const newContent = textarea.value.trim();

  if (!newContent) {
    showToast("Message cannot be empty.", "warning");
    return;
  }

  messages[index].content = newContent;
  messages[index].timestamp = new Date().toISOString();

  if (messages[index].role === "user" && index < messages.length - 1) {
    const result = await showDialog(
      "Edit Message",
      "Editing this message will remove all subsequent messages. Continue?",
      [
        { text: "Cancel", action: "cancel", class: "secondary" },
        { text: "Continue", action: "continue", class: "primary" },
      ]
    );

    if (result.action !== "continue") {
      renderMessages();
      return;
    } else {
      messages = messages.slice(0, index + 1);
    }
  }

  try {
    await api.saveChat(
      currentConversation.id,
      currentConversation.with,
      messages
    );
    renderMessages();
    loadChatHistory();

    const messageContainers = document.querySelectorAll(
      ".message-user.editing, .message-bot.editing"
    );
    messageContainers.forEach((container) => {
      container.classList.remove("editing");
    });
  } catch (error) {
    console.error("Error saving edited message:", error);
    showToast("Error saving changes.", "error");
  }
}

function cancelEdit(index, originalHTML) {
  const messageBubble = document.querySelector(`[data-index="${index}"]`);
  messageBubble.innerHTML = originalHTML;

  const messageContainer = messageBubble.closest(".message-user, .message-bot");
  if (messageContainer) {
    messageContainer.classList.remove("editing");
  }
}

async function regenerateMessage(index) {
  if (messages[index].role !== "assistant") return;

  const messagesUpToHere = messages.slice(0, index);

  const result = await showDialog(
    "Regenerate Message",
    "This will regenerate the response and remove all subsequent messages. Continue?",
    [
      { text: "Cancel", action: "cancel", class: "secondary" },
      { text: "Regenerate", action: "regenerate", class: "primary" },
    ]
  );

  if (result.action === "regenerate") {
    messages = messagesUpToHere;

    const lastUserMessageIndex = messages.length - 1;

    renderMessages();

    const msgDiv = document.createElement("div");
    msgDiv.className = "message-bot regenerating";
    msgDiv.innerHTML = `
                    <img src="${currentBot.avatar}" class="pfp">
                    <div class="message-text">
                        <div class="message-name">${currentBot.name}</div>
                        <div class="message-bubble" id="regenerating-bubble">
                            <div class="loading-dots">
                                <div class="loading-dot"></div>
                                <div class="loading-dot"></div>
                                <div class="loading-dot"></div>
                            </div>
                        </div>
                    </div>
                `;
    document.getElementById("messages").appendChild(msgDiv);
    const bubble = document.getElementById("regenerating-bubble");

    let aiContent = "";
    let displayedContent = "";
    let isFirstChunk = true;
    let typingTimer = null;
    let streamEnded = false;

    const startTyping = () => {
      if (typingTimer) return;

      const typeChar = () => {
        if (displayedContent.length < aiContent.length) {
          displayedContent += aiContent[displayedContent.length];
          bubble.innerHTML = formatText(displayedContent);

          smoothScrollToBottom();

          const delay = streamEnded ? 5 : Math.random() * 10 + 5;
          typingTimer = setTimeout(typeChar, delay);
        } else {
          typingTimer = null;
        }
      };

      typeChar();
    };

    try {
  
      await api.callAIStream(
        messages,
        currentBot.sys_pmt,
        (chunk) => {
          if (isFirstChunk) {
            bubble.innerHTML = "";
            isFirstChunk = false;
          }

          aiContent += chunk;
          if (!typingTimer) {
            startTyping();
          }
        },
        currentBot,
        generationAbortController.signal
      );

      streamEnded = true;

      const waitForTyping = () => {
        if (displayedContent.length < aiContent.length && typingTimer) {
          setTimeout(waitForTyping, 100);
        } else {
          if (typingTimer) {
            clearTimeout(typingTimer);
            typingTimer = null;
          }
          if (displayedContent.length < aiContent.length) {
            displayedContent = aiContent;
            bubble.innerHTML = formatText(displayedContent);
          }
        }
      };
      waitForTyping();

      bubble.removeAttribute("id");

      msgDiv.classList.remove("regenerating");

      messages.push({
        role: "assistant",
        content: aiContent,
        timestamp: new Date().toISOString(),
      });

      await api.saveChat(currentConversation.id, currentBot.id, messages);
      renderMessages();
      loadChatHistory();
    } catch (error) {
      console.error("Error regenerating message:", error);
      showToast("Error regenerating message.", "error");
      msgDiv.classList.remove("regenerating");
      msgDiv.remove();
    }
  }
}

function loadApiConfig() {
  const aiProvider =
    localStorage.getItem("aiProvider") || "https://text.pollinations.ai/openai";
  const aiModel = localStorage.getItem("aiModel") || "mistral";
  const maxTokens = localStorage.getItem("maxTokens") || "1000";
  const apiKey = localStorage.getItem("apiKey") || "";

  document.getElementById("ai-provider").value = aiProvider;
  document.getElementById("ai-model").value = aiModel;
  document.getElementById("max-tokens").value = maxTokens;
  document.getElementById("api-key").value = apiKey;
}

function saveApiConfig() {
  const aiProvider = document.getElementById("ai-provider").value;
  const aiModel = document.getElementById("ai-model").value;
  const maxTokens = document.getElementById("max-tokens").value;
  const apiKey = document.getElementById("api-key").value;

  localStorage.setItem("aiProvider", aiProvider);
  localStorage.setItem("aiModel", aiModel);
  localStorage.setItem("maxTokens", maxTokens);
  localStorage.setItem("apiKey", apiKey);

  hamburgerMenu.classList.remove("active");
  dropdownMenu.classList.remove("active");

  showToast(
    "API configuration saved! Changes will take effect on next message.",
    "success"
  );
}

// Initialize app
loadData().then(() => {
  loadChatHistory();
  loadApiConfig();
  setupScrollTracking();
});


document.getElementById("reportButton").addEventListener("click", () => {
  let reason = prompt("Please enter the reason for reporting:");

  reason = "BOT " + currentBot.name + "\n BOT ID: " + currentBot.id + "\n" +  reason
  if (reason) {
    fetch("/api/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: reason }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          showToast("Report sent successfully!", "success");
        } else {
          showToast("Failed to send report.", "error");
        }
      })
      .catch((error) => {
        console.error("Error sending report:", error);
        showToast("Error sending report.", "error");
      });
  }
})