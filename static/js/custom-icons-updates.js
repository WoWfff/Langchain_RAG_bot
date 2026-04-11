// Custom Icons JavaScript Updates
// Add this to main.js or load after main.js

// Update elements object
Object.assign(elements, {
    selectionModeCheckbox: document.getElementById('selection-mode-checkbox'),
    selectAllBtn: document.getElementById('select-all-btn'),
    selectAllCheckbox: document.getElementById('select-all-checkbox')
});

// Remove old selection mode functions and replace with new ones
const oldEnterSelectionMode = enterSelectionMode;
const oldExitSelectionMode = exitSelectionMode;
const oldToggleThreadSelection = toggleThreadSelection;

// Toggle Selection Mode
function toggleSelectionMode() {
    const isChecked = elements.selectionModeCheckbox.checked;
    
    if (isChecked) {
        // Enter selection mode
        state.selectionMode = true;
        state.selectedThreads = [];
        
        // Reset select all checkbox
        if (elements.selectAllCheckbox) {
            elements.selectAllCheckbox.checked = false;
        }
        
        // Show/hide buttons
        elements.selectAllBtn.style.display = 'block';
        elements.deleteSelectedBtn.style.display = 'block';
        elements.newChatBtn.style.display = 'none';
        
        // Add selection-mode class to threads list
        elements.threadsList.classList.add('selection-mode');
    } else {
        // Exit selection mode
        state.selectionMode = false;
        state.selectedThreads = [];
        
        // Reset select all checkbox
        if (elements.selectAllCheckbox) {
            elements.selectAllCheckbox.checked = false;
        }
        
        // Show/hide buttons
        elements.selectAllBtn.style.display = 'none';
        elements.deleteSelectedBtn.style.display = 'none';
        elements.newChatBtn.style.display = 'block';
        
        // Remove selection-mode class
        elements.threadsList.classList.remove('selection-mode');
    }
    
    renderThreads();
}

// Select All Threads
function selectAllThreads() {
    const isChecked = elements.selectAllCheckbox.checked;
    
    if (isChecked) {
        // Select all threads
        state.selectedThreads = state.threads.map(thread => thread.thread_id);
    } else {
        // Deselect all
        state.selectedThreads = [];
    }
    
    renderThreads();
}

// Update Select All Checkbox based on selection state
function updateSelectAllCheckbox() {
    if (elements.selectAllCheckbox && state.threads.length > 0) {
        // Check if all threads are selected
        const allSelected = state.selectedThreads.length === state.threads.length;
        elements.selectAllCheckbox.checked = allSelected;
    }
}

// Override toggleThreadSelection to update select all checkbox
const originalToggleThreadSelection = toggleThreadSelection;
function toggleThreadSelection(threadId) {
    const index = state.selectedThreads.indexOf(threadId);
    
    if (index > -1) {
        state.selectedThreads.splice(index, 1);
    } else {
        state.selectedThreads.push(threadId);
    }
    
    // Update select all checkbox state
    updateSelectAllCheckbox();
    
    renderThreads();
}

// Reset Selection Mode on page load
function resetSelectionMode() {
    // Ensure selection mode is off on page load
    if (elements.selectionModeCheckbox) {
        elements.selectionModeCheckbox.checked = false;
    }
    if (elements.selectAllCheckbox) {
        elements.selectAllCheckbox.checked = false;
    }
    state.selectionMode = false;
    state.selectedThreads = [];
    
    // Ensure correct button visibility
    if (elements.selectAllBtn) elements.selectAllBtn.style.display = 'none';
    if (elements.deleteSelectedBtn) elements.deleteSelectedBtn.style.display = 'none';
    if (elements.newChatBtn) elements.newChatBtn.style.display = 'block';
    
    // Remove selection-mode class if present
    if (elements.threadsList) {
        elements.threadsList.classList.remove('selection-mode');
    }
}

// Update theme toggle to work with new switch
function applyTheme() {
    const themeCheckbox = document.getElementById('theme-toggle');
    if (state.theme === 'light') {
        document.body.setAttribute('data-theme', 'light');
        if (themeCheckbox) {
            themeCheckbox.checked = false; // Light theme = unchecked (sun visible)
        }
    } else {
        document.body.removeAttribute('data-theme');
        if (themeCheckbox) {
            themeCheckbox.checked = true; // Dark theme = checked (moon visible)
        }
    }
}

// Update setupEventListeners
const originalSetupEventListeners = setupEventListeners;
function setupEventListeners() {
    elements.startChatBtn.addEventListener('click', showChatInterface);
    elements.newChatBtn.addEventListener('click', createNewThread);
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keydown', handleInputKeydown);
    elements.messageInput.addEventListener('input', autoResizeTextarea);
    elements.themeToggle.addEventListener('click', toggleTheme);
    elements.backToLanding.addEventListener('click', showLandingPage);
    
    // Selection mode toggle
    if (elements.selectionModeCheckbox) {
        elements.selectionModeCheckbox.addEventListener('change', toggleSelectionMode);
    }
    if (elements.selectAllCheckbox) {
        elements.selectAllCheckbox.addEventListener('change', selectAllThreads);
    }
    elements.deleteSelectedBtn.addEventListener('click', deleteSelectedThreads);
    
    // Handle user scroll
    elements.messagesContainer.addEventListener('scroll', handleUserScroll);
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.thread-actions')) {
            closeAllDropdowns();
        }
    });
}

// Update init function
const originalInit = init;
async function init() {
    applyTheme(); // Apply theme first
    initializeIcons();
    await checkServerHealth();
    setupEventListeners();
    addRippleEffects();
    resetSelectionMode();
}

// Update showChatInterface to reset selection mode
const originalShowChatInterface = showChatInterface;
async function showChatInterface() {
    elements.landingPage.classList.add('hidden');
    elements.chatInterface.classList.remove('hidden');
    
    // Reset selection mode when entering chat interface
    resetSelectionMode();
    
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

// Update showLandingPage to reset selection mode
const originalShowLandingPage = showLandingPage;
function showLandingPage() {
    elements.chatInterface.classList.add('hidden');
    elements.landingPage.classList.remove('hidden');
    state.currentThreadId = null;
    
    // Reset selection mode if active
    if (state.selectionMode) {
        elements.selectionModeCheckbox.checked = false;
        state.selectionMode = false;
        state.selectedThreads = [];
        
        // Reset button visibility
        elements.selectAllBtn.style.display = 'none';
        elements.deleteSelectedBtn.style.display = 'none';
        elements.newChatBtn.style.display = 'block';
        
        // Remove selection-mode class
        elements.threadsList.classList.remove('selection-mode');
    }
}

// Update deleteSelectedThreads
const originalDeleteSelectedThreads = deleteSelectedThreads;
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
        elements.selectionModeCheckbox.checked = false;
        toggleSelectionMode();
        await loadThreads();
        
        console.log('Showing notification with count:', deleteCount);
        showNotification(`${deleteCount} chat(s) deleted`, 'success');
    } catch (error) {
        console.error('Error deleting threads:', error);
        showNotification('Error deleting chats', 'error');
    }
}

console.log('Custom icons JavaScript updates loaded');