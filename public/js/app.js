// Socket.io connection
const socket = io();

// Family Manager Application
const FamilyManager = {
  members: [],
  tasks: [],
  calendar: [],
  rewards: [],
  goals: [],
  budget: { total: 0, categories: [], monthlyGoal: 0 },
  meals: [],
  achievements: [],
  chat: [],
  shoppingList: [],
  activities: [],
  polls: [],
  photos: [],
  reminders: [],
  recipes: [],
  _recipeFilter: 'all',
  
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  currentUser: null,
  cleaningFrequency: 2, // Default

  isAdmin() {
    return this.currentUser && this.currentUser.is_admin === 1;
  },

  init() {
    this.checkAuth();
    this.setupEventListeners();
    this.setupSocket();
    this.setupConnectionMonitor();

    const savedFreq = localStorage.getItem('cleaningFreq');
    if(savedFreq) this.cleaningFrequency = parseInt(savedFreq);
  },

  setupConnectionMonitor() {
    const indicator = document.getElementById('connection-indicator');

    const updateStatus = (online) => {
      if (indicator) {
        indicator.textContent = online ? '● En línea' : '● Sin conexión';
        indicator.style.color = online ? 'var(--success)' : 'var(--danger)';
      }
      if (!online) {
        this.showToast('Sin conexión', 'Verifica tu conexión a internet', 'warning');
      } else {
        this.showToast('Conexión restaurada', 'Ya estás en línea', 'success');
      }
    };

    window.addEventListener('offline', () => updateStatus(false));
    window.addEventListener('online', () => updateStatus(true));

    if (indicator) {
      const online = navigator.onLine;
      indicator.textContent = online ? '● En línea' : '● Sin conexión';
      indicator.style.color = online ? 'var(--success)' : 'var(--danger)';
    }
  },

  checkAuth() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));
    
    if (!token || !user) {
      window.location.href = '/login.html';
      return;
    }
    
    this.currentUser = user;
    this.loadData();
    
    // Hide loading screen then start sequence
    setTimeout(() => {
        const welcome = document.getElementById('welcome-screen');
        if(welcome) welcome.style.display = 'none';
        
        // Start the requested popup sequence
        this.runStartupSequence();
    }, 1500);
  },

  // --- STARTUP SEQUENCE ---
  runStartupSequence() {
      // 1. Who's Turn (Cleaner)
      const today = new Date();
      const cleaner = this.getCleanerForDate(today);
      const cleanerHtml = `
        <div style="text-align:center; padding:20px;">
            <img src="${cleaner ? cleaner.avatar : 'https://ui-avatars.com/api/?name=X&background=ccc'}" style="width:100px; height:100px; border-radius:50%; border:4px solid var(--primary); margin-bottom:15px;">
            <h2 style="color:var(--primary); margin-bottom:10px;">${cleaner ? `Es turno de: ${cleaner.name}` : '¡Hoy es día de descanso!'}</h2>
            <p>${cleaner ? 'Por favor, deja la casa impecable hoy.' : 'Nadie limpia hoy. ¡Disfruten!'}</p>
        </div>
      `;
      
      this.showModal('🧹 Turno de Limpieza', cleanerHtml, [{
          text: 'Siguiente >', 
          type: 'primary', 
          onclick: 'document.querySelector(".modal-overlay").remove(); FamilyManager.showInstructionsPopup()'
      }]);
  },

  showInstructionsPopup() {
      // 2. Instructions
      const rulesHtml = `
        <div class="alert-box" style="margin:0;">
            <h3>⚠️ REGLAS IMPORTANTES</h3>
            <ul>
                <li><strong>Baño y Ducha:</strong> Limpiar a fondo (espejos, inodoro, piso).</li>
                <li><strong>Basura:</strong> Sacar la basura si el bote está lleno.</li>
                <li><strong>Cocina:</strong> Lavar platos y limpiar mesones.</li>
                <li><strong>Detergente:</strong> Usar su propio detergente.</li>
            </ul>
        </div>
      `;
      this.showModal('📋 Instrucciones', rulesHtml, [{
          text: 'Siguiente >', 
          type: 'primary', 
          onclick: 'document.querySelector(".modal-overlay").remove(); FamilyManager.showVersePopup()'
      }]);
  },

  showVersePopup() {
      // 3. Bible Verse
      const bibleVerses = [
        { text: 'Todo lo puedo en Cristo que me fortalece.', reference: 'Filipenses 4:13' },
        { text: 'Y todo lo que hagáis, hacedlo de corazón, como para el Señor y no para los hombres.', reference: 'Colosenses 3:23' },
        { text: 'Mirad cuán bueno y cuán delicioso es habitar los hermanos juntos en armonía.', reference: 'Salmos 133:1' }
      ];
      const v = bibleVerses[Math.floor(Math.random() * bibleVerses.length)];
      
      const verseHtml = `
        <div style="text-align:center; padding:20px;">
            <i class="fa-solid fa-book-bible" style="font-size:3rem; color:var(--accent); margin-bottom:15px;"></i>
            <p style="font-style:italic; font-size:1.2rem; margin-bottom:10px;">"${v.text}"</p>
            <strong style="color:var(--text-light);">${v.reference}</strong>
        </div>
      `;
      
      this.showModal('✨ Versículo del Día', verseHtml, [{
          text: 'Ir al Inicio', 
          type: 'primary', 
          onclick: 'document.querySelector(".modal-overlay").remove(); FamilyManager.showSection("dashboard")'
      }]);
  },
  
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
  },

  async loadData() {
    try {
      const [members, tasks, goals, rewards, events, budget, meals, chat, activities, shopping, polls, photos, reminders, recipes] = await Promise.all([
        this.apiCall('/api/users'),
        this.apiCall('/api/tasks'),
        this.apiCall('/api/goals'),
        this.apiCall('/api/rewards'),
        this.apiCall('/api/events'),
        this.apiCall('/api/budget'),
        this.apiCall('/api/meals'),
        this.apiCall('/api/chat'),
        this.apiCall('/api/activities'),
        this.apiCall('/api/shopping'),
        this.apiCall('/api/polls'),
        this.apiCall('/api/photos'),
        this.apiCall('/api/reminders'),
        this.apiCall('/api/recipes')
      ]);

      this.members = members;
      this.tasks = tasks;
      this.goals = goals;
      this.rewards = rewards;
      this.calendar = events;
      this.budget = budget;
      this.meals = meals;
      this.chat = chat;
      this.activities = activities;
      this.shoppingList = shopping;
      this.polls = polls || [];
      this.photos = photos || [];
      this.reminders = reminders || [];
      this.recipes = recipes || [];
      this.achievements = this.getDefaultAchievements();

      this.updateUI();
      const activeSection = document.querySelector('.content-section.active');
      if (activeSection) this.loadSectionContent(activeSection.id);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  },
  
  async apiCall(url, method = 'GET', body = null) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json', 'x-access-token': token };
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    
    const response = await fetch(url, options);
    if (!response.ok) {
        if(response.status === 401) this.logout();
        if(response.status === 403) {
            this.showToast('Acceso Denegado', 'Solo el administrador puede realizar esta acción', 'warning');
        }
        throw new Error(`API Error: ${response.statusText}`);
    }
    return response.json();
  },

  setupSocket() {
    socket.on('newMessage', (message) => {
      this.chat.push(message);
      if (document.getElementById('chat').classList.contains('active')) {
        this.renderChat();
      } else {
        this.showToast('Nuevo mensaje', 'Has recibido un nuevo mensaje', 'info');
      }
    });

    socket.on('tasksUpdated', () => {
        this.apiCall('/api/tasks').then(tasks => {
            this.tasks = tasks;
            if(document.getElementById('tasks').classList.contains('active')) this.renderTasks();
            this.updateStats(); // Points might have changed
            // Also refresh dashboard if active
            if(document.getElementById('dashboard').classList.contains('active')) this.renderDashboard();
        });
    });

    socket.on('shoppingUpdated', () => {
        this.apiCall('/api/shopping').then(items => {
            this.shoppingList = items;
            if(document.getElementById('shopping') && document.getElementById('shopping').classList.contains('active')) this.renderShoppingList();
            if(document.getElementById('dashboard').classList.contains('active')) this.renderDashboard(); // Shopping widget
        });
    });
    
    socket.on('activityUpdated', (activity) => {
        this.activities.unshift(activity);
        if(document.getElementById('dashboard').classList.contains('active')) this.renderActivities();
    });

    socket.on('userUpdated', () => {
        this.apiCall('/api/users').then(users => {
            this.members = users;
            this.updateStats();
            if(document.getElementById('family').classList.contains('active')) this.renderFamily();
            if(document.getElementById('dashboard').classList.contains('active')) this.renderDashboard();
        });
    });
  },

  getDefaultAchievements() {
    return [
      { id: 1, name: 'Primera Tarea', icon: 'fa-solid fa-star', description: 'Completar la primera tarea', unlocked: true },
      { id: 2, name: 'Racha de 7 días', icon: 'fa-solid fa-fire', description: 'Completar tareas por 7 días seguidos', unlocked: true },
      { id: 3, name: 'Limpiador Experto', icon: 'fa-solid fa-broom', description: 'Completar 50 tareas de limpieza', unlocked: false },
      { id: 4, name: 'Organizador', icon: 'fa-solid fa-box-archive', description: 'Organizar 10 áreas diferentes', unlocked: false },
      { id: 5, name: 'Ahorrador', icon: 'fa-solid fa-piggy-bank', description: 'Ahorrar $1000', unlocked: false },
      { id: 6, name: 'Chef Familiar', icon: 'fa-solid fa-utensils', description: 'Preparar 20 comidas familiares', unlocked: false }
    ];
  },

  setupEventListeners() {
    document.querySelectorAll('.nav-link').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.showSection(item.dataset.section);
      });
    });
    
    document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
    
    const profileMenu = document.getElementById('profile-menu');
    if(profileMenu) profileMenu.addEventListener('click', () => { if(confirm('¿Cerrar sesión?')) this.logout(); });
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });
  },
  
  showSection(sectionId) {
    document.querySelectorAll('.nav-link').forEach(item => {
      item.classList.remove('active');
      if (item.dataset.section === sectionId) item.classList.add('active');
    });
    
    document.querySelectorAll('.content-section').forEach(section => {
      section.classList.remove('active');
      if (section.id === sectionId) {
        section.classList.add('active');
        this.loadSectionContent(sectionId);
      }
    });
  },

  loadSectionContent(sectionId) {
    switch(sectionId) {
      case 'dashboard': this.renderDashboard(); break;
      case 'calendar': this.renderCalendar(); break;
      case 'tasks': this.renderTasks(); break;
      case 'family': this.renderFamily(); break;
      case 'goals': this.renderGoals(); break;
      case 'gallery': this.renderGallery(); break;
      case 'rewards': this.renderRewards(); break;
      case 'budget': this.renderBudget(); break;
      case 'meals': this.renderMeals(); break;
      case 'chat': this.renderChat(); break;
      case 'achievements': this.renderAchievements(); break;
      case 'shopping': this.renderShoppingList(); break;
      case 'polls': this.renderPolls(); break;
      case 'reminders': this.renderReminders(); break;
      case 'recipes': this.renderRecipes(); break;
    }
  },

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('fam_theme', newTheme);
    const icon = document.querySelector('#theme-toggle i');
    if(icon) icon.className = newTheme === 'light' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
  },

  switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.tab === tabId) btn.classList.add('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
    const tabContent = document.getElementById(`${tabId}-tab`);
    if (tabContent) tabContent.style.display = 'block';
  },

  updateUI() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('es-ES', options);
    
    const dateEl = document.getElementById('current-date');
    if(dateEl) dateEl.textContent = dateStr;
    const headerDate = document.getElementById('current-date-header');
    if(headerDate) headerDate.textContent = dateStr;
    
    this.updateStats();
  },

  updateStats() {
    const totalTasks = this.tasks.length;
    const familyPoints = this.members.reduce((sum, member) => sum + member.points, 0);
    const setContent = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
    
    setContent('sidebar-tasks', totalTasks);
    setContent('sidebar-points', familyPoints.toLocaleString());
  },

  // --- CLEANING ROTATION LOGIC (UPDATED) ---
  getCleanerForDate(date) {
      if (this.members.length === 0) return null;
      
      const epoch = new Date('2024-01-01'); // Fixed start
      // Normalize dates to midnight to avoid hour differences
      const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const epochMidnight = new Date(epoch.getFullYear(), epoch.getMonth(), epoch.getDate());
      
      const diffTime = dateMidnight - epochMidnight;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      // Use dynamic frequency
      if (diffDays % this.cleaningFrequency !== 0) {
          return null; // No cleaning today
      }
      
      const cleaningTurnIndex = Math.floor(diffDays / this.cleaningFrequency);
      const memberIndex = cleaningTurnIndex % this.members.length;
      
      // Handle negative indices
      const normalizedIndex = (memberIndex + this.members.length) % this.members.length;
      
      return this.members[normalizedIndex];
  },

  // --- SETTINGS ---
  showSettingsModal() {
      const content = `
        <div class="form-group">
            <label class="form-label">Frecuencia de Limpieza</label>
            <select id="freq-select" class="form-input">
                <option value="1" ${this.cleaningFrequency === 1 ? 'selected' : ''}>Diario (Todos los días)</option>
                <option value="2" ${this.cleaningFrequency === 2 ? 'selected' : ''}>Cada 2 días (Un día sí, un día no)</option>
                <option value="3" ${this.cleaningFrequency === 3 ? 'selected' : ''}>Cada 3 días</option>
            </select>
        </div>
      `;
      this.showModal('Configuración', content, [{ text: 'Guardar', type: 'primary', onclick: 'FamilyManager.saveSettings()' }]);
  },

  saveSettings() {
      const freq = parseInt(document.getElementById('freq-select').value);
      this.cleaningFrequency = freq;
      localStorage.setItem('cleaningFreq', freq);
      document.querySelector('.modal-overlay').remove();
      this.updateUI();
      this.showToast('Configuración Guardada', `Limpieza configurada cada ${freq} días`, 'success');
      // Re-render current section if it's calendar or dashboard
      const activeSection = document.querySelector('.content-section.active');
      if (activeSection) this.loadSectionContent(activeSection.id);
  },

  // --- VERSE LOGIC ---
  loadVerse() {
      const bibleVerses = [
        { text: 'Todo lo puedo en Cristo que me fortalece.', reference: 'Filipenses 4:13' },
        { text: 'Y todo lo que hagáis, hacedlo de corazón, como para el Señor y no para los hombres.', reference: 'Colosenses 3:23' },
        { text: 'Mirad cuán bueno y cuán delicioso es habitar los hermanos juntos en armonía.', reference: 'Salmos 133:1' },
        { text: 'Jehová es mi pastor; nada me faltará.', reference: 'Salmos 23:1' },
        { text: 'Mas buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas.', reference: 'Mateo 6:33' }
      ];
      const v = bibleVerses[Math.floor(Math.random() * bibleVerses.length)];
      
      const verseText = document.getElementById('daily-verse');
      const verseRef = document.getElementById('verse-reference');
      if(verseText) verseText.textContent = `"${v.text}"`;
      if(verseRef) verseRef.textContent = v.reference;
  },

  // --- RENDER DASHBOARD ---
  renderDashboard() {
    const section = document.getElementById('dashboard');
    if(!section) return;

    const today = new Date();
    const cleaner = this.getCleanerForDate(today);

    // Generate mini calendar grid for dashboard
    const calendarHTML = this.generateCalendarGrid();

    // Sort members by points for Leaderboard
    const sortedMembers = [...this.members].sort((a,b) => b.points - a.points);

    // Budget Calculations
    const totalBudget = this.budget.categories.reduce((acc, cat) => acc + cat.budget, 0);
    const totalSpent = this.budget.categories.reduce((acc, cat) => acc + cat.spent, 0);
    const budgetPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
    
    // Today's Meal
    const daysMap = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dayName = daysMap[today.getDay()];
    const todayMeal = this.meals.find(m => m.day === dayName);

    // My Pending Tasks
    const myTasks = this.tasks.filter(t => t.assignedTo && t.assignedTo.includes(this.currentUser.id) && !t.completed);

    const dashboardGrid = document.querySelector('.dashboard-grid');
    if (dashboardGrid) {
        dashboardGrid.innerHTML = `
            <div class="welcome-card card">
              <div class="welcome-content">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <h2>ANDRES APP V3.0 ✨</h2>
                    ${this.isAdmin() ? '<button class="btn-icon" onclick="FamilyManager.showSettingsModal()" style="background:rgba(255,255,255,0.2); color:white; border:none;"><i class="fa-solid fa-gear"></i></button>' : ''}
                </div>
                <p>Bienvenido, ${this.currentUser.name}</p>
              </div>
            </div>

            <!-- SPIRITUAL SECTION (Restored) -->
            <div class="card spiritual-section">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h3 style="margin:0; color:var(--accent);"><i class="fa-solid fa-book-bible"></i> Versículo</h3>
                    <button class="btn-icon" onclick="FamilyManager.loadVerse()"><i class="fa-solid fa-rotate"></i></button>
                </div>
                <div class="verse-card" style="text-align:center;">
                    <p id="daily-verse" style="font-style:italic; font-size:1.1rem; margin-bottom:5px;">Cargando...</p>
                    <strong id="verse-reference" style="color:var(--text-light);"></strong>
                </div>
            </div>

            <!-- TASKS WIDGET (New) -->
            <div class="card" onclick="FamilyManager.showSection('tasks')" style="cursor:pointer;">
                <h3 style="color:var(--primary); margin-bottom:10px;"><i class="fa-solid fa-list-check"></i> Mis Tareas</h3>
                ${myTasks.length > 0 ? `
                    <div style="font-size:2rem; font-weight:bold; color:var(--primary);">${myTasks.length}</div>
                    <div style="font-size:0.9rem; color:var(--text-light);">Pendientes para hoy</div>
                    <div style="margin-top:5px; font-size:0.8rem;">${myTasks[0].title}</div>
                ` : `
                    <div style="color:var(--success);"><i class="fa-solid fa-check-circle"></i> ¡Todo listo!</div>
                `}
            </div>

            <!-- MEALS WIDGET (New) -->
            <div class="card" onclick="FamilyManager.showSection('meals')" style="cursor:pointer;">
                <h3 style="color:#F59E0B; margin-bottom:10px;"><i class="fa-solid fa-utensils"></i> Menú de Hoy</h3>
                ${todayMeal ? `
                    <div style="font-size:0.9rem;"><strong>A:</strong> ${todayMeal.lunch}</div>
                    <div style="font-size:0.9rem;"><strong>C:</strong> ${todayMeal.dinner}</div>
                ` : `
                    <div style="color:var(--text-light);">No hay menú configurado</div>
                `}
            </div>

            <!-- BUDGET WIDGET (New) -->
            <div class="card" onclick="FamilyManager.showSection('budget')" style="cursor:pointer;">
                <h3 style="color:#10B981; margin-bottom:10px;"><i class="fa-solid fa-coins"></i> Presupuesto</h3>
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span>Gastado</span>
                    <span style="font-weight:bold;">$${totalSpent}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${Math.min(budgetPercent, 100)}%; background:${budgetPercent > 90 ? 'var(--danger)' : '#10B981'}"></div>
                </div>
                <div style="font-size:0.8rem; text-align:right; margin-top:5px;">de $${totalBudget}</div>
            </div>

            <!-- CALENDAR WIDGET -->
            <div class="card" style="grid-column: 1 / -1;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h3 style="margin:0;"><i class="fa-solid fa-calendar-days"></i> Calendario de Limpieza</h3>
                    <div style="font-size:0.9rem; color:var(--text-light);">${this.currentYear}</div>
                </div>
                <div class="calendar-container">
                    <div class="calendar-grid">
                        ${calendarHTML}
                    </div>
                </div>
            </div>

            <!-- LEADERBOARD (New) -->
            <div class="card">
                <h3 style="margin-bottom:1rem; color:var(--primary);"><i class="fa-solid fa-trophy"></i> Tabla de Posiciones</h3>
                <div class="leaderboard">
                    ${sortedMembers.slice(0, 3).map((m, i) => `
                        <div class="leaderboard-item">
                            <div class="rank-badge rank-${i+1}">${i+1}</div>
                            <img src="${m.avatar}" style="width:30px; height:30px; border-radius:50%;">
                            <div style="flex:1; font-weight:600;">${m.name}</div>
                            <div style="font-weight:bold; color:var(--primary);">${m.points}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- PENALTY WARNING & REPORT -->
            <div class="card" style="background: #FEF2F2; border: 2px solid var(--danger); color: #991B1B;">
                <div style="display:flex; align-items:center; gap:15px; margin-bottom:10px;">
                    <i class="fa-solid fa-file-invoice-dollar" style="font-size:2.5rem;"></i>
                    <div>
                        <h3 style="margin:0; color:#B91C1C;">MULTA DE $50</h3>
                        <p style="margin:5px 0 0 0; font-size:0.9rem;">
                            Quien no cumpla con su turno de limpieza deberá pagar <strong>$50 dólares</strong>.
                        </p>
                    </div>
                </div>
                ${this.isAdmin() ? '<button class="btn" style="width:100%; background:#B91C1C; color:white;" onclick="FamilyManager.showReportModal()">REPORTAR INCUMPLIMIENTO</button>' : ''}
            </div>

            <!-- URGENT ALERTS -->
            <div class="alert-box" style="grid-column: 1 / -1;">
                <h3><i class="fa-solid fa-triangle-exclamation"></i> RECORDATORIOS URGENTES</h3>
                <ul>
                    <li><strong>Baño y Ducha:</strong> Tienen que limpiar muy bien el baño, la ducha y la cocina.</li>
                    <li><strong>Basura:</strong> TODOS los días hay que chequear los botes de basura y sacarlos si están llenos. ¡Ponerse serios con esto!</li>
                    <li><strong>Detergente:</strong> ¡Cada quien debe comprar su propio detergente de limpieza!</li>
                </ul>
            </div>

            <!-- SHOPPING LIST PREVIEW (New) -->
            <div class="card" style="background:var(--bg-soft); cursor:pointer;" onclick="FamilyManager.showSection('shopping')">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h3 style="margin:0; font-size:1.1rem;"><i class="fa-solid fa-cart-shopping"></i> Compras</h3>
                    <span style="background:var(--primary); color:white; padding:2px 8px; border-radius:10px; font-size:0.8rem;">${this.shoppingList.length}</span>
                </div>
                <div style="font-size:0.9rem; color:var(--text-light);">
                    ${this.shoppingList.length > 0 ? this.shoppingList.slice(0,3).map(i=>i.item).join(', ') + '...' : 'Lista vacía'}
                </div>
            </div>

            <!-- Cleaning Duty Widget -->
            <div class="card">
                <h3 style="color:var(--primary); font-size:1.1rem; margin-bottom:1rem;"><i class="fa-solid fa-broom"></i> Limpieza Hoy</h3>
                ${cleaner ? `
                    <div style="display:flex; align-items:center; gap:15px;">
                        <img src="${cleaner.avatar}" style="width:60px; height:60px; border-radius:50%; border:3px solid var(--primary);">
                        <div>
                            <div style="font-weight:bold; font-size:1.1rem;">${cleaner.name}</div>
                            <div style="font-size:0.85rem; color:var(--text-light);">Es tu turno hoy</div>
                        </div>
                    </div>
                ` : `
                    <div style="text-align:center; padding:10px; color:var(--text-light);">
                        <i class="fa-solid fa-couch" style="font-size:2rem; margin-bottom:5px;"></i>
                        <div>Hoy es día de descanso</div>
                    </div>
                `}
            </div>

            <!-- Activity Feed -->
            <div class="card" style="grid-column: 1 / -1;">
                <h3>Actividad Reciente</h3>
                <div class="activity-list" id="activity-list" style="margin-top:1rem;"></div>
            </div>
        `;
        this.renderActivities();
        this.loadVerse(); // Initialize verse
    }
  },

  // --- REPORT PENALTY ---
  showReportModal() {
      const content = `
        <p>Selecciona quién no cumplió con su deber. Esto registrará una deuda de $50 y reducirá sus puntos.</p>
        <div class="form-group">
            <label class="form-label">Miembro</label>
            <select id="penalty-user" class="form-input">
                ${this.members.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
            </select>
        </div>
      `;
      this.showModal('🚨 Reportar Incumplimiento', content, [{ text: 'Aplicar Multa', type: 'primary', onclick: 'FamilyManager.applyPenalty()' }]);
  },

  async applyPenalty() {
      const userId = parseInt(document.getElementById('penalty-user').value);
      const member = this.members.find(m => m.id === userId);
      
      if(member) {
          // Deduct points and add debt
          const newDebt = (member.debt || 0) + 50;
          const newPoints = Math.max(0, member.points - 50); // Lose 50 points too
          
          try {
              await this.apiCall(`/api/users/${userId}`, 'PUT', { debt: newDebt, points: newPoints });
              await this.apiCall('/api/activities', 'POST', {
                  type: 'penalty', // Need to handle this type in renderActivities if specific icon wanted
                  memberId: userId,
                  text: 'recibió una multa de $50 por incumplimiento',
                  points: -50,
                  time: new Date().toLocaleTimeString()
              });
              
              document.querySelector('.modal-overlay').remove();
              this.loadData();
              this.showToast('Multa Aplicada', `${member.name} ahora debe $${newDebt}`, 'warning');
          } catch(e) { console.error(e); }
      }
  },

  // --- SHOPPING LIST ---
  renderShoppingList() {
      // Need a container in index.html, usually renderSection creates content. 
      // But we need to ensure <section id="shopping"> exists.
      // Assuming index.html has generic sections, we will inject it.
      let section = document.getElementById('shopping');
      if(!section) {
          // Create if missing (dynamic addition)
          section = document.createElement('section');
          section.id = 'shopping';
          section.className = 'content-section';
          document.getElementById('main-content').appendChild(section);
      }
      
      section.innerHTML = `
        <div class="section-header">
            <div class="section-title"><i class="fa-solid fa-cart-shopping section-title-icon"></i><span>Lista de Compras</span></div>
        </div>
        <div class="card">
            ${this.isAdmin() ? `<div style="display:flex; gap:10px; margin-bottom:20px;">
                <input type="text" id="shop-item" class="form-input" placeholder="Agregar artículo (ej. Leche, Pan)" style="margin-bottom:0;">
                <button class="btn primary" onclick="FamilyManager.addShoppingItem()">Agregar</button>
            </div>` : ''}
            <div class="shopping-list">
                ${this.shoppingList.length === 0 ? '<div class="empty-state">Lista vacía</div>' :
                  this.shoppingList.map(item => `
                    <div class="shopping-item">
                        <span>${item.item}</span>
                        ${this.isAdmin() ? `<button class="btn-icon" onclick="FamilyManager.deleteShoppingItem(${item.id})"><i class="fa-solid fa-check"></i></button>` : ''}
                    </div>
                  `).join('')
                }
            </div>
        </div>
      `;
      
      // Make it active
      document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
      section.classList.add('active');
  },

  async addShoppingItem() {
      const item = document.getElementById('shop-item').value;
      if(!item) return;
      try {
          await this.apiCall('/api/shopping', 'POST', { item, added_by: this.currentUser.id });
          this.loadData(); // Will re-render
      } catch(e) { console.error(e); }
  },

  async deleteShoppingItem(id) {
      try {
          await this.apiCall(`/api/shopping/${id}`, 'DELETE');
          this.loadData();
      } catch(e) { console.error(e); }
  },

  // --- CALENDAR ---
  renderCalendar() {
    const section = document.getElementById('calendar');
    if (!section) return;
    
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    section.innerHTML = `
      <div class="section-header">
        <div class="section-title"><i class="fa-solid fa-calendar-days section-title-icon"></i><span>Calendario</span></div>
        ${this.isAdmin() ? '<div><button class="btn primary" onclick="FamilyManager.showAddEventModal()"><i class="fa-solid fa-plus"></i> Nuevo Evento</button></div>' : ''}
      </div>
      <div class="calendar-container">
        <div class="card" style="grid-column: span 2;">
           <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
              <button class="btn-icon" onclick="FamilyManager.changeMonth(-1)"><i class="fa-solid fa-chevron-left"></i></button>
              <h3 style="font-size:1.5rem;">${monthNames[this.currentMonth]} ${this.currentYear}</h3>
              <button class="btn-icon" onclick="FamilyManager.changeMonth(1)"><i class="fa-solid fa-chevron-right"></i></button>
           </div>
           
           <div class="calendar-grid">
             ${this.generateCalendarGrid()}
           </div>
        </div>
      </div>
    `;
  },
  
  changeMonth(delta) {
      this.currentMonth += delta;
      if (this.currentMonth > 11) { this.currentMonth = 0; this.currentYear++; }
      else if (this.currentMonth < 0) { this.currentMonth = 11; this.currentYear--; }
      this.renderCalendar();
  },

  generateCalendarGrid() {
    const firstDay = new Date(this.currentYear, this.currentMonth, 1).getDay();
    const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
    
    let html = '';
    const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    weekdays.forEach(d => html += `<div style="text-align:center; font-weight:bold; padding:8px; color:var(--text-light); font-size:0.9rem;">${d}</div>`);
    
    for(let i=0; i<firstDay; i++) html += '<div></div>';
    
    for(let d=1; d<=daysInMonth; d++) {
        const dateObj = new Date(this.currentYear, this.currentMonth, d);
        const dateStr = dateObj.toISOString().split('T')[0];
        const events = this.calendar.filter(e => e.date === dateStr);
        const cleaner = this.getCleanerForDate(dateObj);
        
        // Check if today
        const isToday = new Date().toDateString() === dateObj.toDateString();
        
        html += `
          <div class="calendar-day ${cleaner ? 'cleaning-day' : ''} ${isToday ? 'today' : ''}">
             <div class="day-number">${d}</div>
             ${cleaner ? `<div class="cleaner-badge"><img src="${cleaner.avatar}"><span>${cleaner.name}</span></div>` : ''}
             ${events.map(e => `<div style="font-size:0.75rem; background:var(--text); color:white; margin-top:2px; border-radius:4px; padding:2px 4px;">${e.title}</div>`).join('')}
          </div>
        `;
    }
    return html;
  },

  showAddEventModal() {
     const content = `
       <div class="form-group"><label class="form-label">Título</label><input type="text" class="form-input" id="event-title"></div>
       <div class="form-group"><label class="form-label">Fecha</label><input type="date" class="form-input" id="event-date" value="${new Date().toISOString().split('T')[0]}"></div>
     `;
     this.showModal('Nuevo Evento', content, [{ text: 'Guardar', type: 'primary', onclick: 'FamilyManager.saveEvent()' }]);
  },

  async saveEvent() {
      const title = document.getElementById('event-title').value;
      const date = document.getElementById('event-date').value;
      if(!title || !date) return;
      try {
          await this.apiCall('/api/events', 'POST', { title, date, type: 'general', points: 0, assignedTo: null });
          document.querySelector('.modal-overlay').remove();
          this.loadData();
      } catch(e) { console.error(e); }
  },

  // --- FAMILY (UPDATED WITH BIRTHDAY & JOB) ---
  renderFamily() {
      const section = document.getElementById('family');
      if(!section) return;
      section.innerHTML = `
        <div class="section-header"><div class="section-title"><i class="fa-solid fa-users section-title-icon"></i><span>Miembros de la Familia</span></div></div>
        <div class="family-grid">
            ${this.members.map(m => `
                <div class="family-member card" style="padding:0;">
                    <div class="member-header" style="background:${m.color}">
                        <img src="${m.avatar}" class="member-avatar">
                        <div style="font-weight:bold; font-size:1.2rem;">${m.name}</div>
                        <div style="opacity:0.9;">${m.role}</div>
                    </div>
                    <div class="member-details">
                        <div class="member-meta"><i class="fa-solid fa-briefcase" style="width:20px;"></i> ${m.job || 'No especificado'}</div>
                        <div class="member-meta"><i class="fa-solid fa-cake-candles" style="width:20px;"></i> ${m.birthday || 'No especificado'}</div>
                        <div style="display:flex; justify-content:space-between; margin-top:1rem; border-top:1px solid var(--border); padding-top:1rem;">
                            <div style="text-align:center;"><div style="font-weight:bold; color:var(--primary);">${m.points}</div><div style="font-size:0.8rem;">Puntos</div></div>
                            <div style="text-align:center;"><div style="font-weight:bold; color:var(--primary);">${m.tasks_completed}</div><div style="font-size:0.8rem;">Tareas</div></div>
                        </div>
                        ${this.isAdmin() ? `<button class="btn" style="width:100%; margin-top:1rem; border:1px solid var(--border);" onclick="FamilyManager.showEditMember(${m.id})">Editar Perfil</button>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
      `;
  },

  showEditMember(id) {
      const member = this.members.find(m => m.id === id);
      const content = `
        <div style="text-align:center; margin-bottom:15px;">
            <img src="${member.avatar}" style="width:80px; height:80px; border-radius:50%; border:3px solid var(--primary); margin-bottom:10px;" id="edit-avatar-preview">
            <div>
                <label class="btn" style="cursor:pointer; border:1px solid var(--border); font-size:0.9rem;">
                    <i class="fa-solid fa-camera"></i> Cambiar Foto
                    <input type="file" id="edit-avatar-file" accept="image/*" style="display:none;" onchange="FamilyManager.previewAvatar(this, ${id})">
                </label>
            </div>
        </div>
        <div class="form-group"><label class="form-label">Nombre</label><input type="text" class="form-input" id="edit-name" value="${member.name}"></div>
        <div class="form-group"><label class="form-label">Rol</label><input type="text" class="form-input" id="edit-role" value="${member.role}"></div>
        <div class="form-group"><label class="form-label">Trabajo/Ocupación</label><input type="text" class="form-input" id="edit-job" value="${member.job || ''}" placeholder="Ej: Estudiante, Ingeniero..."></div>
        <div class="form-group"><label class="form-label">Cumpleaños</label><input type="date" class="form-input" id="edit-birthday" value="${member.birthday || ''}"></div>
      `;
      this.showModal('Editar Perfil', content, [{ text: 'Guardar Cambios', type: 'primary', onclick: `FamilyManager.saveMember(${id})` }]);
  },

  previewAvatar(input, userId) {
      if (input.files && input.files[0]) {
          const reader = new FileReader();
          reader.onload = (e) => {
              document.getElementById('edit-avatar-preview').src = e.target.result;
          };
          reader.readAsDataURL(input.files[0]);
          this._pendingAvatarUpload = { file: input.files[0], userId };
      }
  },

  async uploadAvatar(userId) {
      if (!this._pendingAvatarUpload || this._pendingAvatarUpload.userId !== userId) return;
      const formData = new FormData();
      formData.append('avatar', this._pendingAvatarUpload.file);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/users/${userId}/avatar`, {
          method: 'POST',
          headers: { 'x-access-token': token },
          body: formData
      });
      if (!res.ok) throw new Error('Upload failed');
      this._pendingAvatarUpload = null;
  },

  async saveMember(id) {
      const name = document.getElementById('edit-name').value;
      const role = document.getElementById('edit-role').value;
      const job = document.getElementById('edit-job').value;
      const birthday = document.getElementById('edit-birthday').value;

      try {
          if (this._pendingAvatarUpload && this._pendingAvatarUpload.userId === id) {
              await this.uploadAvatar(id);
          }
          await this.apiCall(`/api/users/${id}`, 'PUT', { name, role, job, birthday });
          document.querySelector('.modal-overlay').remove();
          this.loadData();
          this.showToast('Perfil Actualizado', 'Los datos se guardaron correctamente', 'success');
      } catch(e) { console.error(e); }
  },

  // --- GALLERY ---
  renderGallery() {
      const section = document.getElementById('gallery');
      if (!section) return;
      const photos = this.photos || [];
      section.innerHTML = `
        <div class="section-header">
            <div class="section-title"><i class="fa-solid fa-images section-title-icon"></i><span>Galería Familiar</span></div>
            <label class="btn primary" style="cursor:pointer;">
                <i class="fa-solid fa-upload"></i> Subir Foto
                <input type="file" id="gallery-file-input" accept="image/*" style="display:none;" onchange="FamilyManager.uploadPhoto(this)">
            </label>
        </div>
        <div class="gallery-grid" id="gallery-grid">
           ${photos.length === 0 ? '<div class="empty-state" style="grid-column:1/-1">No hay fotos aún. ¡Sube la primera!</div>' : photos.map(p => `
               <div class="gallery-item" style="position:relative;">
                   <img src="${p.url}" alt="${p.caption || 'Foto familiar'}" onclick="FamilyManager.openPhotoFull('${p.url}', '${(p.caption||'').replace(/'/g,"\\'")}')">
                   <div class="gallery-caption">
                       <h4 style="margin:0; font-size:13px;">${p.caption || ''}</h4>
                       <small style="opacity:0.7;">${p.uploader_name || ''}</small>
                   </div>
                   <button onclick="FamilyManager.deletePhoto(${p.id})" style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,0.5);color:white;border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;display:grid;place-items:center;"><i class="fa-solid fa-xmark" style="font-size:12px;"></i></button>
               </div>
           `).join('')}
        </div>
      `;
  },

  async uploadPhoto(input) {
      if (!input.files || !input.files[0]) return;
      const caption = prompt('¿Le pones un título a la foto? (opcional)') || '';
      const formData = new FormData();
      formData.append('photo', input.files[0]);
      formData.append('caption', caption);
      const token = localStorage.getItem('token');
      try {
          const res = await fetch('/api/photos', { method: 'POST', headers: { 'x-access-token': token }, body: formData });
          if (!res.ok) throw new Error('Upload failed');
          this.showToast('Foto subida', 'La foto se agregó a la galería', 'success');
          this.loadData();
      } catch (e) { this.showToast('Error', 'No se pudo subir la foto', 'error'); }
  },

  async deletePhoto(id) {
      if (!confirm('¿Eliminar esta foto?')) return;
      try { await this.apiCall(`/api/photos/${id}`, 'DELETE'); this.loadData(); } catch (e) {}
  },

  openPhotoFull(url, caption) {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;cursor:pointer;';
      overlay.innerHTML = `<img src="${url}" style="max-width:90vw;max-height:80vh;border-radius:12px;"><p style="color:white;margin-top:16px;font-size:16px;">${caption}</p>`;
      overlay.onclick = () => overlay.remove();
      document.body.appendChild(overlay);
  },
  
  // --- TASKS (Keep Existing) ---
  renderTasks() {
    const section = document.getElementById('tasks'); if(!section) return;
    const pendingTasks = this.tasks.filter(t => !t.completed);
    section.innerHTML = `<div class="section-header"><div class="section-title"><i class="fa-solid fa-list-check section-title-icon"></i><span>Gestión de Tareas</span></div>${this.isAdmin() ? '<button class="btn primary" onclick="FamilyManager.showAddTaskModal()"><i class="fa-solid fa-plus"></i> Nueva Tarea</button>' : ''}</div><div class="dashboard-grid"><div class="card" style="grid-column: span 2;"><div class="task-list" id="task-list">${this.renderTaskList(pendingTasks)}</div></div></div>`;
  },
  renderTaskList(tasks) { if (tasks.length === 0) return '<div class="empty-state">No hay tareas pendientes</div>'; return tasks.map(task => `<div class="task-item"><div class="task-checkbox ${task.completed ? 'checked' : ''}" onclick="FamilyManager.toggleTask(${task.id}, ${!task.completed})">${task.completed ? '<i class="fa-solid fa-check"></i>' : ''}</div><div class="task-content"><div class="task-title">${task.title}</div><div class="task-meta"><i class="fa-solid fa-star"></i> ${task.points} pts</div></div>${this.isAdmin() ? '<div class="task-actions"><button class="btn-icon" onclick="FamilyManager.deleteTask('+task.id+')"><i class="fa-solid fa-trash"></i></button></div>' : ''}</div>`).join(''); },
  async toggleTask(id, c) { const t=this.tasks.find(x=>x.id===id); if(!t)return; try{await this.apiCall(`/api/tasks/${id}`,'PUT',{...t,completed:c}); if(c && t.assignedTo) { for(let uid of t.assignedTo) { const m=this.members.find(x=>x.id===uid); if(m) await this.apiCall(`/api/users/${uid}`,'PUT',{points:m.points+t.points}); } } this.loadData(); }catch(e){} },
  async deleteTask(id) { if(!confirm('?'))return; try{await this.apiCall(`/api/tasks/${id}`,'DELETE');this.loadData();}catch(e){} },
  showAddTaskModal() { this.showModal('Nueva Tarea', `<div class="form-group"><label class="form-label">Título</label><input type="text" class="form-input" id="task-title"></div><div class="form-group"><label class="form-label">Puntos</label><input type="number" class="form-input" id="task-points" value="10"></div>`, [{text:'Guardar', type:'primary', onclick:'FamilyManager.saveTask()'}]); },
  async saveTask() { const t=document.getElementById('task-title').value; const p=document.getElementById('task-points').value; if(!t)return; await this.apiCall('/api/tasks','POST',{title:t, points:p, category:'limpieza', priority:'media', due_date:new Date().toISOString().split('T')[0], assignedTo:[this.currentUser.id]}); document.querySelector('.modal-overlay').remove(); this.loadData(); },

  // --- GOALS, REWARDS, ETC (Simplified) ---
  renderGoals() { const s=document.getElementById('goals'); if(s) s.innerHTML = `<div class="section-header"><div class="section-title"><i class="fa-solid fa-bullseye section-title-icon"></i><span>Metas</span></div>${this.isAdmin() ? '<button class="btn primary" onclick="FamilyManager.showAddGoalModal()"><i class="fa-solid fa-plus"></i> Nueva</button>' : ''}</div><div class="goals-grid">${this.goals.map(g => `<div class="goal-card"><h4>${g.title}</h4><div class="goal-progress"><div class="goal-progress-fill" style="width:${(g.current/g.target)*100}%"></div></div><div style="display:flex; justify-content:space-between;"><span>${g.current}/${g.target}</span><span>${g.points} pts</span></div>${this.isAdmin() ? `<button class="btn mt-3" style="width:100%" onclick="FamilyManager.advanceGoal(${g.id})">Avanzar</button>` : ''}</div>`).join('')}</div>`; },
  async advanceGoal(id) { const g=this.goals.find(x=>x.id===id); if(g) { await this.apiCall(`/api/goals/${id}`,'PUT',{...g, current:g.current+1}); this.loadData(); } },
  showAddGoalModal() { this.showModal('Nueva Meta', `<div class="form-group"><label class="form-label">Título</label><input type="text" class="form-input" id="goal-title"></div><div class="form-group"><label class="form-label">Meta</label><input type="number" class="form-input" id="goal-target" value="10"></div>`, [{text:'Guardar', type:'primary', onclick:'FamilyManager.saveGoal()'}]); },
  async saveGoal() { const t=document.getElementById('goal-title').value; const ta=document.getElementById('goal-target').value; if(t) { await this.apiCall('/api/goals','POST',{title:t, target:ta, points:100}); document.querySelector('.modal-overlay').remove(); this.loadData(); } },
  
  renderRewards() { const s=document.getElementById('rewards'); if(s) s.innerHTML = `<div class="section-header"><div class="section-title"><i class="fa-solid fa-gift section-title-icon"></i><span>Recompensas</span></div></div><div class="rewards-grid">${this.rewards.map(r => `<div class="reward-card"><div class="reward-header"><i class="${r.icon} reward-icon"></i><div class="reward-name">${r.name}</div></div><div class="reward-content"><p>${r.description}</p><button class="btn primary" onclick="FamilyManager.redeemReward(${r.id})">Canjear (${r.cost} pts)</button></div></div>`).join('')}</div>`; },
  async redeemReward(id) { const r=this.rewards.find(x=>x.id===id); if(this.currentUser.points<r.cost) return alert('Puntos insuficientes'); await this.apiCall(`/api/users/${this.currentUser.id}`,'PUT',{points:this.currentUser.points-r.cost}); this.loadData(); },

  renderBudget() { const s=document.getElementById('budget'); if(s) s.innerHTML = `<div class="section-header"><div class="section-title"><i class="fa-solid fa-coins section-title-icon"></i><span>Presupuesto</span></div></div><div class="budget-overview">${this.budget.categories.map(c => `<div class="budget-category" style="border-left-color:${c.color}"><h4>${c.name}</h4><p>$${c.spent} / $${c.budget}</p><div class="progress-bar mt-2"><div class="progress-fill" style="background:${c.color}; width:${(c.spent/c.budget)*100}%"></div></div></div>`).join('')}</div>`; },
  renderMeals() { const s=document.getElementById('meals'); if(s) s.innerHTML = `<div class="section-header"><div class="section-title"><i class="fa-solid fa-utensils section-title-icon"></i><span>Comidas</span></div></div><div class="meal-planner">${this.meals.map(m => `<div class="meal-card"><div style="font-weight:bold;color:var(--primary);margin-bottom:12px;">${m.day}</div><div style="font-size:14px;"><p><strong>D:</strong> ${m.breakfast}</p><p><strong>A:</strong> ${m.lunch}</p><p><strong>C:</strong> ${m.dinner}</p></div></div>`).join('')}</div>`; },
  renderChat() { const s=document.getElementById('chat'); if(s) s.innerHTML = `<div class="section-header"><div class="section-title"><i class="fa-solid fa-comments section-title-icon"></i><span>Chat</span></div></div><div class="chat-container"><div class="chat-main"><div class="chat-messages" id="chat-messages">${this.chat.map(m => `<div class="message ${m.sender_id===this.currentUser.id?'sent':'received'}"><div class="message-content">${m.message}</div></div>`).join('')}</div><div class="chat-input-area"><input type="text" class="chat-input" id="chat-input" placeholder="Escribe..."><button class="btn primary" onclick="FamilyManager.sendMessage()"><i class="fa-solid fa-paper-plane"></i></button></div></div></div>`; },
  sendMessage() { const i=document.getElementById('chat-input'); if(i.value) { socket.emit('sendMessage', {sender_id:this.currentUser.id, message:i.value, type:'text'}); i.value=''; } },
  renderAchievements() { const s=document.getElementById('achievements'); if(s) s.innerHTML = `<div class="section-header"><div class="section-title"><i class="fa-solid fa-trophy section-title-icon"></i><span>Logros</span></div></div><div class="achievements-grid">${this.achievements.map(a => `<div class="achievement-card ${a.unlocked?'unlocked':''}"><i class="${a.icon}" style="font-size:2rem; margin-bottom:10px;"></i><h4>${a.name}</h4><p>${a.description}</p></div>`).join('')}</div>`; },

  renderActivities() {
      const container = document.getElementById('activity-list');
      if(!container) return;
      if(this.activities.length === 0) {
          container.innerHTML = '<div style="color:var(--text-light); text-align:center;">No hay actividad reciente</div>';
          return;
      }
      container.innerHTML = this.activities.slice(0, 10).map(a => {
          const m = this.members.find(u => u.id === a.member_id);
          return `
            <div style="display:flex; gap:10px; align-items:center; padding:8px 0; border-bottom:1px solid var(--border);">
                <img src="${m ? m.avatar : 'https://ui-avatars.com/api/?name=?'}" style="width:32px; height:32px; border-radius:50%;">
                <div style="flex:1;">
                    <div style="font-size:0.9rem;"><strong>${m ? m.name : 'Alguien'}</strong> ${a.text}</div>
                    <div style="font-size:0.75rem; color:var(--text-light);">${new Date(a.time).toLocaleString()}</div>
                </div>
                ${a.points ? `<div style="font-weight:bold; color:${a.points > 0 ? 'var(--success)' : 'var(--danger)'};">${a.points > 0 ? '+' : ''}${a.points}</div>` : ''}
            </div>
          `;
      }).join('');
  },

  // --- POLLS ---
  renderPolls() {
      const container = document.getElementById('polls-container');
      if (!container) return;
      const wrapper = document.getElementById('add-poll-btn-wrapper');
      if (wrapper && this.isAdmin()) {
          wrapper.innerHTML = `<button class="btn primary" onclick="FamilyManager.showAddPollModal()"><i class="fa-solid fa-plus"></i> Nueva Votación</button>`;
      }
      if (!this.polls || this.polls.length === 0) {
          container.innerHTML = '<div class="empty-state">No hay votaciones activas</div>';
          return;
      }
      container.innerHTML = this.polls.map(poll => {
          const total = poll.votes ? poll.votes.reduce((a, b) => a + b, 0) : 0;
          const optionsHtml = poll.options.map((opt, i) => {
              const count = poll.votes ? poll.votes[i] : 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              const voted = poll.userVote === i;
              return `
                <div style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="font-weight:${voted?'700':'400'};">${voted ? '✅ ' : ''}${opt}</span>
                        <span style="color:var(--text-light);">${count} votos (${pct}%)</span>
                    </div>
                    <div style="background:var(--bg-soft); border-radius:8px; height:8px; overflow:hidden;">
                        <div style="background:var(--primary-light); height:100%; width:${pct}%; transition:width 0.4s;"></div>
                    </div>
                    ${poll.userVote === null ? `<button class="btn" style="margin-top:6px; font-size:12px; padding:4px 12px;" onclick="FamilyManager.votePoll(${poll.id}, ${i})">Votar</button>` : ''}
                </div>`;
          }).join('');
          return `
            <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                    <h3 style="margin:0; flex:1;">${poll.question}</h3>
                    ${this.isAdmin() ? `<button onclick="FamilyManager.deletePoll(${poll.id})" class="btn" style="padding:6px 10px; margin-left:10px;"><i class="fa-solid fa-trash" style="color:var(--danger);"></i></button>` : ''}
                </div>
                ${optionsHtml}
                <div style="color:var(--text-light); font-size:13px; margin-top:8px;">${total} votos en total</div>
            </div>`;
      }).join('');
  },

  async votePoll(pollId, optionIndex) {
      try {
          await this.apiCall(`/api/polls/${pollId}/vote`, 'POST', { option_index: optionIndex });
          this.showToast('Voto registrado', '¡Tu voto fue contado!', 'success');
          this.loadData();
      } catch (e) { this.showToast('Error', 'No se pudo registrar el voto', 'error'); }
  },

  async deletePoll(id) {
      if (!confirm('¿Eliminar esta votación?')) return;
      try { await this.apiCall(`/api/polls/${id}`, 'DELETE'); this.loadData(); } catch (e) {}
  },

  showAddPollModal() {
      this.showModal('Nueva Votación', `
        <div class="form-group">
            <label class="form-label">Pregunta</label>
            <input type="text" class="form-input" id="poll-question" placeholder="¿Qué cenamos el sábado?">
        </div>
        <div class="form-group">
            <label class="form-label">Opciones (una por línea, mín. 2)</label>
            <textarea class="form-input" id="poll-options" rows="4" placeholder="Pizza\nPollo frito\nTacos\nPasta"></textarea>
        </div>
      `, [{ text: 'Crear', type: 'primary', onclick: 'FamilyManager.savePoll()' }]);
  },

  async savePoll() {
      const question = document.getElementById('poll-question').value.trim();
      const optionsRaw = document.getElementById('poll-options').value;
      const options = optionsRaw.split('\n').map(o => o.trim()).filter(o => o.length > 0);
      if (!question || options.length < 2) return this.showToast('Error', 'Necesitas una pregunta y al menos 2 opciones', 'error');
      await this.apiCall('/api/polls', 'POST', { question, options });
      document.querySelector('.modal-overlay').remove();
      this.loadData();
  },

  // --- REMINDERS ---
  renderReminders() {
      const container = document.getElementById('reminders-container');
      if (!container) return;
      if (!this.reminders || this.reminders.length === 0) {
          container.innerHTML = '<div class="empty-state">No hay recordatorios activos</div>';
          return;
      }
      const repeatLabels = { none: 'Una vez', daily: 'Diario', weekly: 'Semanal', monthly: 'Mensual' };
      container.innerHTML = this.reminders.map(r => {
          const due = new Date(r.remind_at);
          const isOverdue = due < new Date() && r.repeat === 'none';
          return `
            <div class="card" style="border-left:4px solid ${isOverdue ? 'var(--danger)' : 'var(--primary-light)'};">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="flex:1;">
                        <h4 style="margin:0 0 6px;">${r.title}</h4>
                        ${r.description ? `<p style="color:var(--text-light); font-size:14px; margin:0 0 8px;">${r.description}</p>` : ''}
                        <div style="display:flex; gap:10px; flex-wrap:wrap;">
                            <span style="font-size:12px; background:var(--bg-soft); padding:3px 8px; border-radius:6px;">
                                <i class="fa-solid fa-clock"></i> ${due.toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' })} ${due.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })}
                            </span>
                            <span style="font-size:12px; background:var(--bg-soft); padding:3px 8px; border-radius:6px;">
                                <i class="fa-solid fa-repeat"></i> ${repeatLabels[r.repeat] || 'Una vez'}
                            </span>
                            ${isOverdue ? '<span style="font-size:12px; background:var(--danger); color:white; padding:3px 8px; border-radius:6px;">Vencido</span>' : ''}
                        </div>
                    </div>
                    <button onclick="FamilyManager.deleteReminder(${r.id})" style="background:none;border:none;cursor:pointer;color:var(--text-light);padding:4px;"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>`;
      }).join('');
  },

  showAddReminderModal() {
      const now = new Date();
      now.setMinutes(0, 0, 0);
      now.setHours(now.getHours() + 1);
      const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      this.showModal('Nuevo Recordatorio', `
        <div class="form-group">
            <label class="form-label">Título</label>
            <input type="text" class="form-input" id="reminder-title" placeholder="Pagar Verizon">
        </div>
        <div class="form-group">
            <label class="form-label">Descripción (opcional)</label>
            <input type="text" class="form-input" id="reminder-desc" placeholder="Vence el 1ro del mes">
        </div>
        <div class="form-group">
            <label class="form-label">Fecha y Hora</label>
            <input type="datetime-local" class="form-input" id="reminder-date" value="${localIso}">
        </div>
        <div class="form-group">
            <label class="form-label">Repetir</label>
            <select class="form-input" id="reminder-repeat">
                <option value="none">Una sola vez</option>
                <option value="daily">Diario</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
            </select>
        </div>
      `, [{ text: 'Guardar', type: 'primary', onclick: 'FamilyManager.saveReminder()' }]);
  },

  async saveReminder() {
      const title = document.getElementById('reminder-title').value.trim();
      const description = document.getElementById('reminder-desc').value.trim();
      const remind_at = document.getElementById('reminder-date').value;
      const repeat = document.getElementById('reminder-repeat').value;
      if (!title || !remind_at) return this.showToast('Error', 'Completa el título y la fecha', 'error');
      await this.apiCall('/api/reminders', 'POST', { title, description, remind_at: new Date(remind_at).toISOString(), repeat });
      document.querySelector('.modal-overlay').remove();
      this.showToast('Recordatorio creado', title, 'success');
      this.loadData();
  },

  async deleteReminder(id) {
      if (!confirm('¿Eliminar este recordatorio?')) return;
      try { await this.apiCall(`/api/reminders/${id}`, 'DELETE'); this.loadData(); } catch (e) {}
  },

  // --- RECIPES ---
  filterRecipes(category) {
      this._recipeFilter = category;
      document.querySelectorAll('#recipe-filters .btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      this.renderRecipes();
  },

  renderRecipes() {
      const container = document.getElementById('recipes-container');
      if (!container) return;
      const filtered = this._recipeFilter === 'all' ? this.recipes : this.recipes.filter(r => r.category === this._recipeFilter);
      if (!filtered || filtered.length === 0) {
          container.innerHTML = '<div class="empty-state">No hay recetas en esta categoría</div>';
          return;
      }
      container.innerHTML = filtered.map(r => {
          const ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
          return `
            <div class="card" style="cursor:pointer;" onclick="FamilyManager.openRecipe(${r.id})">
                ${r.image_url ? `<img src="${r.image_url}" style="width:100%; height:160px; object-fit:cover; border-radius:12px; margin-bottom:12px;">` : `<div style="width:100%; height:80px; background:linear-gradient(135deg,var(--primary),var(--primary-light)); border-radius:12px; margin-bottom:12px; display:grid; place-items:center;"><i class="fa-solid fa-utensils" style="font-size:2rem; color:white;"></i></div>`}
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="flex:1;">
                        <h4 style="margin:0 0 4px;">${r.name}</h4>
                        <span style="font-size:12px; background:var(--bg-soft); padding:2px 8px; border-radius:6px;">${r.category || 'General'}</span>
                    </div>
                    ${this.isAdmin() ? `<button onclick="event.stopPropagation(); FamilyManager.deleteRecipe(${r.id})" style="background:none;border:none;cursor:pointer;color:var(--text-light);"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
                ${r.description ? `<p style="color:var(--text-light); font-size:13px; margin:8px 0 0;">${r.description}</p>` : ''}
                ${ingredients.length > 0 ? `<p style="font-size:12px; color:var(--text-light); margin:6px 0 0;"><i class="fa-solid fa-list"></i> ${ingredients.length} ingredientes</p>` : ''}
            </div>`;
      }).join('');
  },

  openRecipe(id) {
      const r = this.recipes.find(x => x.id === id);
      if (!r) return;
      const ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
      const steps = Array.isArray(r.steps) ? r.steps : [];
      this.showModal(`🍽️ ${r.name}`, `
        ${r.image_url ? `<img src="${r.image_url}" style="width:100%; border-radius:12px; margin-bottom:16px;">` : ''}
        ${r.description ? `<p style="margin-bottom:12px;">${r.description}</p>` : ''}
        <h4 style="color:var(--primary); margin-bottom:8px;">Ingredientes</h4>
        <ul style="padding-left:20px; margin-bottom:16px;">${ingredients.map(i => `<li>${i}</li>`).join('')}</ul>
        <h4 style="color:var(--primary); margin-bottom:8px;">Preparación</h4>
        <ol style="padding-left:20px;">${steps.map(s => `<li style="margin-bottom:6px;">${s}</li>`).join('')}</ol>
        ${r.author_name ? `<p style="color:var(--text-light); font-size:12px; margin-top:16px;">Receta de: ${r.author_name}</p>` : ''}
      `, [{ text: 'Cerrar', type: '', onclick: 'document.querySelector(".modal-overlay").remove()' }]);
  },

  showAddRecipeModal() {
      const categories = ['Desayunos', 'Almuerzos', 'Cenas', 'Postres', 'Meriendas', 'General'];
      this.showModal('Nueva Receta', `
        <div class="form-group">
            <label class="form-label">Nombre</label>
            <input type="text" class="form-input" id="recipe-name" placeholder="Arroz con Pollo">
        </div>
        <div class="form-group">
            <label class="form-label">Descripción (opcional)</label>
            <input type="text" class="form-input" id="recipe-desc" placeholder="Clásico de la familia">
        </div>
        <div class="form-group">
            <label class="form-label">Categoría</label>
            <select class="form-input" id="recipe-cat">
                ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label class="form-label">Ingredientes (uno por línea)</label>
            <textarea class="form-input" id="recipe-ingredients" rows="4" placeholder="2 tazas de arroz\n1 pollo\n..."></textarea>
        </div>
        <div class="form-group">
            <label class="form-label">Pasos de preparación (uno por línea)</label>
            <textarea class="form-input" id="recipe-steps" rows="4" placeholder="Sofríe el pollo\nAgrega verduras\n..."></textarea>
        </div>
      `, [{ text: 'Guardar', type: 'primary', onclick: 'FamilyManager.saveRecipe()' }]);
  },

  async saveRecipe() {
      const name = document.getElementById('recipe-name').value.trim();
      const description = document.getElementById('recipe-desc').value.trim();
      const category = document.getElementById('recipe-cat').value;
      const ingredientsRaw = document.getElementById('recipe-ingredients').value;
      const stepsRaw = document.getElementById('recipe-steps').value;
      const ingredients = JSON.stringify(ingredientsRaw.split('\n').map(i => i.trim()).filter(i => i));
      const steps = JSON.stringify(stepsRaw.split('\n').map(s => s.trim()).filter(s => s));
      if (!name) return this.showToast('Error', 'El nombre es obligatorio', 'error');
      const form = new FormData();
      form.append('name', name);
      form.append('description', description);
      form.append('category', category);
      form.append('ingredients', ingredients);
      form.append('steps', steps);
      const token = localStorage.getItem('token');
      try {
          await fetch('/api/recipes', { method: 'POST', headers: { 'x-access-token': token }, body: form });
          document.querySelector('.modal-overlay').remove();
          this.showToast('Receta guardada', name, 'success');
          this.loadData();
      } catch (e) { this.showToast('Error', 'No se pudo guardar', 'error'); }
  },

  async deleteRecipe(id) {
      if (!confirm('¿Eliminar esta receta?')) return;
      try { await this.apiCall(`/api/recipes/${id}`, 'DELETE'); this.loadData(); } catch (e) {}
  },

  // Utils
  showToast(title, msg, type='info') {
      const c = document.getElementById('toast-container'); if(!c) return;
      const t = document.createElement('div'); t.className = `toast ${type}`; t.innerHTML = `<div class="toast-content"><div class="toast-title">${title}</div><div class="toast-message">${msg}</div></div>`; c.appendChild(t); setTimeout(() => t.remove(), 5000);
  },
  showModal(title, body, buttons) {
      const id = 'm'+Date.now();
      const html = `<div class="modal-overlay" id="${id}"><div class="modal"><div class="modal-header"><div class="modal-title">${title}</div><button class="modal-close" onclick="document.getElementById('${id}').remove()">×</button></div>${body}<div class="form-actions">${buttons.map(b=>`<button class="btn ${b.type}" onclick="${b.onclick}">${b.text}</button>`).join('')}</div></div></div>`;
      document.body.insertAdjacentHTML('beforeend', html);
  }
};

document.addEventListener('DOMContentLoaded', () => FamilyManager.init());
window.FamilyManager = FamilyManager;