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
    activeStreams: {}, // Track active SSE streams per thread
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
    const maxAttempts = 60;
    let attempts = 0;
    let serverStarted = false;

    while (attempts < maxAttempts) {
        try {
            const response = await fetch(API.healthStatus, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Server responded - it has started
                serverStarted = true;
                
                if (data.is_ready) {
                    elements.loadingStatus.textContent = 'Server ready!';
                    await new Promise(resolve => setTimeout(resolve, 500));
                    showMainContainer();
                    return;
                } else {
                    // Show progress and status
                    const progressText = data.progress ? `${data.progress}%` : '';
                    const statusText = data.status || 'Loading...';
                    elements.loadingStatus.textContent = progressText ? `${statusText} (${progressText})` : statusText;
                }
                
                // Server is loading, check more frequently
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                // Server not ready yet
                if (!serverStarted) {
                    elements.loadingStatus.textContent = `Waiting for server to start... (${attempts + 1}/${maxAttempts})`;
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (error) {
            // Connection failed - server not started yet
            if (!serverStarted) {
                elements.loadingStatus.textContent = `Waiting for server to start... (${attempts + 1}/${maxAttempts})`;
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                // Server was running but now connection failed
                console.error('Lost connection to server:', error);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        attempts++;
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
        
        const threadName = thread.thread_name || thread.name || `Chat ${thread.thread_id.slice(0, 8)}`;
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
        // Don't abort streams - let them continue in background
        // This allows users to switch between chats while messages are being generated
        
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
            thread.thread_name = newName.trim();
            thread.name = newName.trim(); // Keep both for compatibility
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
    
    const deleteCount = state.selectedThreads.length;
    
    if (!confirm(`Delete ${deleteCount} selected chat(s)?`)) {
        return;
    }
    
    try {
        console.log('Deleting threads:', state.selectedThreads);
        console.log('Delete count:', deleteCount);
        
        // Delete all selected threads
        const deletePromises = state.selectedThreads.map(async threadId => {
            const response = await fetch(`${API.threads}/${threadId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            if (!response.ok) {
                console.error(`Failed to delete thread ${threadId}:`, response.status);
            }
            return response;
        });
        
        const results = await Promise.all(deletePromises);
        console.log('Delete results:', results.map(r => r.status));
        
        // If current thread was deleted, clear it
        if (state.selectedThreads.includes(state.currentThreadId)) {
            state.currentThreadId = null;
            clearMessages();
        }
        
        // Exit selection mode and reload threads
        exitSelectionMode();
        await loadThreads();
        
        console.log('Showing notification with count:', deleteCount);
        showNotification(`${deleteCount} chat(s) deleted`, 'success');
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
            console.log('[LOAD_MESSAGES] Streaming or loading in progress, skipping API reload');
            renderMessages();
            return;
        }
        
        console.log('[LOAD_MESSAGES] Loading messages from API for thread:', threadId);
        
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
    console.log('[RENDER_MESSAGES] Starting render for thread:', state.currentThreadId);
    elements.messagesContainer.innerHTML = '';
    
    const messages = state.messages[state.currentThreadId] || [];
    
    console.log('[RENDER_MESSAGES] Messages count:', messages.length);
    console.log('[RENDER_MESSAGES] Messages:', messages.map(m => ({ 
        type: m.type, 
        id: m.id, 
        streaming: m.streaming, 
        loading: m.loading,
        contentLength: m.content?.length || 0
    })));
    
    if (messages.length === 0) {
        elements.messagesContainer.innerHTML = `
            <div class="welcome-message">
                <h2>Start a conversation!</h2>
                <p>Ask a question and get an answer with sources</p>
            </div>
        `;
        return;
    }
    
    messages.forEach((msg, index) => {
        console.log(`[RENDER_MESSAGES] Creating element ${index + 1}/${messages.length}`);
        const messageEl = createMessageElement(msg);
        
        // Add data attribute for streaming/loading messages
        if (msg.id) {
            messageEl.setAttribute('data-message-id', msg.id);
            if (msg.threadId) {
                messageEl.setAttribute('data-thread-id', msg.threadId);
            }
            
            // Restore streaming state if exists
            if (msg.streaming) {
                const streamState = state.streamingStates[state.currentThreadId];
                if (streamState && streamState.messageId === msg.id) {
                    console.log('[RENDER_MESSAGES] Restoring streaming state, text length:', streamState.displayedText?.length);
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
                    
                    if (streamState.sources && streamState.sources.length > 0) {
                        updateMessageSources(messageEl, streamState.sources);
                    }
                }
            }
        }
        
        // Add fade-in animation for new messages
        if (!msg.streaming && !msg.loading) {
            messageEl.classList.add('fade-in');
        }
        
        elements.messagesContainer.appendChild(messageEl);
        console.log(`[RENDER_MESSAGES] Element ${index + 1} appended`);
    });
    
    console.log('[RENDER_MESSAGES] Render complete, scrolling to bottom');
    scrollToBottom();
}

// Create Message Element
function createMessageElement(msg) {
    console.log('[CREATE_ELEMENT] Type:', msg.type, 'Streaming:', msg.streaming, 'Loading:', msg.loading, 'Content:', msg.content?.substring(0, 50));
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${msg.type}`;
    
    let avatar;
    if (msg.type === 'user') {
        avatar = Icons.user;
    } else if (msg.type === 'error') {
        avatar = Icons.alertCircle || Icons.bot;
    } else {
        avatar = Icons.bot;
    }
    
    let sourcesHtml = '';
    if (msg.type === 'assistant' && msg.sources && msg.sources.length > 0) {
        console.log('[CREATE_ELEMENT] Adding sources:', msg.sources.length);
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
        console.log('[CREATE_ELEMENT] Creating streaming/loading message, has content:', !!msg.content);
        // For streaming/loading, create proper structure with wrapper and cursor
        const textContent = msg.content ? msg.content.replace(/<span class="typing-indicator">.*?<\/span>/, '') : '';
        const renderedContent = textContent ? renderMarkdown(textContent) : '';
        contentHtml = `<span class="streaming-content">${renderedContent}</span><span class="typing-indicator">▋</span>`;
        console.log('[CREATE_ELEMENT] Content HTML length:', contentHtml.length);
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
    
    console.log('[CREATE_ELEMENT] Element created successfully');
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
    
    // Save the thread ID at the moment of sending
    const targetThreadId = state.currentThreadId;
    
    // Add user message to the target thread
    addUserMessage(message, targetThreadId);
    elements.messageInput.value = '';
    autoResizeTextarea();
    
    // Disable input while processing
    disableInput();
    
    try {
        if (elements.streamingToggle.checked) {
            await streamMessage(message, targetThreadId);
        } else {
            await processMessage(message, targetThreadId);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Error sending message', 'error');
    } finally {
        enableInput();
    }
}

// Add User Message
function addUserMessage(content, targetThreadId) {
    const messages = state.messages[targetThreadId] || [];
    const isFirstMessage = messages.length === 0;
    
    messages.push({
        type: 'user',
        content: content
    });
    state.messages[targetThreadId] = messages;
    
    // Only update UI if this is the current thread
    if (targetThreadId === state.currentThreadId) {
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
        
        // Enable auto-scroll for new messages
        state.autoScroll = true;
        
        // Append the new message
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
}

// Process Message (Non-streaming)
async function processMessage(message, targetThreadId) {
    console.log('[PROCESS] Starting process for thread:', targetThreadId, 'Current thread:', state.currentThreadId);
    
    // Add loading message with cursor
    const loadingMessageId = addLoadingMessage(targetThreadId);
    
    try {
        const response = await fetch(API.processMessage, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });
        
        if (!response.ok) {
            // Check if it's a rate limit error
            if (response.status === 429) {
                const errorData = await response.json();
                let errorMessage = errorData.detail || 'Rate limit exceeded';
                
                // Try to extract retry_after from Retry-After header
                const retryAfter = response.headers.get('Retry-After');
                if (retryAfter) {
                    errorMessage += ` Please wait ${retryAfter} seconds before trying again.`;
                }
                
                removeLoadingMessage(loadingMessageId, targetThreadId);
                addErrorMessage(errorMessage, targetThreadId);
                return;
            }
            throw new Error('Failed to process message');
        }
        
        const data = await response.json();
        
        // Remove loading message
        removeLoadingMessage(loadingMessageId, targetThreadId);
        
        // Add actual response
        addAssistantMessage(data, targetThreadId);
    } catch (error) {
        // Remove loading message on error
        removeLoadingMessage(loadingMessageId, targetThreadId);
        throw error;
    }
}

// Add Loading Message
function addLoadingMessage(threadId) {
    console.log('[ADD_LOADING] Thread:', threadId, 'Current:', state.currentThreadId);
    const messages = state.messages[threadId] || [];
    const id = `${threadId}-${Date.now()}`;
    const msg = {
        id: id,
        type: 'assistant',
        content: '',
        sources: [],
        loading: true,
        threadId: threadId
    };
    
    const isSecondMessage = messages.length === 1;
    
    messages.push(msg);
    state.messages[threadId] = messages;
    
    // Only render if this is the current thread
    if (threadId === state.currentThreadId) {
        const messageEl = createMessageElement(msg);
        messageEl.setAttribute('data-message-id', id);
        messageEl.setAttribute('data-thread-id', threadId);
        
        if (isSecondMessage) {
            messageEl.classList.add('slide-up');
        } else {
            messageEl.classList.add('fade-in');
        }
        
        elements.messagesContainer.appendChild(messageEl);
        scrollToBottom();
    }
    
    return id;
}

// Remove Loading Message
function removeLoadingMessage(id, threadId) {
    console.log('[REMOVE_LOADING] ID:', id, 'Thread:', threadId, 'Current:', state.currentThreadId);
    const messages = state.messages[threadId] || [];
    const index = messages.findIndex(m => m.id === id);
    if (index !== -1) {
        messages.splice(index, 1);
        state.messages[threadId] = messages;
        
        // Always try to remove from DOM (it might be visible if user switched back)
        const messageEl = elements.messagesContainer.querySelector(`[data-message-id="${id}"]`);
        if (messageEl) {
            console.log('[REMOVE_LOADING] Removing element from DOM');
            messageEl.remove();
        } else {
            console.log('[REMOVE_LOADING] Element not in DOM (thread not active)');
        }
    }
}

// Stream Message (SSE)
async function streamMessage(message, targetThreadId) {
    console.log('[STREAM] Starting stream for thread:', targetThreadId, 'Current thread:', state.currentThreadId);
    const assistantMessageId = addStreamingMessage(targetThreadId);
    
    // Create AbortController for this stream
    const abortController = new AbortController();
    state.activeStreams[targetThreadId] = abortController;
    
    try {
        const response = await fetch(API.streamMessage, {
            signal: abortController.signal,
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
        let accumulatedSources = [];
        
        console.log('[STREAM] Starting to read response body');
        
        while (true) {
            const { done, value } = await reader.read();
            console.log('[STREAM] Read chunk, done:', done, 'value length:', value?.length);
            if (done) {
                console.log('[STREAM] Stream complete');
                break;
            }
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            
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
                        const eventType = eventMatch ? eventMatch[1] : 'chunk';
                        
                        console.log('[STREAM] Event:', eventType, 'Thread:', targetThreadId, 'Data:', data);
                        
                        if (eventType === 'error' || data.type === 'RateLimitError') {
                            removeStreamingMessage(assistantMessageId, targetThreadId);
                            
                            let errorMessage = data.error || 'An error occurred';
                            if (data.retry_after) {
                                errorMessage += ` Please wait ${data.retry_after} seconds before trying again.`;
                            }
                            
                            addErrorMessage(errorMessage, targetThreadId);
                            enableInput();
                            return;
                        }
                        
                        if (data.response_text) {
                            fullText += data.response_text;
                            console.log('[STREAM] Updating text, length:', fullText.length);
                            updateStreamingMessage(assistantMessageId, fullText, accumulatedSources, targetThreadId);
                        }
                        
                        if (data.tool_response && data.tool_response.length > 0) {
                            data.tool_response.forEach(newSource => {
                                const exists = accumulatedSources.some(existing => 
                                    existing.source === newSource.source && 
                                    existing.text === newSource.text &&
                                    existing.chunk_index === newSource.chunk_index
                                );
                                if (!exists) {
                                    accumulatedSources.push(newSource);
                                }
                            });
                            console.log('[STREAM] Total sources:', accumulatedSources.length);
                            updateStreamingMessage(assistantMessageId, fullText, accumulatedSources, targetThreadId);
                        }
                    } catch (e) {
                        console.error('[STREAM] Error parsing SSE data:', e, dataMatch[1]);
                    }
                }
            }
        }
        
        console.log('[STREAM] Stream reading complete for thread:', targetThreadId);
        console.log('[STREAM] Final text length:', fullText.length, 'Total sources:', accumulatedSources.length);
        console.log('[STREAM] Finalizing message for thread:', targetThreadId);
        finalizeStreamingMessage(assistantMessageId, fullText, accumulatedSources, targetThreadId);
        console.log('[STREAM] Stream fully completed for thread:', targetThreadId);
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('[STREAM] Stream aborted for thread:', targetThreadId);
            // Don't remove the message - keep partial content
            console.log('[STREAM] Keeping partial message, finalizing with current content');
            const messages = state.messages[targetThreadId] || [];
            const msg = messages.find(m => m.id === assistantMessageId);
            if (msg && msg.content) {
                // Finalize with whatever content we have
                finalizeStreamingMessage(assistantMessageId, msg.content, msg.sources || [], targetThreadId);
            } else {
                // No content yet, remove the message
                removeStreamingMessage(assistantMessageId, targetThreadId);
            }
            return;
        }
        console.error('[STREAM] Error:', error);
        removeStreamingMessage(assistantMessageId, targetThreadId);
        throw error;
    } finally {
        delete state.activeStreams[targetThreadId];
        if (state.streamingStates[targetThreadId]) {
            delete state.streamingStates[targetThreadId];
        }
    }
}

// Add Streaming Message
function addStreamingMessage(threadId) {
    console.log('[ADD_STREAMING] Thread:', threadId, 'Current:', state.currentThreadId);
    const messages = state.messages[threadId] || [];
    const id = `${threadId}-${Date.now()}`;
    const msg = {
        id: id,
        type: 'assistant',
        content: '',
        sources: [],
        streaming: true,
        threadId: threadId
    };
    
    const isSecondMessage = messages.length === 1;
    
    messages.push(msg);
    state.messages[threadId] = messages;
    
    console.log('[ADD_STREAMING] Message added to state, messages count:', messages.length);
    
    // Only render if this is the current thread
    if (threadId === state.currentThreadId) {
        console.log('[ADD_STREAMING] Creating DOM element');
        const messageEl = createMessageElement(msg);
        messageEl.setAttribute('data-message-id', id);
        messageEl.setAttribute('data-thread-id', threadId);
        
        if (isSecondMessage) {
            messageEl.classList.add('slide-up');
        } else {
            messageEl.classList.add('fade-in');
        }
        
        elements.messagesContainer.appendChild(messageEl);
        console.log('[ADD_STREAMING] Element appended to DOM');
        scrollToBottom();
    } else {
        console.log('[ADD_STREAMING] Not current thread, skipping DOM update');
    }
    
    return id;
}

// Update Streaming Message
function updateStreamingMessage(id, content, sources, threadId) {
    console.log('[UPDATE_STREAMING] ID:', id, 'Thread:', threadId, 'Current:', state.currentThreadId, 'Content length:', content.length);
    const messages = state.messages[threadId] || [];
    const msg = messages.find(m => m.id === id);
    
    if (!msg) {
        console.error('[UPDATE_STREAMING] Message not found in state!');
        return;
    }
    
    msg.content = content;
    msg.sources = sources || [];
    
    // Save streaming state for this thread
    state.streamingStates[threadId] = {
        messageId: id,
        displayedText: content,
        sources: sources || []
    };
    
    // Only update UI if this is the current thread
    if (threadId === state.currentThreadId) {
        console.log('[UPDATE_STREAMING] Updating DOM element');
        updateMessageElement(id, content, sources, true);
        scrollToBottom();
    } else {
        console.log('[UPDATE_STREAMING] Not current thread, skipping DOM update');
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
        console.error('[UPDATE_ELEMENT] Message element not found in DOM! ID:', id);
        const threadId = id.split('-')[0];
        const allMessages = container.querySelectorAll(`[data-thread-id="${threadId}"]`);
        console.log('[UPDATE_ELEMENT] Found', allMessages.length, 'messages for thread', threadId);
        return;
    }
    
    console.log('[UPDATE_ELEMENT] Updating element, content length:', content.length);
    
    const messageText = messageEl.querySelector('.message-text');
    if (!messageText) {
        console.error('[UPDATE_ELEMENT] .message-text not found!');
        return;
    }
    
    const textWithoutCursor = content.replace(/<span class="typing-indicator">.*?<\/span>/, '');
    
    // Get or create content wrapper and cursor
    let contentWrapper = messageText.querySelector('.streaming-content');
    let cursor = messageText.querySelector('.typing-indicator');
    
    if (!contentWrapper || !cursor) {
        console.log('[UPDATE_ELEMENT] Creating streaming structure');
        // Create structure if it doesn't exist
        contentWrapper = document.createElement('span');
        contentWrapper.className = 'streaming-content';
        
        cursor = document.createElement('span');
        cursor.className = 'typing-indicator';
        cursor.textContent = '▋';
        
        messageText.innerHTML = '';
        messageText.appendChild(contentWrapper);
        messageText.appendChild(cursor);
        
        messageEl.dataset.displayedText = '';
    }
    
    // Get the currently displayed text
    const displayedText = messageEl.dataset.displayedText || '';
    
    // Only process if there's new content
    if (textWithoutCursor.length > displayedText.length) {
        console.log('[UPDATE_ELEMENT] New content detected, old length:', displayedText.length, 'new length:', textWithoutCursor.length);
        const newChunk = textWithoutCursor.slice(displayedText.length);
        
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
    } else {
        console.log('[UPDATE_ELEMENT] No new content to display');
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
function finalizeStreamingMessage(id, content, sources, threadId) {
    console.log('[FINALIZE_STREAMING] ID:', id, 'Thread:', threadId, 'Current:', state.currentThreadId);
    console.log('[FINALIZE_STREAMING] Content length:', content.length, 'Sources:', sources?.length || 0);
    const messages = state.messages[threadId] || [];
    const msg = messages.find(m => m.id === id);
    
    if (!msg) {
        console.error('[FINALIZE_STREAMING] Message not found in state!');
        return;
    }
    
    msg.content = content;
    msg.sources = sources;
    msg.streaming = false;
    delete msg.threadId;
    delete msg.id;
    
    console.log('[FINALIZE_STREAMING] Message finalized, total messages in thread:', messages.length);
    
    // Only update UI if this is the current thread
    if (threadId === state.currentThreadId) {
        const messageEl = elements.messagesContainer.querySelector(`[data-message-id="${id}"]`);
        if (messageEl) {
            console.log('[FINALIZE_STREAMING] Removing cursor and finalizing');
            const messageText = messageEl.querySelector('.message-text');
            if (messageText) {
                messageText.innerHTML = renderMarkdown(content);
            }
            messageEl.removeAttribute('data-message-id');
            messageEl.removeAttribute('data-thread-id');
        } else {
            console.error('[FINALIZE_STREAMING] Message element not found in DOM!');
        }
    }
    
    // Clear streaming state for this thread
    if (state.streamingStates[threadId]) {
        delete state.streamingStates[threadId];
    }
}

// Remove Streaming Message
function removeStreamingMessage(id, threadId) {
    console.log('[REMOVE_STREAMING] ID:', id, 'Thread:', threadId, 'Current:', state.currentThreadId);
    const messages = state.messages[threadId] || [];
    const index = messages.findIndex(m => m.id === id);
    if (index !== -1) {
        messages.splice(index, 1);
        state.messages[threadId] = messages;
        
        // Only update DOM if this is the current thread
        if (threadId === state.currentThreadId) {
            const messageEl = elements.messagesContainer.querySelector(`[data-message-id="${id}"]`);
            if (messageEl) {
                console.log('[REMOVE_STREAMING] Removing element from DOM');
                messageEl.remove();
            }
        }
    }
}

// Add Assistant Message
function addAssistantMessage(data, targetThreadId) {
    const messages = state.messages[targetThreadId] || [];
    const msg = {
        type: 'assistant',
        content: data.response_text || '',
        sources: data.tool_response || []
    };
    messages.push(msg);
    state.messages[targetThreadId] = messages;
    
    // Only update UI if this is the current thread
    if (targetThreadId === state.currentThreadId) {
        const messageEl = createMessageElement(msg);
        messageEl.classList.add('fade-in');
        elements.messagesContainer.appendChild(messageEl);
        scrollToBottom();
    }
}

// Add Error Message
function addErrorMessage(errorText, targetThreadId) {
    const messages = state.messages[targetThreadId] || [];
    const msg = {
        type: 'error',
        content: errorText,
        sources: []
    };
    messages.push(msg);
    state.messages[targetThreadId] = messages;
    
    // Only update UI if this is the current thread
    if (targetThreadId === state.currentThreadId) {
        const messageEl = createMessageElement(msg);
        messageEl.classList.add('fade-in');
        elements.messagesContainer.appendChild(messageEl);
        scrollToBottom();
    }
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
    
    // Remove any existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notif => {
        notif.classList.remove('show');
        setTimeout(() => {
            notif.remove();
        }, 300);
    });
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add to body
    document.body.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Remove after 2 seconds (longer for errors)
    const duration = type === 'error' ? 5000 : 2000;
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, duration);
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