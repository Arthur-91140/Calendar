// Configuration et variables globales
const API_BASE = '';
let currentToken = localStorage.getItem('calendar_token');
let currentUser = localStorage.getItem('calendar_user');
let currentUserEmail = localStorage.getItem('calendar_email');
let currentDate = new Date();
let currentView = 'month'; // 'day', 'week', 'month'
let events = [];
let favoriteLocations = [];
let deferredPrompt = null;

// Éléments DOM cachés pour performance
const DOM = {};

// Initialisation de l'app
document.addEventListener('DOMContentLoaded', function() {
    initializeDOM();
    initializeApp();
    setupEventListeners();
    setupPWA();
    
    if (currentToken) {
        showCalendar();
        loadEvents();
        loadFavoriteLocations();
    } else {
        showAuthButtons();
    }
});

function initializeDOM() {
    // Cache des éléments DOM pour éviter les requêtes répétées
    DOM.authModal = document.getElementById('auth-modal');
    DOM.eventModal = document.getElementById('event-modal');
    DOM.settingsModal = document.getElementById('settings-modal');
    DOM.authButtons = document.getElementById('auth-buttons');
    DOM.userSection = document.getElementById('user-section');
    DOM.calendarControls = document.getElementById('calendar-controls');
    DOM.calendarContainer = document.getElementById('calendar-container');
    DOM.loading = document.getElementById('loading');
    DOM.notifications = document.getElementById('notifications');
    DOM.installPrompt = document.getElementById('install-prompt');
    
    // Vues du calendrier
    DOM.monthView = document.getElementById('month-view');
    DOM.weekView = document.getElementById('week-view');
    DOM.dayView = document.getElementById('day-view');
    
    // Contrôles
    DOM.currentPeriod = document.getElementById('current-period');
    DOM.viewButtons = {
        day: document.getElementById('day-view-btn'),
        week: document.getElementById('week-view-btn'),
        month: document.getElementById('month-view-btn')
    };
}

function initializeApp() {
    if (currentToken && currentUser) {
        document.getElementById('username-display').textContent = currentUser;
    }
    
    // Initialiser les créneaux horaires pour les vues semaine/jour
    initializeTimeSlots();
    
    // Charger les paramètres utilisateur
    loadUserSettings();
}

function setupEventListeners() {
    // Auth events
    document.getElementById('login-btn').addEventListener('click', () => showAuthModal('login'));
    document.getElementById('register-btn').addEventListener('click', () => showAuthModal('register'));
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('settings-btn').addEventListener('click', showSettingsModal);
    
    // Modal events
    document.getElementById('close-modal').addEventListener('click', hideAuthModal);
    document.getElementById('close-event-modal').addEventListener('click', hideEventModal);
    document.getElementById('close-settings-modal').addEventListener('click', hideSettingsModal);
    
    // Auth form switches
    document.getElementById('switch-to-register').addEventListener('click', () => switchAuthForm('register'));
    document.getElementById('switch-to-login').addEventListener('click', () => switchAuthForm('login'));
    
    // Form submissions
    document.getElementById('login-form-element').addEventListener('submit', handleLogin);
    document.getElementById('register-form-element').addEventListener('submit', handleRegister);
    document.getElementById('event-form').addEventListener('submit', handleEventSubmit);
    document.getElementById('location-form').addEventListener('submit', handleLocationSubmit);
    document.getElementById('share-form').addEventListener('submit', handleShareSubmit);
    
    // Calendar navigation
    document.getElementById('prev-period').addEventListener('click', () => navigatePeriod(-1));
    document.getElementById('next-period').addEventListener('click', () => navigatePeriod(1));
    document.getElementById('today-btn').addEventListener('click', goToToday);
    document.getElementById('add-event-btn').addEventListener('click', () => showEventModal());
    document.getElementById('delete-event-btn').addEventListener('click', handleEventDelete);
    
    // View switching
    Object.entries(DOM.viewButtons).forEach(([view, button]) => {
        button.addEventListener('click', () => switchView(view));
    });
    
    // Settings tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });
    
    // Event form enhancements
    setupEventFormListeners();
    
    // PWA install
    document.getElementById('install-btn').addEventListener('click', installPWA);
    document.getElementById('dismiss-install').addEventListener('click', dismissInstallPrompt);
    
    // Close modals on outside click
    window.addEventListener('click', function(event) {
        if (event.target === DOM.authModal) hideAuthModal();
        if (event.target === DOM.eventModal) hideEventModal();
        if (event.target === DOM.settingsModal) hideSettingsModal();
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Notification clicks
    DOM.notifications.addEventListener('click', (e) => {
        if (e.target.classList.contains('notification')) {
            e.target.remove();
        }
    });
}

function setupEventFormListeners() {
    // All-day toggle
    document.getElementById('event-all-day').addEventListener('change', function() {
        const startInput = document.getElementById('event-start');
        const endInput = document.getElementById('event-end');
        
        if (this.checked) {
            startInput.type = 'date';
            endInput.type = 'date';
        } else {
            startInput.type = 'datetime-local';
            endInput.type = 'datetime-local';
        }
    });
    
    // Recurrence options
    document.getElementById('recurrence-frequency').addEventListener('change', function() {
        const options = document.getElementById('recurrence-options');
        const weeklyOptions = document.getElementById('weekly-options');
        
        if (this.value === 'never') {
            options.classList.add('hidden');
        } else {
            options.classList.remove('hidden');
            
            if (this.value === 'weekly' || this.value === 'custom') {
                weeklyOptions.classList.remove('hidden');
            } else {
                weeklyOptions.classList.add('hidden');
            }
        }
    });
    
    // Notification toggles
    document.getElementById('notification-email').addEventListener('change', function() {
        document.getElementById('email-timing').classList.toggle('hidden', !this.checked);
    });
    
    document.getElementById('notification-push').addEventListener('change', function() {
        document.getElementById('push-timing').classList.toggle('hidden', !this.checked);
    });
    
    // Copy share link
    document.getElementById('copy-share-link').addEventListener('click', function() {
        const input = document.getElementById('share-link');
        input.select();
        document.execCommand('copy');
        showNotification('Lien copié dans le presse-papiers !', 'success');
    });
}

function setupPWA() {
    // Détecter si l'app peut être installée
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Afficher le prompt d'installation après 5 secondes si pas déjà installé
        setTimeout(() => {
            if (!window.matchMedia('(display-mode: standalone)').matches) {
                DOM.installPrompt.classList.remove('hidden');
            }
        }, 5000);
    });
    
    // Détecter si l'app a été installée
    window.addEventListener('appinstalled', () => {
        DOM.installPrompt.classList.add('hidden');
        showNotification('Application installée avec succès !', 'success');
    });
}

function handleKeyboardShortcuts(event) {
    // Raccourcis clavier
    if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
            case 'n':
                event.preventDefault();
                showEventModal();
                break;
            case '1':
                event.preventDefault();
                switchView('day');
                break;
            case '2':
                event.preventDefault();
                switchView('week');
                break;
            case '3':
                event.preventDefault();
                switchView('month');
                break;
            case 't':
                event.preventDefault();
                goToToday();
                break;
        }
    }
    
    // Navigation avec les flèches
    if (!event.target.matches('input, textarea, select')) {
        switch (event.key) {
            case 'ArrowLeft':
                navigatePeriod(-1);
                break;
            case 'ArrowRight':
                navigatePeriod(1);
                break;
            case 'Escape':
                // Fermer les modales ouvertes
                if (!DOM.authModal.classList.contains('hidden')) hideAuthModal();
                if (!DOM.eventModal.classList.contains('hidden')) hideEventModal();
                if (!DOM.settingsModal.classList.contains('hidden')) hideSettingsModal();
                break;
        }
    }
}

// Utilitaires
function showLoading() {
    DOM.loading.classList.remove('hidden');
}

function hideLoading() {
    DOM.loading.classList.add('hidden');
}

function showNotification(message, type = 'info', duration = 5000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    DOM.notifications.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, duration);
}

function formatDate(date) {
    return date.toISOString().slice(0, 16);
}

function formatDateForInput(date) {
    return date.toISOString().slice(0, 10);
}

function parseDate(dateString) {
    return new Date(dateString);
}

// API calls améliorées
async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE}/api${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };
    
    if (currentToken) {
        config.headers['Authorization'] = `Bearer ${currentToken}`;
    }
    
    try {
        showLoading();
        const response = await fetch(url, config);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.detail || 'Erreur API');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        if (error.message.includes('401') || error.message.includes('Token')) {
            logout();
        }
        throw error;
    } finally {
        hideLoading();
    }
}

// Authentication
function showAuthButtons() {
    DOM.authButtons.classList.remove('hidden');
    DOM.userSection.classList.add('hidden');
    DOM.calendarControls.classList.add('hidden');
    DOM.calendarContainer.classList.add('hidden');
    document.getElementById('settings-btn').classList.add('hidden');
}

function showCalendar() {
    DOM.authButtons.classList.add('hidden');
    DOM.userSection.classList.remove('hidden');
    DOM.calendarControls.classList.remove('hidden');
    DOM.calendarContainer.classList.remove('hidden');
    document.getElementById('settings-btn').classList.remove('hidden');
    updatePeriodHeader();
    renderCurrentView();
}

function showAuthModal(type) {
    document.getElementById('login-form').classList.toggle('hidden', type !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', type !== 'register');
    DOM.authModal.classList.remove('hidden');
}

function hideAuthModal() {
    DOM.authModal.classList.add('hidden');
}

function switchAuthForm(type) {
    document.getElementById('login-form').classList.toggle('hidden', type !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', type !== 'register');
}

async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await apiCall('/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        
        currentToken = response.token;
        currentUser = username;
        currentUserEmail = response.email;
        
        localStorage.setItem('calendar_token', currentToken);
        localStorage.setItem('calendar_user', currentUser);
        localStorage.setItem('calendar_email', currentUserEmail);
        
        document.getElementById('username-display').textContent = currentUser;
        hideAuthModal();
        showCalendar();
        loadEvents();
        loadFavoriteLocations();
        showNotification('Connexion réussie !', 'success');
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function handleRegister(event) {
    event.preventDefault();
    
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    try {
        const response = await apiCall('/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password })
        });
        
        currentToken = response.token;
        currentUser = username;
        currentUserEmail = email;
        
        localStorage.setItem('calendar_token', currentToken);
        localStorage.setItem('calendar_user', currentUser);
        localStorage.setItem('calendar_email', currentUserEmail);
        
        document.getElementById('username-display').textContent = currentUser;
        hideAuthModal();
        showCalendar();
        loadEvents();
        loadFavoriteLocations();
        showNotification('Inscription réussie !', 'success');
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function logout() {
    currentToken = null;
    currentUser = null;
    currentUserEmail = null;
    localStorage.removeItem('calendar_token');
    localStorage.removeItem('calendar_user');
    localStorage.removeItem('calendar_email');
    events = [];
    favoriteLocations = [];
    showAuthButtons();
    showNotification('Déconnexion réussie !', 'info');
}

// Calendar views management
function switchView(view) {
    currentView = view;
    
    // Update button states
    Object.entries(DOM.viewButtons).forEach(([v, button]) => {
        button.classList.toggle('active', v === view);
    });
    
    // Show/hide views
    DOM.monthView.classList.toggle('active', view === 'month');
    DOM.weekView.classList.toggle('active', view === 'week');
    DOM.dayView.classList.toggle('active', view === 'day');
    
    updatePeriodHeader();
    renderCurrentView();
}

function updatePeriodHeader() {
    const monthNames = [
        'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
    ];
    
    let headerText = '';
    
    switch (currentView) {
        case 'day':
            headerText = currentDate.toLocaleDateString('fr-FR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            break;
        case 'week':
            const startOfWeek = getStartOfWeek(currentDate);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            
            if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
                headerText = `${startOfWeek.getDate()}-${endOfWeek.getDate()} ${monthNames[startOfWeek.getMonth()]} ${startOfWeek.getFullYear()}`;
            } else {
                headerText = `${startOfWeek.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${endOfWeek.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
            }
            break;
        case 'month':
            headerText = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
            break;
    }
    
    DOM.currentPeriod.textContent = headerText;
}

function renderCurrentView() {
    switch (currentView) {
        case 'day':
            renderDayView();
            break;
        case 'week':
            renderWeekView();
            break;
        case 'month':
            renderMonthView();
            break;
    }
}

function navigatePeriod(direction) {
    switch (currentView) {
        case 'day':
            currentDate.setDate(currentDate.getDate() + direction);
            break;
        case 'week':
            currentDate.setDate(currentDate.getDate() + (direction * 7));
            break;
        case 'month':
            currentDate.setMonth(currentDate.getMonth() + direction);
            break;
    }
    
    updatePeriodHeader();
    renderCurrentView();
}

function goToToday() {
    currentDate = new Date();
    updatePeriodHeader();
    renderCurrentView();
}

// Vue Mois (code existant amélioré)
function renderMonthView() {
    const grid = document.getElementById('month-grid');
    
    // Clear existing calendar days
    const existingDays = grid.querySelectorAll('.calendar-day');
    existingDays.forEach(day => day.remove());
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const startDate = new Date(firstDay);
    const dayOfWeek = (firstDay.getDay() + 6) % 7;
    startDate.setDate(startDate.getDate() - dayOfWeek);
    
    for (let i = 0; i < 42; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        
        const dayElement = createDayElement(date, month);
        grid.appendChild(dayElement);
    }
}

function createDayElement(date, currentMonth) {
    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day';
    dayElement.tabIndex = 0;
    dayElement.setAttribute('role', 'button');
    dayElement.setAttribute('aria-label', `${date.toLocaleDateString('fr-FR')}`);
    
    const isCurrentMonth = date.getMonth() === currentMonth;
    const isToday = date.toDateString() === new Date().toDateString();
    
    if (!isCurrentMonth) {
        dayElement.classList.add('other-month');
    }
    
    if (isToday) {
        dayElement.classList.add('today');
    }
    
    // Day number
    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = date.getDate();
    dayElement.appendChild(dayNumber);
    
    // Events container
    const eventsContainer = document.createElement('div');
    eventsContainer.className = 'day-events';
    dayElement.appendChild(eventsContainer);
    
    // Add events for this day
    const dayEvents = events.filter(event => {
        const eventDate = parseDate(event.start_datetime);
        return eventDate.toDateString() === date.toDateString();
    });
    
    dayEvents.slice(0, 3).forEach(event => { // Limite à 3 événements visibles
        const eventElement = document.createElement('div');
        eventElement.className = 'event-item';
        eventElement.style.backgroundColor = event.color;
        eventElement.textContent = event.title;
        eventElement.addEventListener('click', (e) => {
            e.stopPropagation();
            showEventModal(event);
        });
        eventsContainer.appendChild(eventElement);
    });
    
    // Show "more" indicator if there are additional events
    if (dayEvents.length > 3) {
        const moreElement = document.createElement('div');
        moreElement.className = 'event-item';
        moreElement.style.backgroundColor = '#666';
        moreElement.textContent = `+${dayEvents.length - 3} autres`;
        moreElement.addEventListener('click', (e) => {
            e.stopPropagation();
            // TODO: Show day detail view
        });
        eventsContainer.appendChild(moreElement);
    }
    
    // Click to add event
    dayElement.addEventListener('click', () => {
        const newEvent = {
            start_datetime: formatDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0)),
            end_datetime: formatDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 10, 0))
        };
        showEventModal(newEvent);
    });
    
    // Keyboard navigation
    dayElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            dayElement.click();
        }
    });
    
    return dayElement;
}

// Vue Semaine
function renderWeekView() {
    const container = document.getElementById('week-days');
    container.innerHTML = '';
    
    const startOfWeek = getStartOfWeek(currentDate);
    const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        
        const dayColumn = document.createElement('div');
        dayColumn.className = 'week-day';
        
        const dayHeader = document.createElement('div');
        dayHeader.className = 'week-day-header';
        dayHeader.innerHTML = `
            <div>${dayNames[i]}</div>
            <div class="day-number">${date.getDate()}</div>
        `;
        
        if (date.toDateString() === new Date().toDateString()) {
            dayHeader.classList.add('today');
        }
        
        dayColumn.appendChild(dayHeader);
        
        const dayContent = document.createElement('div');
        dayContent.className = 'week-day-content';
        
        for (let hour = 0; hour < 24; hour++) {
            const hourLine = document.createElement('div');
            hourLine.className = 'week-hour-line';
            hourLine.style.top = `${hour * 40}px`;
            dayContent.appendChild(hourLine);
        }
        
        const dayEvents = events.filter(event => {
            const eventDate = parseDate(event.start_datetime);
            return eventDate.toDateString() === date.toDateString();
        });
        
        dayEvents.forEach(event => {
            const eventElement = createWeekEventElement(event);
            dayContent.appendChild(eventElement);
        });
        
        dayContent.addEventListener('click', (e) => {
            if (e.target === dayContent) {
                const rect = dayContent.getBoundingClientRect();
                const y = e.clientY - rect.top;
                const hour = Math.floor(y / 40);
                const minutes = Math.round(((y % 40) / 40) * 60);
                
                const newEvent = {
                    start_datetime: formatDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minutes)),
                    end_datetime: formatDate(new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour + 1, minutes))
                };
                showEventModal(newEvent);
            }
        });
        
        dayColumn.appendChild(dayContent);
        container.appendChild(dayColumn);
    }
    
    addCurrentTimeLine();
}

// Vue Jour
function renderDayView() {
    const dayHeader = document.getElementById('day-header-single');
    const dayContent = document.getElementById('day-content');
    
    dayHeader.textContent = currentDate.toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    dayContent.innerHTML = '';
    
    for (let hour = 0; hour < 24; hour++) {
        const hourLine = document.createElement('div');
        hourLine.className = 'week-hour-line';
        hourLine.style.top = `${hour * 40}px`;
        dayContent.appendChild(hourLine);
    }
    
    const dayEvents = events.filter(event => {
        const eventDate = parseDate(event.start_datetime);
        return eventDate.toDateString() === currentDate.toDateString();
    });
    
    dayEvents.forEach(event => {
        const eventElement = createWeekEventElement(event);
        dayContent.appendChild(eventElement);
    });
    
    dayContent.addEventListener('click', (e) => {
        if (e.target === dayContent) {
            const rect = dayContent.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const hour = Math.floor(y / 40);
            const minutes = Math.round(((y % 40) / 40) * 60);
            
            const newEvent = {
                start_datetime: formatDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), hour, minutes)),
                end_datetime: formatDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), hour + 1, minutes))
            };
            showEventModal(newEvent);
        }
    });
    
    if (currentDate.toDateString() === new Date().toDateString()) {
        addCurrentTimeLine();
    }
}

function createWeekEventElement(event) {
    const eventElement = document.createElement('div');
    eventElement.className = 'week-event';
    eventElement.style.backgroundColor = event.color;
    eventElement.textContent = event.title;
    
    const startTime = parseDate(event.start_datetime);
    const endTime = parseDate(event.end_datetime);
    
    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    const endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
    const duration = endMinutes - startMinutes;
    
    eventElement.style.top = `${(startMinutes / 60) * 40}px`;
    eventElement.style.height = `${Math.max((duration / 60) * 40, 20)}px`;
    
    eventElement.addEventListener('click', (e) => {
        e.stopPropagation();
        showEventModal(event);
    });
    
    return eventElement;
}

function getStartOfWeek(date) {
    const start = new Date(date);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    return start;
}

function initializeTimeSlots() {
    const timeColumns = [
        document.querySelector('#week-view .time-column'),
        document.querySelector('#day-view .time-column')
    ];
    
    timeColumns.forEach(column => {
        if (!column) return;
        
        const timeSlots = column.querySelectorAll('.time-slot:not(.time-header)');
        timeSlots.forEach(slot => slot.remove());
        
        for (let hour = 0; hour < 24; hour++) {
            const timeSlot = document.createElement('div');
            timeSlot.className = 'time-slot';
            timeSlot.textContent = `${hour.toString().padStart(2, '0')}:00`;
            column.appendChild(timeSlot);
        }
    });
}

function addCurrentTimeLine() {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const position = (currentMinutes / 60) * 40;
    
    document.querySelectorAll('.current-time-line').forEach(line => line.remove());
    
    const containers = [
        ...document.querySelectorAll('.week-day-content'),
        document.getElementById('day-content')
    ].filter(Boolean);
    
    containers.forEach(container => {
        const timeLine = document.createElement('div');
        timeLine.className = 'current-time-line';
        timeLine.style.top = `${position}px`;
        container.appendChild(timeLine);
    });
}

// Gestion des événements
async function loadEvents() {
    if (!currentToken) return;
    
    try {
        let startDate, endDate;
        
        switch (currentView) {
            case 'day':
                startDate = new Date(currentDate);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(currentDate);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'week':
                startDate = getStartOfWeek(currentDate);
                endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 6);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'month':
                startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                endDate.setHours(23, 59, 59, 999);
                break;
        }
        
        const queryParams = new URLSearchParams({
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString()
        });
        
        events = await apiCall(`/events?${queryParams}`);
        renderCurrentView();
    } catch (error) {
        showNotification('Erreur lors du chargement des événements', 'error');
    }
}

function showEventModal(event = null) {
    const isEdit = event && event.id;
    
    document.getElementById('event-modal-title').textContent = 
        isEdit ? 'Modifier l\'événement' : 'Nouvel événement';
    
    document.getElementById('delete-event-btn').classList.toggle('hidden', !isEdit);
    
    document.getElementById('event-form').reset();
    document.getElementById('recurrence-options').classList.add('hidden');
    document.getElementById('weekly-options').classList.add('hidden');
    document.getElementById('email-timing').classList.add('hidden');
    document.getElementById('push-timing').classList.add('hidden');
    
    if (event) {
        document.getElementById('event-id').value = event.id || '';
        document.getElementById('event-title').value = event.title || '';
        document.getElementById('event-description').value = event.description || '';
        
        if (event.start_datetime) {
            document.getElementById('event-start').value = event.start_datetime.slice(0, 16);
        }
        if (event.end_datetime) {
            document.getElementById('event-end').value = event.end_datetime.slice(0, 16);
        }
        
        document.getElementById('event-location').value = event.location || '';
        document.getElementById('event-category').value = event.category || '';
        document.getElementById('event-color').value = event.color || '#3174ad';
        document.getElementById('event-all-day').checked = event.is_all_day || false;
        
        if (event.recurrence_rule) {
            const rule = event.recurrence_rule;
            document.getElementById('recurrence-frequency').value = rule.frequency;
            
            if (rule.frequency !== 'never') {
                document.getElementById('recurrence-options').classList.remove('hidden');
                document.getElementById('recurrence-interval').value = rule.interval || 1;
                
                if (rule.frequency === 'weekly' && rule.days_of_week) {
                    document.getElementById('weekly-options').classList.remove('hidden');
                    rule.days_of_week.forEach(day => {
                        const checkbox = document.querySelector(`#weekly-options input[value="${day}"]`);
                        if (checkbox) checkbox.checked = true;
                    });
                }
                
                if (rule.end_type === 'after') {
                    document.querySelector('input[name="recurrence-end"][value="after"]').checked = true;
                    document.getElementById('recurrence-count').value = rule.end_after || 10;
                } else if (rule.end_type === 'until') {
                    document.querySelector('input[name="recurrence-end"][value="until"]').checked = true;
                    document.getElementById('recurrence-until').value = rule.end_until ? rule.end_until.slice(0, 10) : '';
                }
            }
        }
        
        if (event.notifications) {
            const notif = event.notifications;
            if (notif.email_enabled) {
                document.getElementById('notification-email').checked = true;
                document.getElementById('email-timing').classList.remove('hidden');
                document.getElementById('email-timing').value = notif.email_minutes_before || 15;
            }
            if (notif.push_enabled) {
                document.getElementById('notification-push').checked = true;
                document.getElementById('push-timing').classList.remove('hidden');
                document.getElementById('push-timing').value = notif.push_minutes_before || 15;
            }
        }
    } else {
        document.getElementById('event-color').value = '#3174ad';
    }
    
    updateLocationDatalist();
    DOM.eventModal.classList.remove('hidden');
    document.getElementById('event-title').focus();
}

function hideEventModal() {
    DOM.eventModal.classList.add('hidden');
}

async function handleEventSubmit(event) {
    event.preventDefault();
    
    const eventId = document.getElementById('event-id').value;
    
    const eventData = {
        title: document.getElementById('event-title').value,
        description: document.getElementById('event-description').value,
        start_datetime: document.getElementById('event-start').value,
        end_datetime: document.getElementById('event-end').value,
        location: document.getElementById('event-location').value,
        category: document.getElementById('event-category').value,
        color: document.getElementById('event-color').value,
        is_all_day: document.getElementById('event-all-day').checked
    };
    
    const recurrenceFreq = document.getElementById('recurrence-frequency').value;
    if (recurrenceFreq !== 'never') {
        const recurrenceRule = {
            frequency: recurrenceFreq,
            interval: parseInt(document.getElementById('recurrence-interval').value) || 1
        };
        
        if (recurrenceFreq === 'weekly') {
            const selectedDays = Array.from(document.querySelectorAll('#weekly-options input:checked'))
                .map(input => parseInt(input.value));
            if (selectedDays.length > 0) {
                recurrenceRule.days_of_week = selectedDays;
            }
        }
        
        const endType = document.querySelector('input[name="recurrence-end"]:checked').value;
        recurrenceRule.end_type = endType;
        
        if (endType === 'after') {
            recurrenceRule.end_after = parseInt(document.getElementById('recurrence-count').value) || 10;
        } else if (endType === 'until') {
            recurrenceRule.end_until = document.getElementById('recurrence-until').value;
        }
        
        eventData.recurrence_rule = recurrenceRule;
    }
    
    const emailEnabled = document.getElementById('notification-email').checked;
    const pushEnabled = document.getElementById('notification-push').checked;
    
    if (emailEnabled || pushEnabled) {
        eventData.notifications = {
            email_enabled: emailEnabled,
            email_minutes_before: emailEnabled ? parseInt(document.getElementById('email-timing').value) : 15,
            push_enabled: pushEnabled,
            push_minutes_before: pushEnabled ? parseInt(document.getElementById('push-timing').value) : 15
        };
    }
    
    try {
        if (eventId) {
            await apiCall(`/events/${eventId}`, {
                method: 'PUT',
                body: JSON.stringify(eventData)
            });
            showNotification('Événement mis à jour !', 'success');
        } else {
            const response = await apiCall('/events', {
                method: 'POST',
                body: JSON.stringify(eventData)
            });
            showNotification(response.message || 'Événement créé !', 'success');
        }
        
        hideEventModal();
        loadEvents();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function handleEventDelete() {
    const eventId = document.getElementById('event-id').value;
    if (!eventId) return;
    
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet événement ?')) return;
    
    try {
        await apiCall(`/events/${eventId}`, {
            method: 'DELETE'
        });
        
        showNotification('Événement supprimé !', 'success');
        hideEventModal();
        loadEvents();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Gestion des lieux favoris
async function loadFavoriteLocations() {
    if (!currentToken) return;
    
    try {
        favoriteLocations = await apiCall('/locations');
        updateLocationDatalist();
        renderLocationsList();
    } catch (error) {
        showNotification('Erreur lors du chargement des lieux', 'error');
    }
}

function updateLocationDatalist() {
    const datalist = document.getElementById('favorite-locations');
    datalist.innerHTML = '';
    
    favoriteLocations.forEach(location => {
        const option = document.createElement('option');
        option.value = location.name;
        if (location.address) {
            option.label = `${location.name} - ${location.address}`;
        }
        datalist.appendChild(option);
    });
}

function renderLocationsList() {
    const container = document.getElementById('locations-list');
    container.innerHTML = '';
    
    if (favoriteLocations.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">Aucun lieu favori</p>';
        return;
    }
    
    favoriteLocations.forEach(location => {
        const locationItem = document.createElement('div');
        locationItem.className = 'location-item';
        locationItem.innerHTML = `
            <div class="location-info">
                <h4>${location.name}</h4>
                ${location.address ? `<p>${location.address}</p>` : ''}
            </div>
            <button class="btn btn-sm btn-danger" onclick="deleteLocation(${location.id})">
                Supprimer
            </button>
        `;
        container.appendChild(locationItem);
    });
}

async function handleLocationSubmit(event) {
    event.preventDefault();
    
    const locationData = {
        name: document.getElementById('location-name').value,
        address: document.getElementById('location-address').value,
        is_favorite: true
    };
    
    try {
        await apiCall('/locations', {
            method: 'POST',
            body: JSON.stringify(locationData)
        });
        
        document.getElementById('location-form').reset();
        showNotification('Lieu ajouté !', 'success');
        loadFavoriteLocations();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function deleteLocation(locationId) {
    if (!confirm('Supprimer ce lieu favori ?')) return;
    
    try {
        await apiCall(`/locations/${locationId}`, {
            method: 'DELETE'
        });
        
        showNotification('Lieu supprimé !', 'success');
        loadFavoriteLocations();
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Gestion du partage
async function handleShareSubmit(event) {
    event.preventDefault();
    
    const shareData = {
        start_date: document.getElementById('share-start-date').value,
        duration_days: parseInt(document.getElementById('share-duration').value),
        anonymize: document.getElementById('share-anonymize').checked,
        include_details: document.getElementById('share-include-details').checked
    };
    
    try {
        const response = await apiCall('/share', {
            method: 'POST',
            body: JSON.stringify(shareData)
        });
        
        const fullUrl = `${window.location.origin}${response.share_link}`;
        document.getElementById('share-link').value = fullUrl;
        document.getElementById('share-result').classList.remove('hidden');
        
        showNotification('Lien de partage créé !', 'success');
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// Gestion des paramètres
function showSettingsModal() {
    DOM.settingsModal.classList.remove('hidden');
    loadFavoriteLocations();
    document.getElementById('share-start-date').value = formatDateForInput(new Date());
}

function hideSettingsModal() {
    DOM.settingsModal.classList.add('hidden');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
}

function loadUserSettings() {
    const emailNotifications = localStorage.getItem('email_notifications') === 'true';
    const pushNotifications = localStorage.getItem('push_notifications') === 'true';
    
    if (document.getElementById('email-notifications-enabled')) {
        document.getElementById('email-notifications-enabled').checked = emailNotifications;
    }
    if (document.getElementById('push-notifications-enabled')) {
        document.getElementById('push-notifications-enabled').checked = pushNotifications;
    }
}

function saveUserSettings() {
    const emailNotifications = document.getElementById('email-notifications-enabled').checked;
    const pushNotifications = document.getElementById('push-notifications-enabled').checked;
    
    localStorage.setItem('email_notifications', emailNotifications);
    localStorage.setItem('push_notifications', pushNotifications);
    
    showNotification('Paramètres sauvegardés !', 'success');
}

// PWA Installation
function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                showNotification('Installation en cours...', 'info');
            }
            deferredPrompt = null;
            dismissInstallPrompt();
        });
    }
}

function dismissInstallPrompt() {
    DOM.installPrompt.classList.add('hidden');
    localStorage.setItem('installPromptDismissed', 'true');
}

// Mise à jour automatique de la ligne de temps
setInterval(() => {
    if ((currentView === 'week' || currentView === 'day') && 
        document.querySelector('.current-time-line')) {
        addCurrentTimeLine();
    }
}, 60000);

// Export global des fonctions nécessaires
window.deleteLocation = deleteLocation;
window.showNotification = showNotification;

console.log('📅 Mon Calendrier - Application initialisée avec succès!');