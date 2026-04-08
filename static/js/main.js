// API Configuration
const API_BASE = '';
const API = {
    health: '/health',
    healthStatus: '/health/status',
    threads: '/threads',
    newThread: '/threads/new',
    activateThread: '/threads/{id}/activate',
    chatHistory: '/chat/history',
    processMessage: '/chat/process_message',
    streamMessage: '/chat/stream_message'
};

// State Management
const state = {
    currentThreadId: null,
    threads: [],
    messages: {},
    streamingStates: {}, // Track streaming state per thread
    theme: localStorage.getItem('theme') || 'dark'
};

// Initialize icons on page load
function initializeIcons() {
    document.querySelectorAll('[data-icon]').forEach(element => {
        const iconName = element.getAttribute('data-icon');
        if (Icons[iconName]) {
            element.innerHTML = Icons[iconName];
        }
    });
}

// DOM Elements
const elements = {
    loadingScreen: document.getElementById('loading-screen'),
    loadingStatus: document.getElementById('loading-status'),
    mainContainer: document.getElementById('main-container'),
    landingPage: document.getElementById('landing-page'),
    chatInterface: document.getElementById('chat-interface'),
    startChatBtn: document.getElementById('start-chat-btn'),
    newChatBtn: document.getElementById('new-chat-btn'),
    threadsList: document.getElementById('threads-list'),
    messagesContainer: document.getElementById('messages-container'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    streamingToggle: document.getElementById('streaming-toggle'),
    currentThreadTitle: document.getElementById('current-thread-title'),
    themeToggle: document.getElementById('theme-toggle'),
    themeIcon: document.getElementById('theme-icon'),
    backToLanding: document.getElementById('back-to-landing')
};

// Add ripple effect to buttons
function createRipple(event) {
    const button = event.currentTarget;
    const ripple = document.createElement('span');
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.classList.add('ripple');
    
    button.appendChild(ripple);
    
    setTimeout(() => {
        ripple.remove();
    }, 600);
}

// Add ripple effect to all buttons
function addRippleEffects() {
    const buttons = document.querySelectorAll('.icon-btn, .primary-btn, .send-btn, .source-expand-btn');
    buttons.forEach(button => {
        button.addEventListener('click', createRipple);
    });
}

// Initialize App
async function init() {
    initializeIcons();
    await checkServerHealth();
    setupEventListeners();
    applyTheme();
    addRippleEffects();
}

// Check Server Health
async function checkServerHealth() {
    const maxAttempts = 30;
    let attempts = 0 

    while (attempts < maxAttempts) {
        try {
            elements.loadingStatus.textContent = `Connection attempt ${attempts + 1}/${maxAttempts}...`;
            
            const response = await fetch(API.healthStatus, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.is_ready) {
                    elements.loadingStatus.textContent = 'Server ready!';
                    await new Promise(resolve => setTimeout(resolve, 500));
                    showMainContainer();
                    return;
                } else {
                    elements.loadingStatus.textContent = data.status || 'Loading...';
                }
            }
        } catch (error) {
            console.log('Waiting for server to start...');
        }
        
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    elements.loadingStatus.textContent = 'Failed to connect to server';
    elements.loadingStatus.style.color = 'var(--danger)';
}

// Show Main Container
function showMainContainer() {
    elements.loadingScreen.classList.add('hidden');
    elements.mainContainer.classList.remove('hidden');
}

// Setup Event Listeners
function setupEventListeners() {
    elements.startChatBtn.addEventListener('click', showChatInterface);
    elements.newChatBtn.addEventListener('click', createNewThread);
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keydown', handleInputKeydown);
    elements.messageInput.addEventListener('input', autoResizeTextarea);
    elements.themeToggle.addEventListener('click', toggleTheme);
    elements.backToLanding.addEventListener('click', showLandingPage);
}

// Show Chat Interface
async function showChatInterface() {
    elements.landingPage.classList.add('hidden');
    elements.chatInterface.classList.remove('hidden');
    await loadThreads();
    
    // Auto-select the newest thread if available
    if (state.threads.length > 0) {
        const newestThread = state.threads.reduce((newest, thread) => {
            return new Date(thread.created_at) > new Date(newest.created_at) ? thread : newest;
        });
        await selectThread(newestThread.thread_id);
    }
}

// Show Landing Page
function showLandingPage() {
    elements.chatInterface.classList.add('hidden');
    elements.landingPage.classList.remove('hidden');
    state.currentThreadId = null;
}

// Load Threads
async function loadThreads() {
    try {
        const response = await fetch(API.threads, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to load threads');
        
        const threads = await response.json();
        state.threads = threads || [];
        renderThreads();
    } catch (error) {
        console.error('Error loading threads:', error);
        showNotification('Error loading chats', 'error');
    }
}

// Render Threads
function renderThreads() {
    elements.threadsList.innerHTML = '';
    
    if (state.threads.length === 0) {
        elements.threadsList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No chats</div>';
        return;
    }
    
    // Sort threads by creation date (newest first)
    const sortedThreads = [...state.threads].sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
    );
    
    sortedThreads.forEach(thread => {
        const threadEl = document.createElement('div');
        threadEl.className = 'thread-item';
        if (thread.thread_id === state.currentThreadId) {
            threadEl.classList.add('active');
        }
        
        const date = new Date(thread.created_at).toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        threadEl.innerHTML = `
            <div class="thread-info">
                <div class="thread-title">Chat ${thread.thread_id.slice(0, 8)}</div>
                <div class="thread-date">${date}</div>
            </div>
            <button class="delete-thread-btn" data-thread-id="${thread.thread_id}" data-icon="trash"></button>
        `;
        
        // Initialize icon for delete button
        const deleteBtn = threadEl.querySelector('.delete-thread-btn');
        if (Icons.trash) {
            deleteBtn.innerHTML = Icons.trash;
        }
        
        threadEl.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-thread-btn')) {
                selectThread(thread.thread_id);
            }
        });
        
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteThread(thread.thread_id);
        });
        
        // Add ripple effect to delete button
        deleteBtn.addEventListener('click', createRipple);
        
        elements.threadsList.appendChild(threadEl);
    });
}

// Create New Thread
async function createNewThread() {
    try {
        const response = await fetch(API.newThread, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error('Failed to create thread');
        
        const data = await response.json();
        await loadThreads();
        selectThread(data.thread_id);
        showNotification('New chat created', 'success');
    } catch (error) {
        console.error('Error creating thread:', error);
        showNotification('Error creating chat', 'error');
    }
}

// Select Thread
async function selectThread(threadId) {
    try {
        // Activate thread
        const activateUrl = API.activateThread.replace('{id}', threadId);
        await fetch(activateUrl, {
            method: 'POST',
            credentials: 'include'
        });
        
        state.currentThreadId = threadId;
        renderThreads();
        await loadMessages(threadId);
        enableInput();
        
        elements.currentThreadTitle.textContent = `Chat ${threadId.slice(0, 8)}`;
    } catch (error) {
        console.error('Error selecting thread:', error);
        showNotification('Error selecting chat', 'error');
    }
}

// Delete Thread
async function deleteThread(threadId) {
    if (!confirm('Delete this chat?')) return;
    
    try {
        const isActiveThread = state.currentThreadId === threadId;
        const isLastThread = state.threads.length === 1;
        
        // If deleting the active thread and it's not the last one, switch to another thread first
        if (isActiveThread && !isLastThread) {
            const otherThreads = state.threads.filter(t => t.thread_id !== threadId);
            
            if (otherThreads.length > 0) {
                // Switch to the newest other thread first
                const newestThread = otherThreads.reduce((newest, thread) => {
                    return new Date(thread.created_at) > new Date(newest.created_at) ? thread : newest;
                });
                await selectThread(newestThread.thread_id);
            }
        }
        
        // If it's the last thread, create a new one first, then delete the old one
        if (isLastThread) {
            // Create new thread first
            const createResponse = await fetch(API.newThread, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!createResponse.ok) throw new Error('Failed to create new thread');
            
            const newThreadData = await createResponse.json();
            
            // Switch to the new thread
            await selectThread(newThreadData.thread_id);
            
            // Now delete the old thread
            const deleteResponse = await fetch(`${API.threads}/${threadId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            if (!deleteResponse.ok) {
                const data = await deleteResponse.json();
                throw new Error(data.detail || 'Failed to delete thread');
            }
            
            // Reload threads list
            await loadThreads();
            showNotification('Chat deleted, new one created', 'success');
        } else {
            // Normal deletion for non-last threads
            const response = await fetch(`${API.threads}/${threadId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Failed to delete thread');
            }
            
            // Reload threads list
            await loadThreads();
            showNotification('Chat deleted', 'success');
        }
    } catch (error) {
        console.error('Error deleting thread:', error);
        showNotification(error.message, 'error');
    }
}

// Load Messages
async function loadMessages(threadId) {
    try {
        // Check if there's an existing streaming or loading message for this thread BEFORE loading
        const existingMessages = state.messages[threadId] || [];
        const streamingMessage = existingMessages.find(msg => msg.streaming);
        const loadingMessage = existingMessages.find(msg => msg.loading);
        
        // If there's a streaming or loading message, don't reload from API - just render what we have
        if (streamingMessage || loadingMessage) {
            console.log('Streaming or loading in progress, skipping API reload');
            renderMessages();
            return;
        }
        
        const historyUrl = `${API.chatHistory}/${threadId}`;
        const response = await fetch(historyUrl, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to load messages');
        
        const data = await response.json();
        
        console.log('Loaded messages from API:', data.messages);
        
        // Transform messages from API format (role) to internal format (type)
        const transformedMessages = (data.messages || []).map(msg => {
            const transformed = {
                type: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content,
                sources: msg.sources || []
            };
            console.log('Transformed message:', transformed);
            return transformed;
        });
        
        state.messages[threadId] = transformedMessages;
        renderMessages();
    } catch (error) {
        console.error('Error loading messages:', error);
        state.messages[threadId] = [];
        renderMessages();
    }
}

// Render Messages
function renderMessages() {
    elements.messagesContainer.innerHTML = '';
    
    const messages = state.messages[state.currentThreadId] || [];
    
    console.log('Rendering messages for thread:', state.currentThreadId);
    console.log('Streaming states:', state.streamingStates);
    
    if (messages.length === 0) {
        elements.messagesContainer.innerHTML = `
            <div class="welcome-message">
                <h2>Start a conversation!</h2>
                <p>Ask a question and get an answer with sources</p>
            </div>
        `;
        return;
    }
    
    messages.forEach(msg => {
        const messageEl = createMessageElement(msg);
        
        // Add data attribute for streaming/loading messages
        if (msg.id) {
            messageEl.setAttribute('data-message-id', msg.id);
            // Restore streaming state if exists
            if (msg.streaming) {
                const streamState = state.streamingStates[state.currentThreadId];
                console.log('Checking streaming state for message:', msg.id, 'State:', streamState);
                if (streamState && streamState.messageId === msg.id) {
                    console.log('Restoring streaming state with text:', streamState.displayedText);
                    // Restore the streaming content
                    const messageText = messageEl.querySelector('.message-text');
                    if (messageText && streamState.displayedText) {
                        const contentWrapper = document.createElement('span');
                        contentWrapper.className = 'streaming-content';
                        contentWrapper.innerHTML = renderMarkdown(streamState.displayedText);
                        
                        const cursor = document.createElement('span');
                        cursor.className = 'typing-indicator';
                        cursor.textContent = '▋';
                        
                        messageText.innerHTML = '';
                        messageText.appendChild(contentWrapper);
                        messageText.appendChild(cursor);
                        
                        messageEl.dataset.displayedText = streamState.displayedText;
                    }
                }
            }
            // Loading messages always show cursor (no content to restore)
            if (msg.loading) {
                console.log('Rendering loading message with cursor:', msg.id);
            }
        }
        
        // Add fade-in animation for new messages
        if (!msg.streaming) {
            messageEl.classList.add('fade-in');
        }
        
        elements.messagesContainer.appendChild(messageEl);
    });
    
    scrollToBottom();
}

// Create Message Element
function createMessageElement(msg) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.type}`;
    
    const avatar = msg.type === 'user' ? Icons.user : Icons.bot;
    
    console.log('Creating message element:', { type: msg.type, sourcesCount: msg.sources?.length || 0 });
    
    let sourcesHtml = '';
    if (msg.type === 'assistant' && msg.sources && msg.sources.length > 0) {
        console.log('Adding sources HTML for', msg.sources.length, 'sources');
        sourcesHtml = `
            <div class="message-sources">
                <div class="sources-header" onclick="toggleSources(this)">
                    <span class="sources-toggle">▶</span>
                    <span>Sources (${msg.sources.length})</span>
                </div>
                <div class="sources-list">
                    ${msg.sources.map((source, idx) => `
                        <div class="source-item">
                            <div class="source-header" onclick="toggleSourceContent(this)">
                            <span class="source-title">${source.source || `Source ${idx + 1}`}</span>
                            <button class="source-expand-btn">Expand</button>
                            </div>
                            <div class="source-content">
                                ${escapeHtml(source.text || '')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Handle streaming/loading indicator and markdown
    let contentHtml;
    if (msg.streaming || msg.loading) {
        // During streaming or loading, render markdown but keep the cursor
        const textWithoutCursor = msg.content.replace(/<span class="typing-indicator">.*?<\/span>/, '');
        contentHtml = renderMarkdown(textWithoutCursor) + '<span class="typing-indicator">▋</span>';
    } else {
        contentHtml = renderMarkdown(msg.content);
    }
    
    messageDiv.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
            <div class="message-text">${contentHtml}</div>
            ${sourcesHtml}
        </div>
    `;
    
    return messageDiv;
}

// Render Markdown
function renderMarkdown(text) {
    if (!text) return '';
    
    // Check if marked is available
    if (typeof marked !== 'undefined') {
        try {
            // Configure marked options
            marked.setOptions({
                breaks: true,
                gfm: true
            });
            
            let html = marked.parse(text);
            
            // Render LaTeX if KaTeX is available
            if (typeof katex !== 'undefined') {
                // Inline math: $...$
                html = html.replace(/\$([^\$]+)\$/g, (match, latex) => {
                    try {
                        return katex.renderToString(latex, { throwOnError: false });
                    } catch (e) {
                        return match;
                    }
                });
                
                // Display math: $$...$$
                html = html.replace(/\$\$([^\$]+)\$\$/g, (match, latex) => {
                    try {
                        return katex.renderToString(latex, { displayMode: true, throwOnError: false });
                    } catch (e) {
                        return match;
                    }
                });
            }
            
            return html;
        } catch (e) {
            console.error('Error rendering markdown:', e);
            return escapeHtml(text);
        }
    }
    
    // Fallback if marked is not loaded
    return escapeHtml(text).replace(/\n/g, '<br>');
}

// Toggle Sources
function toggleSources(header) {
    const toggle = header.querySelector('.sources-toggle');
    const list = header.nextElementSibling;
    
    toggle.classList.toggle('expanded');
    list.classList.toggle('expanded');
}

// Toggle Source Content
function toggleSourceContent(header) {
    const content = header.nextElementSibling;
    const btn = header.querySelector('.source-expand-btn');
    
    content.classList.toggle('expanded');
    btn.textContent = content.classList.contains('expanded') ? 'Collapse' : 'Expand';
}

// Send Message
async function sendMessage() {
    const message = elements.messageInput.value.trim();
    if (!message || !state.currentThreadId) return;
    
    // Add user message
    addUserMessage(message);
    elements.messageInput.value = '';
    autoResizeTextarea();
    
    // Disable input while processing
    disableInput();
    
    try {
        if (elements.streamingToggle.checked) {
            await streamMessage(message);
        } else {
            await processMessage(message);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Error sending message', 'error');
    } finally {
        enableInput();
    }
}

// Add User Message
function addUserMessage(content) {
    const messages = state.messages[state.currentThreadId] || [];
    messages.push({
        type: 'user',
        content: content
    });
    state.messages[state.currentThreadId] = messages;
    renderMessages();
}

// Process Message (Non-streaming)
async function processMessage(message) {
    // Add loading message with cursor
    const loadingMessageId = addLoadingMessage();
    
    try {
        const response = await fetch(API.processMessage, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });
        
        if (!response.ok) throw new Error('Failed to process message');
        
        const data = await response.json();
        
        // Remove loading message
        removeLoadingMessage(loadingMessageId);
        
        // Add actual response
        addAssistantMessage(data);
    } catch (error) {
        // Remove loading message on error
        removeLoadingMessage(loadingMessageId);
        throw error;
    }
}

// Add Loading Message
function addLoadingMessage() {
    const messages = state.messages[state.currentThreadId] || [];
    const id = Date.now();
    messages.push({
        id: id,
        type: 'assistant',
        content: '',
        sources: [],
        loading: true
    });
    state.messages[state.currentThreadId] = messages;
    renderMessages();
    return id;
}

// Remove Loading Message
function removeLoadingMessage(id) {
    const messages = state.messages[state.currentThreadId] || [];
    const index = messages.findIndex(m => m.id === id);
    if (index !== -1) {
        messages.splice(index, 1);
        state.messages[state.currentThreadId] = messages;
    }
}

// Stream Message (SSE)
async function streamMessage(message) {
    const assistantMessageId = addStreamingMessage();
    
    try {
        const response = await fetch(API.streamMessage, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });
        
        if (!response.ok) throw new Error('Failed to stream message');
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        let sources = [];
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            
            // Keep the last incomplete chunk in buffer
            if (!buffer.endsWith('\n\n')) {
                buffer = lines.pop() || '';
            } else {
                buffer = '';
            }
            
            for (const chunk of lines) {
                if (!chunk.trim()) continue;
                
                const eventMatch = chunk.match(/^event:\s*(.+)$/m);
                const dataMatch = chunk.match(/^data:\s*(.+)$/m);
                
                if (dataMatch) {
                    try {
                        const data = JSON.parse(dataMatch[1]);
                        
                        console.log('Received chunk:', data);
                        
                        if (data.response_text) {
                            fullText += data.response_text;
                            updateStreamingMessage(assistantMessageId, fullText, sources);
                        }
                        
                        if (data.tool_response && data.tool_response.length > 0) {
                            // Backend already accumulates sources, just use them
                            sources = data.tool_response;
                            updateStreamingMessage(assistantMessageId, fullText, sources);
                        }
                    } catch (e) {
                        console.error('Error parsing SSE data:', e, dataMatch[1]);
                    }
                }
            }
        }
        
        finalizeStreamingMessage(assistantMessageId, fullText, sources);
    } catch (error) {
        console.error('Streaming error:', error);
        removeStreamingMessage(assistantMessageId);
        throw error;
    }
}

// Add Streaming Message
function addStreamingMessage() {
    const messages = state.messages[state.currentThreadId] || [];
    const id = Date.now();
    messages.push({
        id: id,
        type: 'assistant',
        content: '',
        sources: [],
        streaming: true
    });
    state.messages[state.currentThreadId] = messages;
    
    // Create the message element immediately
    updateMessageElement(id, '', [], true);
    
    return id;
}

// Update Streaming Message
function updateStreamingMessage(id, content, sources) {
    const threadId = state.currentThreadId;
    const messages = state.messages[threadId] || [];
    const msg = messages.find(m => m.id === id);
    if (msg) {
        msg.content = content;
        msg.sources = sources;
        
        // Save streaming state for this thread BEFORE updating UI
        state.streamingStates[threadId] = {
            messageId: id,
            displayedText: content,
            sources: sources || []
        };
        
        // Update only the specific message instead of re-rendering all
        updateMessageElement(id, content, sources, true);
    }
}

// Update Message Element (for streaming)
function updateMessageElement(id, content, sources, isStreaming) {
    const container = elements.messagesContainer;
    let messageEl = container.querySelector(`[data-message-id="${id}"]`);
    
    if (!messageEl) {
        // Create new message element if it doesn't exist
        const messages = state.messages[state.currentThreadId] || [];
        const msg = messages.find(m => m.id === id);
        if (msg) {
            messageEl = createMessageElement(msg);
            messageEl.setAttribute('data-message-id', id);
            messageEl.classList.add('fade-in');
            container.appendChild(messageEl);
            scrollToBottom();
        }
        return;
    }
    
    // Update existing message content character by character
    const messageText = messageEl.querySelector('.message-text');
    if (messageText) {
        const textWithoutCursor = content.replace(/<span class="typing-indicator">.*?<\/span>/, '');
        
        // Get or create content wrapper
        let contentWrapper = messageText.querySelector('.streaming-content');
        let cursor = messageText.querySelector('.typing-indicator');
        
        if (!contentWrapper) {
            // First time - create structure
            contentWrapper = document.createElement('span');
            contentWrapper.className = 'streaming-content';
            messageText.innerHTML = '';
            messageText.appendChild(contentWrapper);
            
            cursor = document.createElement('span');
            cursor.className = 'typing-indicator';
            cursor.textContent = '▋';
            messageText.appendChild(cursor);
            
            // Store the raw text being displayed
            messageEl.dataset.displayedText = '';
        }
        
        // Get the currently displayed text
        const displayedText = messageEl.dataset.displayedText || '';
        
        // Only process if there's new content
        if (textWithoutCursor.length > displayedText.length) {
            // Update the displayed text
            messageEl.dataset.displayedText = textWithoutCursor;
            
            // Render the entire content with markdown
            const fullHtml = renderMarkdown(textWithoutCursor);
            
            // Update content smoothly without flashing
            contentWrapper.innerHTML = fullHtml;
            
            // Save streaming state for this thread
            const threadId = state.currentThreadId;
            const messages = state.messages[threadId] || [];
            const msg = messages.find(m => m.id === id);
            if (msg && msg.streaming) {
                state.streamingStates[threadId] = {
                    messageId: id,
                    displayedText: textWithoutCursor,
                    sources: sources || []
                };
            }
        }
    }
    
    // Update sources if they exist
    if (sources && sources.length > 0) {
        updateMessageSources(messageEl, sources);
    }
}

// Update Message Sources
function updateMessageSources(messageEl, sources) {
    if (!sources || sources.length === 0) return;
    
    let sourcesContainer = messageEl.querySelector('.message-sources');
    const messageContent = messageEl.querySelector('.message-content');
    
    const sourcesHtml = `
        <div class="message-sources">
            <div class="sources-header" onclick="toggleSources(this)">
                <span class="sources-toggle">▶</span>
                <span>Sources (${sources.length})</span>
            </div>
            <div class="sources-list">
                ${sources.map((source, idx) => `
                    <div class="source-item">
                        <div class="source-header" onclick="toggleSourceContent(this)">
                            <span class="source-title">${source.source || `Source ${idx + 1}`}</span>
                            <button class="source-expand-btn">Expand</button>
                        </div>
                        <div class="source-content">
                            ${escapeHtml(source.text || '')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    if (sourcesContainer) {
        // Update existing sources
        sourcesContainer.outerHTML = sourcesHtml;
    } else {
        // Create new sources container
        messageContent.insertAdjacentHTML('beforeend', sourcesHtml);
    }
}

// Finalize Streaming Message
function finalizeStreamingMessage(id, content, sources) {
    const threadId = state.currentThreadId;
    const messages = state.messages[threadId] || [];
    const msg = messages.find(m => m.id === id);
    if (msg) {
        msg.content = content;
        msg.sources = sources;
        msg.streaming = false;
        
        // Update the message element one last time without cursor
        const messageEl = elements.messagesContainer.querySelector(`[data-message-id="${id}"]`);
        if (messageEl) {
            const messageText = messageEl.querySelector('.message-text');
            if (messageText) {
                messageText.innerHTML = renderMarkdown(content);
            }
            messageEl.removeAttribute('data-message-id');
        }
        
        delete msg.id;
        
        // Clear streaming state for this thread
        if (state.streamingStates[threadId]) {
            delete state.streamingStates[threadId];
        }
    }
}

// Remove Streaming Message
function removeStreamingMessage(id) {
    const messages = state.messages[state.currentThreadId] || [];
    const index = messages.findIndex(m => m.id === id);
    if (index !== -1) {
        messages.splice(index, 1);
        state.messages[state.currentThreadId] = messages;
        renderMessages();
    }
}

// Add Assistant Message
function addAssistantMessage(data) {
    const messages = state.messages[state.currentThreadId] || [];
    messages.push({
        type: 'assistant',
        content: data.response_text || '',
        sources: data.tool_response || []
    });
    state.messages[state.currentThreadId] = messages;
    renderMessages();
}

// Handle Input Keydown
function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// Auto Resize Textarea
function autoResizeTextarea() {
    elements.messageInput.style.height = 'auto';
    elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 150) + 'px';
}

// Enable Input
function enableInput() {
    elements.messageInput.disabled = false;
    elements.sendBtn.disabled = false;
    elements.messageInput.focus();
}

// Disable Input
function disableInput() {
    elements.messageInput.disabled = true;
    elements.sendBtn.disabled = true;
}

// Clear Messages
function clearMessages() {
    elements.messagesContainer.innerHTML = `
        <div class="welcome-message">
            <h2>Welcome!</h2>
            <p>Create a new chat or select an existing one from history</p>
        </div>
    `;
}

// Scroll to Bottom
function scrollToBottom() {
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

// Toggle Theme
function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', state.theme);
    applyTheme();
}

// Apply Theme
function applyTheme() {
    const themeBtn = document.getElementById('theme-toggle');
    if (state.theme === 'light') {
        document.body.setAttribute('data-theme', 'light');
        if (themeBtn && Icons.sun) {
            themeBtn.innerHTML = Icons.sun;
        }
    } else {
        document.body.removeAttribute('data-theme');
        if (themeBtn && Icons.moon) {
            themeBtn.innerHTML = Icons.moon;
        }
    }
}

// Show Notification
function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Start the app
document.addEventListener('DOMContentLoaded', init);