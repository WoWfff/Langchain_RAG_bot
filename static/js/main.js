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
    theme: localStorage.getItem('theme') || 'dark',
    pinnedThreads: JSON.parse(localStorage.getItem('pinnedThreads') || '[]'),
    editingThreadId: null,
    autoScroll: true, // Auto-scroll when user is at bottom
    isUserScrolling: false,
    isProgrammaticScroll: false,
    selectionMode: false, // Multi-select mode for deleting threads
    selectedThreads: [] // Array of selected thread IDs
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
    backToLanding: document.getElementById('back-to-landing'),
    selectModeBtn: document.getElementById('select-mode-btn'),
    deleteSelectedBtn: document.getElementById('delete-selected-btn'),
    cancelSelectBtn: document.getElementById('cancel-select-btn')
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
    
    // Selection mode buttons
    elements.selectModeBtn.addEventListener('click', enterSelectionMode);
    elements.deleteSelectedBtn.addEventListener('click', deleteSelectedThreads);
    elements.cancelSelectBtn.addEventListener('click', exitSelectionMode);
    
    // Handle user scroll
    elements.messagesContainer.addEventListener('scroll', handleUserScroll);
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.thread-actions')) {
            closeAllDropdowns();
        }
    });
}

// Show Chat Interface
async function showChatInterface() {
    elements.landingPage.classList.add('hidden');
    elements.chatInterface.classList.remove('hidden');
    await loadThreads();
    
    // Auto-select thread based on priority: pinned > newest
    if (state.threads.length > 0) {
        let threadToSelect = null;
        
        // First, check if there's a pinned thread
        if (state.pinnedThreads.length > 0) {
            // Find the first pinned thread that exists
            threadToSelect = state.threads.find(thread => 
                state.pinnedThreads.includes(thread.thread_id)
            );
        }
        
        // If no pinned thread found, select the newest thread
        if (!threadToSelect) {
            threadToSelect = state.threads.reduce((newest, thread) => {
                return new Date(thread.created_at) > new Date(newest.created_at) ? thread : newest;
            });
        }
        
        if (threadToSelect) {
            await selectThread(threadToSelect.thread_id);
        }
    } else {
        // No threads - show welcome message and enable input
        clearMessages();
        enableInput();
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
    
    // Sort threads: pinned first, then by creation date
    const sortedThreads = [...state.threads].sort((a, b) => {
        const aIsPinned = state.pinnedThreads.includes(a.thread_id);
        const bIsPinned = state.pinnedThreads.includes(b.thread_id);
        
        if (aIsPinned && !bIsPinned) return -1;
        if (!aIsPinned && bIsPinned) return 1;
        
        return new Date(b.created_at) - new Date(a.created_at);
    });
    
    sortedThreads.forEach(thread => {
        const threadEl = document.createElement('div');
        threadEl.className = 'thread-item';
        if (thread.thread_id === state.currentThreadId) {
            threadEl.classList.add('active');
        }
        if (state.pinnedThreads.includes(thread.thread_id)) {
            threadEl.classList.add('pinned');
        }
        
        const date = new Date(thread.created_at).toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const threadName = thread.name || `Chat ${thread.thread_id.slice(0, 8)}`;
        const isPinned = state.pinnedThreads.includes(thread.thread_id);
        
        const isSelected = state.selectedThreads.includes(thread.thread_id);
        if (isSelected) {
            threadEl.classList.add('selected');
        }
        
        threadEl.innerHTML = `
            <div class="thread-checkbox ${isSelected ? 'checked' : ''}" data-thread-id="${thread.thread_id}"></div>
            <div class="thread-info">
                <div class="thread-title">
                    <span class="pin-indicator" data-icon="pin"></span>
                    <span class="thread-title-text">${threadName}</span>
                </div>
                <div class="thread-date">${date}</div>
            </div>
            <div class="thread-actions">
                <button class="thread-menu-btn" data-thread-id="${thread.thread_id}" data-icon="moreVertical"></button>
                <div class="thread-dropdown">
                    <button class="thread-dropdown-item rename-thread" data-thread-id="${thread.thread_id}">
                        <span data-icon="edit"></span>
                        <span>Rename</span>
                    </button>
                    <button class="thread-dropdown-item pin-thread" data-thread-id="${thread.thread_id}">
                        <span data-icon="pin"></span>
                        <span>${isPinned ? 'Unpin' : 'Pin'}</span>
                    </button>
                    <button class="thread-dropdown-item danger delete-thread" data-thread-id="${thread.thread_id}">
                        <span data-icon="trash"></span>
                        <span>Delete</span>
                    </button>
                </div>
            </div>
        `;
        
        // Initialize ALL icons in the thread element (including nested ones)
        const initializeThreadIcons = (element) => {
            const iconsToInit = element.querySelectorAll('[data-icon]');
            console.log('Initializing icons:', iconsToInit.length);
            iconsToInit.forEach(el => {
                const iconName = el.getAttribute('data-icon');
                console.log('Icon:', iconName, 'Exists:', !!Icons[iconName]);
                if (Icons[iconName]) {
                    el.innerHTML = Icons[iconName];
                }
            });
        };
        
        initializeThreadIcons(threadEl);
        
        // Handle checkbox click
        const checkbox = threadEl.querySelector('.thread-checkbox');
        if (checkbox) {
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleThreadSelection(thread.thread_id);
            });
        }
        
        // Click on thread item
        threadEl.addEventListener('click', (e) => {
            if (e.target.closest('.thread-checkbox')) {
                return; // Already handled
            }
            if (e.target.closest('.thread-actions')) {
                return; // Menu actions
            }
            
            // In selection mode, clicking thread toggles selection
            if (state.selectionMode) {
                toggleThreadSelection(thread.thread_id);
            } else {
                selectThread(thread.thread_id);
            }
        });
        
        // Menu button
        const menuBtn = threadEl.querySelector('.thread-menu-btn');
        const dropdown = threadEl.querySelector('.thread-dropdown');
        
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleThreadDropdown(threadEl, menuBtn, dropdown);
        });
        
        // Rename
        const renameBtn = threadEl.querySelector('.rename-thread');
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startRenameThread(thread.thread_id, threadEl);
            closeAllDropdowns();
        });
        
        // Pin/Unpin
        const pinBtn = threadEl.querySelector('.pin-thread');
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePinThread(thread.thread_id);
            closeAllDropdowns();
        });
        
        // Delete
        const deleteBtn = threadEl.querySelector('.delete-thread');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteThread(thread.thread_id);
            closeAllDropdowns();
        });
        
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

// Toggle Thread Dropdown
function toggleThreadDropdown(threadEl, menuBtn, dropdown) {
    const isOpen = dropdown.classList.contains('show');
    
    // Close all other dropdowns
    closeAllDropdowns();
    
    if (!isOpen) {
        dropdown.classList.add('show');
        menuBtn.classList.add('active');
    }
}

// Close All Dropdowns
function closeAllDropdowns() {
    document.querySelectorAll('.thread-dropdown.show').forEach(dropdown => {
        dropdown.classList.remove('show');
    });
    document.querySelectorAll('.thread-menu-btn.active').forEach(btn => {
        btn.classList.remove('active');
    });
}

// Start Rename Thread
function startRenameThread(threadId, threadEl) {
    const threadInfo = threadEl.querySelector('.thread-info');
    const threadTitle = threadEl.querySelector('.thread-title');
    const currentName = threadEl.querySelector('.thread-title-text').textContent;
    
    state.editingThreadId = threadId;
    
    threadTitle.innerHTML = `
        <div class="thread-title-edit">
            <input type="text" class="thread-title-input" value="${currentName}" />
            <div class="thread-title-actions">
                <button class="thread-title-btn save" data-icon="check"></button>
                <button class="thread-title-btn cancel" data-icon="x"></button>
            </div>
        </div>
    `;
    
    // Initialize icons
    threadTitle.querySelectorAll('[data-icon]').forEach(el => {
        const iconName = el.getAttribute('data-icon');
        if (Icons[iconName]) {
            el.innerHTML = Icons[iconName];
        }
    });
    
    const input = threadTitle.querySelector('.thread-title-input');
    const saveBtn = threadTitle.querySelector('.save');
    const cancelBtn = threadTitle.querySelector('.cancel');
    
    input.focus();
    input.select();
    
    // Save on Enter
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveThreadName(threadId, input.value);
        } else if (e.key === 'Escape') {
            cancelRenameThread();
        }
    });
    
    // Save button
    saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveThreadName(threadId, input.value);
    });
    
    // Cancel button
    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelRenameThread();
    });
}

// Save Thread Name
async function saveThreadName(threadId, newName) {
    if (!newName.trim()) {
        showNotification('Thread name cannot be empty', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/threads/${threadId}/name`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: newName.trim() })
        });
        
        if (!response.ok) throw new Error('Failed to rename thread');
        
        // Update local state
        const thread = state.threads.find(t => t.thread_id === threadId);
        if (thread) {
            thread.name = newName.trim();
        }
        
        state.editingThreadId = null;
        renderThreads();
        showNotification('Thread renamed successfully', 'success');
    } catch (error) {
        console.error('Error renaming thread:', error);
        showNotification('Failed to rename thread', 'error');
        cancelRenameThread();
    }
}

// Cancel Rename Thread
function cancelRenameThread() {
    state.editingThreadId = null;
    renderThreads();
}

// Enter Selection Mode
function enterSelectionMode() {
    state.selectionMode = true;
    state.selectedThreads = [];
    
    // Show/hide buttons in correct order: Cancel, Delete, (hide Select and New)
    elements.selectModeBtn.style.display = 'none';
    elements.cancelSelectBtn.style.display = 'block';
    elements.deleteSelectedBtn.style.display = 'block';
    elements.newChatBtn.style.display = 'none';
    
    // Add selection-mode class to threads list
    elements.threadsList.classList.add('selection-mode');
    
    renderThreads();
}

// Exit Selection Mode
function exitSelectionMode() {
    state.selectionMode = false;
    state.selectedThreads = [];
    
    // Show/hide buttons: Select and New visible, Cancel and Delete hidden
    elements.selectModeBtn.style.display = 'block';
    elements.cancelSelectBtn.style.display = 'none';
    elements.deleteSelectedBtn.style.display = 'none';
    elements.newChatBtn.style.display = 'block';
    
    // Remove selection-mode class
    elements.threadsList.classList.remove('selection-mode');
    
    renderThreads();
}

// Toggle Thread Selection
function toggleThreadSelection(threadId) {
    const index = state.selectedThreads.indexOf(threadId);
    
    if (index > -1) {
        state.selectedThreads.splice(index, 1);
    } else {
        state.selectedThreads.push(threadId);
    }
    
    renderThreads();
}

// Delete Selected Threads
async function deleteSelectedThreads() {
    if (state.selectedThreads.length === 0) {
        showNotification('No chats selected', 'error');
        return;
    }
    
    if (!confirm(`Delete ${state.selectedThreads.length} selected chat(s)?`)) {
        return;
    }
    
    try {
        // Delete all selected threads
        const deletePromises = state.selectedThreads.map(threadId => 
            fetch(`${API.threads}/${threadId}`, {
                method: 'DELETE',
                credentials: 'include'
            })
        );
        
        await Promise.all(deletePromises);
        
        // If current thread was deleted, clear it
        if (state.selectedThreads.includes(state.currentThreadId)) {
            state.currentThreadId = null;
            clearMessages();
        }
        
        // Exit selection mode and reload threads
        exitSelectionMode();
        await loadThreads();
        
        showNotification(`${state.selectedThreads.length} chat(s) deleted`, 'success');
    } catch (error) {
        console.error('Error deleting threads:', error);
        showNotification('Error deleting chats', 'error');
    }
}

// Toggle Pin Thread
function togglePinThread(threadId) {
    const index = state.pinnedThreads.indexOf(threadId);
    
    if (index > -1) {
        // Unpin
        state.pinnedThreads.splice(index, 1);
        showNotification('Thread unpinned', 'success');
    } else {
        // Pin
        state.pinnedThreads.push(threadId);
        showNotification('Thread pinned', 'success');
    }
    
    // Save to localStorage
    localStorage.setItem('pinnedThreads', JSON.stringify(state.pinnedThreads));
    
    renderThreads();
}

// Delete Thread
async function deleteThread(threadId) {
    if (!confirm('Delete this chat?')) return;
    
    try {
        // Delete the thread - backend returns active_thread_id (null if we deleted active)
        const response = await fetch(`${API.threads}/${threadId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || 'Failed to delete thread');
        }
        
        const data = await response.json();
        const activeThreadAfterDelete = data.thread_id;
        
        // Reload threads list
        await loadThreads();
        
        // If backend set active_thread to null (we deleted active thread)
        if (activeThreadAfterDelete === null && state.threads.length > 0) {
            // Select the newest remaining thread
            const newestThread = state.threads.reduce((newest, thread) => {
                return new Date(thread.created_at) > new Date(newest.created_at) ? thread : newest;
            });
            await selectThread(newestThread.thread_id);
        } else if (activeThreadAfterDelete) {
            // Backend kept an active thread, select it
            await selectThread(activeThreadAfterDelete);
        } else {
            // No threads left - clear current thread and show welcome
            state.currentThreadId = null;
            clearMessages();
            enableInput();
        }
        
        showNotification('Chat deleted', 'success');
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
    if (!message) return;
    
    // If no current thread, create one first
    if (!state.currentThreadId) {
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
            await selectThread(data.thread_id);
        } catch (error) {
            console.error('Error creating thread:', error);
            showNotification('Error creating chat', 'error');
            return;
        }
    }
    
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
    const isFirstMessage = messages.length === 0;
    
    // If this is the first message, hide welcome message
    if (isFirstMessage) {
        const welcomeMsg = elements.messagesContainer.querySelector('.welcome-message');
        if (welcomeMsg) {
            welcomeMsg.classList.add('fade-out');
            setTimeout(() => {
                welcomeMsg.remove();
            }, 500);
        }
    }
    
    messages.push({
        type: 'user',
        content: content
    });
    state.messages[state.currentThreadId] = messages;
    
    // Enable auto-scroll for new messages
    state.autoScroll = true;
    
    // Instead of re-rendering everything, just append the new message
    const messageEl = createMessageElement({
        type: 'user',
        content: content
    });
    
    // Add slide-up animation for first message, fade-in for others
    if (isFirstMessage) {
        messageEl.classList.add('slide-up');
    } else {
        messageEl.classList.add('fade-in');
    }
    
    elements.messagesContainer.appendChild(messageEl);
    scrollToBottom();
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
    const msg = {
        id: id,
        type: 'assistant',
        content: '',
        sources: [],
        loading: true
    };
    
    // Check if this is second message (first assistant message)
    const isSecondMessage = messages.length === 1;
    
    messages.push(msg);
    state.messages[state.currentThreadId] = messages;
    
    // Append the loading message without re-rendering
    const messageEl = createMessageElement(msg);
    messageEl.setAttribute('data-message-id', id);
    
    // Add slide-up for second message, fade-in for others
    if (isSecondMessage) {
        messageEl.classList.add('slide-up');
    } else {
        messageEl.classList.add('fade-in');
    }
    
    elements.messagesContainer.appendChild(messageEl);
    scrollToBottom();
    
    return id;
}

// Remove Loading Message
function removeLoadingMessage(id) {
    const messages = state.messages[state.currentThreadId] || [];
    const index = messages.findIndex(m => m.id === id);
    if (index !== -1) {
        messages.splice(index, 1);
        state.messages[state.currentThreadId] = messages;
        
        // Remove the element from DOM without re-rendering
        const messageEl = elements.messagesContainer.querySelector(`[data-message-id="${id}"]`);
        if (messageEl) {
            messageEl.remove();
        }
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
        let accumulatedSources = []; // Accumulate sources from multiple chunks
        
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
                        if (data.tool_response) {
                            console.log('Tool response details:', JSON.stringify(data.tool_response, null, 2));
                        }
                        
                        if (data.response_text) {
                            fullText += data.response_text;
                            updateStreamingMessage(assistantMessageId, fullText, accumulatedSources);
                        }
                        
                        if (data.tool_response && data.tool_response.length > 0) {
                            // Accumulate sources from multiple chunks
                            console.log('Before accumulation:', accumulatedSources.length, 'sources');
                            console.log('New sources received:', data.tool_response.length);
                            
                            data.tool_response.forEach(newSource => {
                                // Check if source already exists (by source, text, and chunk_index)
                                const exists = accumulatedSources.some(existing => 
                                    existing.source === newSource.source && 
                                    existing.text === newSource.text &&
                                    existing.chunk_index === newSource.chunk_index
                                );
                                if (!exists) {
                                    accumulatedSources.push(newSource);
                                    console.log('Added new source:', newSource.source, 'chunk:', newSource.chunk_index);
                                } else {
                                    console.log('Skipped duplicate source:', newSource.source, 'chunk:', newSource.chunk_index);
                                }
                            });
                            
                            console.log('After accumulation:', accumulatedSources.length, 'sources');
                            updateStreamingMessage(assistantMessageId, fullText, accumulatedSources);
                        }
                    } catch (e) {
                        console.error('Error parsing SSE data:', e, dataMatch[1]);
                    }
                }
            }
        }
        
        finalizeStreamingMessage(assistantMessageId, fullText, accumulatedSources);
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
    const msg = {
        id: id,
        type: 'assistant',
        content: '',
        sources: [],
        streaming: true
    };
    
    // Check if this is second message (first assistant message)
    const isSecondMessage = messages.length === 1;
    
    messages.push(msg);
    state.messages[state.currentThreadId] = messages;
    
    // Create the message element immediately without re-rendering
    const messageEl = createMessageElement(msg);
    messageEl.setAttribute('data-message-id', id);
    
    // Add slide-up for second message, fade-in for others
    if (isSecondMessage) {
        messageEl.classList.add('slide-up');
    } else {
        messageEl.classList.add('fade-in');
    }
    
    elements.messagesContainer.appendChild(messageEl);
    scrollToBottom();
    
    return id;
}

// Update Streaming Message
function updateStreamingMessage(id, content, sources) {
    const threadId = state.currentThreadId;
    const messages = state.messages[threadId] || [];
    const msg = messages.find(m => m.id === id);
    if (msg) {
        msg.content = content;
        msg.sources = sources || [];
        
        // Save streaming state for this thread
        state.streamingStates[threadId] = {
            messageId: id,
            displayedText: content,
            sources: sources || []
        };
        
        // Update only the specific message instead of re-rendering all
        updateMessageElement(id, content, sources, true);
        
        // Auto-scroll if enabled
        scrollToBottom();
    }
}

// Flush streaming buffer and update UI
function flushStreamingBuffer(id, sources) {
    const buffer = state.streamingBuffers[id];
    if (!buffer) return;
    
    const newText = buffer.pendingText;
    const oldText = buffer.displayedText;
    
    // Only update if there's new text
    if (newText !== oldText) {
        buffer.displayedText = newText;
        updateMessageElement(id, newText, sources, true);
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
            // Get the new chunk
            const newChunk = textWithoutCursor.slice(displayedText.length);
            
            // Update the displayed text
            messageEl.dataset.displayedText = textWithoutCursor;
            
            // Render old content with markdown
            const oldHtml = displayedText ? renderMarkdown(displayedText) : '';
            contentWrapper.innerHTML = oldHtml;
            
            // Add new chunk as plain text with animation
            const newSpan = document.createElement('span');
            newSpan.className = 'streaming-text-chunk';
            newSpan.textContent = newChunk;
            contentWrapper.appendChild(newSpan);
            
            // After animation, re-render with full markdown
            setTimeout(() => {
                const fullHtml = renderMarkdown(textWithoutCursor);
                contentWrapper.innerHTML = fullHtml;
            }, 350);
            
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
    
    // Save the state of expanded sources before updating
    const expandedStates = {};
    if (sourcesContainer) {
        const sourcesList = sourcesContainer.querySelector('.sources-list');
        const isListExpanded = sourcesList && sourcesList.classList.contains('expanded');
        expandedStates.list = isListExpanded;
        
        // Save individual source expansion states
        const sourceItems = sourcesContainer.querySelectorAll('.source-item');
        sourceItems.forEach((item, idx) => {
            const content = item.querySelector('.source-content');
            if (content && content.classList.contains('expanded')) {
                expandedStates[idx] = true;
            }
        });
    }
    
    const sourcesHtml = `
        <div class="message-sources">
            <div class="sources-header" onclick="toggleSources(this)">
                <span class="sources-toggle ${expandedStates.list ? 'expanded' : ''}">▶</span>
                <span>Sources (${sources.length})</span>
            </div>
            <div class="sources-list ${expandedStates.list ? 'expanded' : ''}">
                ${sources.map((source, idx) => `
                    <div class="source-item">
                        <div class="source-header" onclick="toggleSourceContent(this)">
                            <span class="source-title">${source.source || `Source ${idx + 1}`}</span>
                            <button class="source-expand-btn">${expandedStates[idx] ? 'Collapse' : 'Expand'}</button>
                        </div>
                        <div class="source-content ${expandedStates[idx] ? 'expanded' : ''}">
                            ${escapeHtml(source.text || '')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    if (sourcesContainer) {
        // Update existing sources while preserving state
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
    const msg = {
        type: 'assistant',
        content: data.response_text || '',
        sources: data.tool_response || []
    };
    messages.push(msg);
    state.messages[state.currentThreadId] = messages;
    
    // Append the assistant message without re-rendering
    const messageEl = createMessageElement(msg);
    messageEl.classList.add('fade-in');
    elements.messagesContainer.appendChild(messageEl);
    scrollToBottom();
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
            <h2>Start a conversation!</h2>
            <p>Ask a question and get an answer with sources</p>
        </div>
    `;
}

// Check if user is at bottom of messages
function isAtBottom() {
    const threshold = 50; // pixels from bottom
    const scrollTop = elements.messagesContainer.scrollTop;
    const scrollHeight = elements.messagesContainer.scrollHeight;
    const clientHeight = elements.messagesContainer.clientHeight;
    return scrollHeight - scrollTop - clientHeight < threshold;
}

// Scroll to Bottom (only if auto-scroll is enabled)
function scrollToBottom(force = false) {
    if (force || state.autoScroll) {
        state.isProgrammaticScroll = true;
        requestAnimationFrame(() => {
            elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
            // Reset flag after scroll completes
            setTimeout(() => {
                state.isProgrammaticScroll = false;
            }, 100);
        });
    }
}

// Handle user scroll
function handleUserScroll() {
    // Don't update autoScroll if we're programmatically scrolling
    if (state.isProgrammaticScroll) {
        return;
    }
    
    state.isUserScrolling = true;
    
    // Check if user scrolled back to bottom
    if (isAtBottom()) {
        state.autoScroll = true;
    } else {
        state.autoScroll = false;
    }
    
    // Clear the scrolling flag after a delay
    clearTimeout(state.scrollTimeout);
    state.scrollTimeout = setTimeout(() => {
        state.isUserScrolling = false;
    }, 150);
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

// Sidebar Resize Functionality
function initSidebarResize() {
    const sidebar = document.getElementById('sidebar');
    const resizer = document.getElementById('sidebar-resizer');
    
    if (!sidebar || !resizer) return;
    
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const deltaX = e.clientX - startX;
        const newWidth = startWidth + deltaX;
        
        // Apply min/max constraints
        const minWidth = 250;
        const maxWidth = 600;
        const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
        
        sidebar.style.width = constrainedWidth + 'px';
        
        // Update grid template
        const chatInterface = document.querySelector('.chat-interface');
        if (chatInterface) {
            chatInterface.style.gridTemplateColumns = `${constrainedWidth}px auto 1fr`;
        }
    });
    
    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            // Save width to localStorage
            localStorage.setItem('sidebarWidth', sidebar.offsetWidth);
        }
    });
    
    // Restore saved width or use default
    const savedWidth = localStorage.getItem('sidebarWidth');
    const defaultWidth = 322;
    const width = savedWidth ? parseInt(savedWidth) : defaultWidth;
    
    sidebar.style.width = width + 'px';
    const chatInterface = document.querySelector('.chat-interface');
    if (chatInterface) {
        chatInterface.style.gridTemplateColumns = `${width}px auto 1fr`;
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', () => {
    init();
    initSidebarResize();
});