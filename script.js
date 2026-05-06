document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // MOCK BACKEND API (Local Database)
    // Acts exactly like a cloud DB, checking passwords
    // and storing isolated data per user!
    // ==========================================
    const API = {
        delay: (ms) => new Promise(res => setTimeout(res, ms)),
        
        supabase: null,

        initSupabase() {
            const url = localStorage.getItem('supabase_url');
            const key = localStorage.getItem('supabase_key');
            if (url && key && typeof supabase !== 'undefined') {
                this.supabase = supabase.createClient(url, key);
                return true;
            }
            return false;
        },

        async register(name, email, password) {
            await this.delay(600); // Simulate network
            const users = JSON.parse(localStorage.getItem('db_users') || '{}');
            if (users[email]) {
                throw new Error('An account with this email already exists.');
            }
            users[email] = { name, email, password };
            localStorage.setItem('db_users', JSON.stringify(users));
            
            const allEntries = JSON.parse(localStorage.getItem('db_entries') || '{}');
            allEntries[email] = {};
            localStorage.setItem('db_entries', JSON.stringify(allEntries));
            
            // Sync to Supabase if available
            await this.syncToCloud(email, users[email], {});

            return { name, email };
        },

        async login(email, password) {
            await this.delay(600);
            
            // Check Cloud first if available
            if (this.initSupabase()) {
                try {
                    const { data, error } = await this.supabase
                        .from('gtracks_users')
                        .select('*')
                        .eq('email', email)
                        .single();
                    
                    if (data && !error) {
                        if (data.password === password) {
                            // Sync cloud to local
                            const users = JSON.parse(localStorage.getItem('db_users') || '{}');
                            users[email] = { name: data.name, email: data.email, password: data.password, ...data.profile };
                            localStorage.setItem('db_users', JSON.stringify(users));
                            
                            const allEntries = JSON.parse(localStorage.getItem('db_entries') || '{}');
                            allEntries[email] = data.entries || {};
                            localStorage.setItem('db_entries', JSON.stringify(allEntries));

                            return users[email];
                        }
                    }
                } catch (e) { console.error("Cloud login error:", e); }
            }

            const users = JSON.parse(localStorage.getItem('db_users') || '{}');
            const user = users[email];
            if (!user) {
                throw new Error('Account not found. Please sign up.');
            }
            if (user.password !== password) {
                throw new Error('Incorrect password. Please try again.');
            }
            return user;
        },

        async getEntries(email) {
            const allEntries = JSON.parse(localStorage.getItem('db_entries') || '{}');
            return allEntries[email] || {};
        },

        async saveEntries(email, userEntries) {
            const allEntries = JSON.parse(localStorage.getItem('db_entries') || '{}');
            allEntries[email] = userEntries;
            localStorage.setItem('db_entries', JSON.stringify(allEntries));
            
            // Sync to cloud
            const users = JSON.parse(localStorage.getItem('db_users') || '{}');
            await this.syncToCloud(email, users[email], userEntries);
        },

        async syncToCloud(email, profile, entries) {
            if (!this.initSupabase()) return;
            try {
                const { error } = await this.supabase
                    .from('gtracks_users')
                    .upsert({
                        email: email,
                        name: profile.name || profile.username,
                        password: profile.password,
                        profile: profile,
                        entries: entries,
                        updated_at: new Date()
                    });
                if (error) console.error("Cloud sync error:", error);
            } catch (e) { console.error("Cloud sync exception:", e); }
        }
    };

    // --- DOM Elements ---
    const authPage = document.getElementById('auth-page');
    const dashboardPage = document.getElementById('dashboard-page');
    const signupForm = document.getElementById('signup-form');
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const authError = document.getElementById('auth-error');
    const authSubmitBtn = signupForm.querySelector('button[type="submit"]');
    const btnText = authSubmitBtn.querySelector('span');
    const toggleLogin = document.getElementById('toggle-login');
    const signOutBtn = document.getElementById('sign-out');
    
    const displayName = document.getElementById('display-name');
    const userAvatar = document.getElementById('user-avatar');
    const currentDate = document.getElementById('current-date');
    const viewTitle = document.getElementById('view-title');
    const mainProgress = document.getElementById('main-progress');
    
    const addGoalForm = document.getElementById('add-goal-form');
    const newGoalInput = document.getElementById('new-goal-input');
    const goalsList = document.getElementById('goals-list');
    const emptyState = document.getElementById('empty-state');
    
    const progressFill = document.getElementById('progress-fill');
    const progressPercentage = document.getElementById('progress-percentage');

    const navItems = document.querySelectorAll('.nav-item');
    const viewSections = document.querySelectorAll('.view-section');

    const themeToggle = document.getElementById('theme-toggle');

    // Calendar Elements
    const calMonthSelect = document.getElementById('cal-month');
    const calYearSelect = document.getElementById('cal-year');
    const calGrid = document.getElementById('calendar-grid');
    const selectedDateText = document.getElementById('selected-date-text');
    const addReminderForm = document.getElementById('add-reminder-form');
    const reminderInput = document.getElementById('reminder-input');
    const calendarEntryType = document.getElementById('calendar-entry-type');
    const remindersListEl = document.getElementById('reminders-list');
    const calTodayBtn = document.getElementById('cal-today-btn');

    // AI Elements
    const apiKeyInput = document.getElementById('gemini-api-key');
    const aiChatForm = document.getElementById('ai-chat-form');
    const aiInput = document.getElementById('ai-input');
    const chatBox = document.getElementById('ai-chat-box');
    const aiKeyWarning = document.getElementById('ai-key-warning');

    // Supabase Elements
    const supabaseUrlInput = document.getElementById('supabase-url');
    const supabaseKeyInput = document.getElementById('supabase-key');
    const saveDbConfigBtn = document.getElementById('save-db-config');
    const dbStatusMsg = document.getElementById('db-status-msg');

    // --- State ---
    let currentUser = null;
    let entries = {}; 
    let isLoginMode = false;
    let currentTheme = 'dark';

    // Dates
    const today = new Date();
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    currentDate.textContent = today.toLocaleDateString('en-US', options);

    function getFormattedDate(date) {
        const d = date.getDate().toString().padStart(2, '0');
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const y = date.getFullYear();
        return `${y}-${m}-${d}`;
    }

    const todayStr = getFormattedDate(today);
    let calCurrentDate = new Date();
    let selectedCalDateStr = todayStr;

    // --- Initialize Theme ---
    const savedTheme = localStorage.getItem('gtracksTheme');
    if (savedTheme === 'light') {
        currentTheme = 'light';
        document.body.classList.add('light-theme');
        themeToggle.checked = false;
    }

    // --- Check Authentication Session ---
    const token = localStorage.getItem('auth_token');
    if (token && token !== "null" && token !== "undefined") {
        try {
            const parsed = JSON.parse(token);
            if (parsed && typeof parsed === 'object') {
                currentUser = parsed;
            } else {
                throw new Error("Invalid token format");
            }
        } catch (e) {
            // Migration for old token format
            currentUser = { email: token, name: "User" };
            localStorage.setItem('auth_token', JSON.stringify(currentUser));
        }
        
        if (currentUser) {
            loadUserDataAndShowDashboard();
        }
    }

    // --- Theme Toggle ---
    themeToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            document.body.classList.remove('light-theme');
            currentTheme = 'dark';
        } else {
            document.body.classList.add('light-theme');
            currentTheme = 'light';
        }
        localStorage.setItem('gtracksTheme', currentTheme);
        if (chartInstance) {
            chartInstance.options.scales.x.ticks.color = currentTheme === 'dark' ? '#f0f0f5' : '#1a1a2e';
            chartInstance.options.scales.y.ticks.color = currentTheme === 'dark' ? '#f0f0f5' : '#1a1a2e';
            chartInstance.options.scales.x.grid.color = currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
            chartInstance.options.scales.y.grid.color = currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
            chartInstance.options.plugins.legend.labels.color = currentTheme === 'dark' ? '#f0f0f5' : '#1a1a2e';
            chartInstance.update();
        }
    });

    // --- Navigation / Tabs ---
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(nav => nav.classList.remove('active'));
            viewSections.forEach(view => view.classList.remove('active'));
            
            item.classList.add('active');
            const viewId = item.getAttribute('data-view');
            document.getElementById(`view-${viewId}`).classList.add('active');

            // Update Header
            viewTitle.textContent = item.textContent.trim();
            if(viewId === 'today') {
                mainProgress.style.display = 'flex';
                renderTodayGoals();
            } else {
                mainProgress.style.display = 'none';
            }

            // Specific view inits
            if (viewId === 'calendar') {
                renderCalendarGrid();
                const dObj = new Date(selectedCalDateStr + 'T00:00:00');
                selectedDateText.textContent = dObj.toLocaleDateString('en-US', options);
            }
            if (viewId === 'statistics') {
                document.querySelector('.stats-controls .btn[data-range="day"]').click();
            }
            if (viewId === 'profile') {
                initProfileView();
            }
        });
    });

    // --- Auth Logic ---
    function showError(msg) {
        if(authError) {
            authError.textContent = msg;
            authError.style.display = 'block';
        }
    }
    
    function hideError() {
        if(authError) {
            authError.style.display = 'none';
        }
    }

    toggleLogin.addEventListener('click', (e) => {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        hideError();
        
        const headerTitle = document.querySelector('.auth-header h1');
        const headerDesc = document.querySelector('.auth-header p');
        const footerP = toggleLogin.parentElement;
        
        if (isLoginMode) {
            nameInput.parentElement.style.display = 'none';
            nameInput.removeAttribute('required');
            btnText.textContent = 'Sign In';
            headerTitle.textContent = 'Welcome Back';
            headerDesc.textContent = 'Resume your journey';
            toggleLogin.textContent = 'Create an account';
            footerP.firstChild.textContent = "Don't have an account? ";
        } else {
            nameInput.parentElement.style.display = 'flex';
            nameInput.setAttribute('required', 'true');
            btnText.textContent = 'Get Started';
            headerTitle.textContent = 'Gtracks';
            headerDesc.textContent = 'Elevate your daily routine';
            toggleLogin.textContent = 'Sign in';
            footerP.firstChild.textContent = "Already have an account? ";
        }
    });

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const name = nameInput.value.trim();

        const originalText = btnText.textContent;
        btnText.textContent = 'Please wait...';
        authSubmitBtn.disabled = true;
        
        try {
            if (isLoginMode) {
                currentUser = await API.login(email, password);
                currentUser.profileComplete = true; // Returning user, skip setup
            } else {
                currentUser = await API.register(name, email, password);
                // New user — profileComplete stays undefined → shows setup
            }
            
            // Save token
            localStorage.setItem('auth_token', JSON.stringify(currentUser));
            await loadUserDataAndShowDashboard();

        } catch (err) {
            showError(err.message);
        } finally {
            btnText.textContent = originalText;
            authSubmitBtn.disabled = false;
        }
    });

    const googleBtn = document.getElementById('google-signin-btn');
    const googleModalOverlay = document.getElementById('google-modal-overlay');
    const cancelGoogleBtn = document.getElementById('cancel-google-btn');
    const backGoogleBtn = document.getElementById('back-google-btn');
    const googleStep1 = document.getElementById('google-step-1');
    const googleStep2 = document.getElementById('google-step-2');
    const selectedGoogleEmailEl = document.getElementById('selected-google-email');
    const googlePasswordForm = document.getElementById('google-password-form');
    const googlePasswordInput = document.getElementById('google-password');
    const googleAuthError = document.getElementById('google-auth-error');
    
    let pendingGoogleEmail = "";
    let pendingGoogleName = "";

    if(googleBtn) {
        googleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideError();
            if (googleModalOverlay) googleModalOverlay.style.display = 'flex';
            if (googleStep1) googleStep1.style.display = 'block';
            if (googleStep2) googleStep2.style.display = 'none';
            if (googlePasswordInput) googlePasswordInput.value = '';
            if (googleAuthError) googleAuthError.style.display = 'none';
        });
    }

    if(cancelGoogleBtn) {
        cancelGoogleBtn.addEventListener('click', () => {
            googleModalOverlay.style.display = 'none';
        });
    }

    if(backGoogleBtn) {
        backGoogleBtn.addEventListener('click', () => {
            googleStep2.style.display = 'none';
            googleStep1.style.display = 'block';
            if (googleAuthError) googleAuthError.style.display = 'none';
            if (googlePasswordInput) googlePasswordInput.value = '';
        });
    }

    document.querySelectorAll('.google-account-item').forEach(item => {
        item.addEventListener('click', () => {
            pendingGoogleEmail = item.getAttribute('data-email');
            pendingGoogleName = item.getAttribute('data-name');
            
            if (selectedGoogleEmailEl) selectedGoogleEmailEl.textContent = pendingGoogleEmail;
            if (googleStep1) googleStep1.style.display = 'none';
            if (googleStep2) googleStep2.style.display = 'block';
            if (googlePasswordInput) googlePasswordInput.focus();
        });
    });

    if(googlePasswordForm) {
        googlePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pass = googlePasswordInput.value;
            const submitBtn = googlePasswordForm.querySelector('button[type="submit"]');
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i>';
            if (googleAuthError) googleAuthError.style.display = 'none';
            
            try {
                try {
                    currentUser = await API.login(pendingGoogleEmail, pass);
                    currentUser.profileComplete = true; // Returning user
                } catch(err) {
                    if (err.message.includes("Incorrect password")) {
                        throw new Error("Incorrect password. Please try again.");
                    }
                    // Not registered, register now
                    currentUser = await API.register(pendingGoogleName, pendingGoogleEmail, pass);
                    // New user — profileComplete stays undefined
                }
                
                localStorage.setItem('auth_token', JSON.stringify(currentUser));
                if (googleModalOverlay) googleModalOverlay.style.display = 'none';
                await loadUserDataAndShowDashboard();
                
            } catch (err) {
                if (googleAuthError) {
                    googleAuthError.textContent = err.message;
                    googleAuthError.style.display = 'block';
                } else {
                    alert(err.message);
                }
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Continue';
            }
        });
    }

    signOutBtn.addEventListener('click', () => {
        localStorage.removeItem('auth_token');
        currentUser = null;
        entries = {};
        clearTimeout(freePlanTimer);
        
        dashboardPage.classList.remove('active');
        pricingPage.classList.remove('active');
        profileSetupPage.classList.remove('active');
        
        // Hide AI FAB on sign out
        const fab = document.getElementById('tracks-ai-fab');
        const aiPopup = document.getElementById('tracks-ai-popup');
        if (fab) fab.style.display = 'none';
        if (aiPopup) aiPopup.classList.remove('active');

        setTimeout(() => {
            authPage.classList.add('active');
            signupForm.reset();
            hideError();
            isLoginMode = false;
            navItems[0].click();
        }, 400);
    });

    const pricingPage = document.getElementById('pricing-page');
    const userPlanDisplay = document.getElementById('user-plan-display');
    let freePlanTimer = null;
    
    function enforceFreePlanLimits() {
        const fab = document.getElementById('tracks-ai-fab');
        if (currentUser.plan === 'free') {
            if (fab) fab.style.display = 'flex'; // Initially enabled
            if (userPlanDisplay) userPlanDisplay.textContent = 'Basic Free (30m/day limit)';
            
            // Mock 30 min daily limit enforcement
            clearTimeout(freePlanTimer);
            freePlanTimer = setTimeout(() => {
                alert("Your free 30-minute daily limit has expired. Gtracks AI and premium features are now locked. Please upgrade to continue using them today.");
                if (fab) fab.style.display = 'none'; // Lock AI after 30 mins
            }, 30 * 60 * 1000); // 30 mins
        } else if (currentUser.plan === 'monthly') {
            if (fab) fab.style.display = 'flex';
            if (userPlanDisplay) userPlanDisplay.textContent = 'Pro Monthly';
            clearTimeout(freePlanTimer);
        } else if (currentUser.plan === 'annual') {
            if (fab) fab.style.display = 'flex';
            if (userPlanDisplay) userPlanDisplay.textContent = 'Pro Annual';
            clearTimeout(freePlanTimer);
        }
    }

    document.querySelectorAll('.select-plan-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const plan = btn.getAttribute('data-plan');
            currentUser.plan = plan;
            
            // Save plan to local DB
            try {
                const usersStr = localStorage.getItem('db_users') || '{}';
                const users = JSON.parse(usersStr);
                if(users[currentUser.email]) {
                    users[currentUser.email].plan = plan;
                    localStorage.setItem('db_users', JSON.stringify(users));
                }
            } catch(err) {
                console.error("Error saving plan:", err);
            }
            
            localStorage.setItem('auth_token', JSON.stringify(currentUser));
            
            pricingPage.classList.remove('active');
            dashboardPage.classList.add('active');
            
            renderTodayGoals();
            initCalendar();
            enforceFreePlanLimits();
        });
    });

    // --- Profile Setup Logic ---
    const profileSetupPage = document.getElementById('profile-setup-page');
    const profileSetupForm = document.getElementById('profile-setup-form');
    const profileDob = document.getElementById('profile-dob');
    const profileAge = document.getElementById('profile-age');
    const profileUsername = document.getElementById('profile-username');
    const profileStandard = document.getElementById('profile-standard');
    const profilePicWrapper = document.getElementById('profile-pic-wrapper');
    const profilePicInput = document.getElementById('profile-pic-input');
    const profilePicPreview = document.getElementById('profile-pic-preview');
    const profilePicPlaceholder = document.getElementById('profile-pic-placeholder');
    let profilePicBase64 = '';

    // Profile picture upload
    if (profilePicWrapper && profilePicInput) {
        profilePicWrapper.addEventListener('click', () => profilePicInput.click());
        profilePicInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                profilePicBase64 = ev.target.result;
                profilePicPreview.src = profilePicBase64;
                profilePicPreview.style.display = 'block';
                profilePicPlaceholder.style.display = 'none';
            };
            reader.readAsDataURL(file);
        });
    }

    // Auto-calculate age when DOB is selected
    if (profileDob) {
        profileDob.addEventListener('change', () => {
            const dob = new Date(profileDob.value);
            const today = new Date();
            let age = today.getFullYear() - dob.getFullYear();
            const monthDiff = today.getMonth() - dob.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
                age--;
            }
            if (age >= 0 && age < 150) {
                profileAge.value = age + ' years';
                // Trigger animation
                profileAge.classList.remove('age-active');
                void profileAge.offsetWidth; // Trigger reflow
                profileAge.classList.add('age-active');
            } else {
                profileAge.value = '';
                profileAge.classList.remove('age-active');
            }
        });
    }

    // Profile form submit
    if (profileSetupForm) {
        profileSetupForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const username = profileUsername.value.trim();
            const dob = profileDob.value;
            const standard = profileStandard.value;

            if (!username || !dob || !standard) return;

            // Calculate age
            const dobDate = new Date(dob);
            const nowDate = new Date();
            let age = nowDate.getFullYear() - dobDate.getFullYear();
            const mDiff = nowDate.getMonth() - dobDate.getMonth();
            if (mDiff < 0 || (mDiff === 0 && nowDate.getDate() < dobDate.getDate())) age--;

            // Save profile to user object
            currentUser.username = username;
            currentUser.dob = dob;
            currentUser.age = age;
            currentUser.standard = standard;
            currentUser.profileComplete = true;
            if (profilePicBase64) currentUser.profilePic = profilePicBase64;

            // Persist to local DB
            try {
                const usersStr = localStorage.getItem('db_users') || '{}';
                const users = JSON.parse(usersStr);
                if (users[currentUser.email]) {
                    users[currentUser.email].username = username;
                    users[currentUser.email].dob = dob;
                    users[currentUser.email].age = age;
                    users[currentUser.email].standard = standard;
                    users[currentUser.email].profileComplete = true;
                    if (profilePicBase64) users[currentUser.email].profilePic = profilePicBase64;
                    localStorage.setItem('db_users', JSON.stringify(users));
                }
            } catch (err) {
                console.error("Error saving profile:", err);
            }

            localStorage.setItem('auth_token', JSON.stringify(currentUser));

            // Update display name and avatar
            displayName.textContent = currentUser.username;
            if (currentUser.profilePic) {
                userAvatar.innerHTML = '<img src="' + currentUser.profilePic + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
            } else {
                userAvatar.textContent = currentUser.username.charAt(0).toUpperCase();
            }

            // Navigate to pricing page
            profileSetupPage.classList.remove('active');
            setTimeout(() => {
                if (!currentUser.plan) {
                    pricingPage.classList.add('active');
                } else {
                    dashboardPage.classList.add('active');
                    renderTodayGoals();
                    initCalendar();
                    enforceFreePlanLimits();
                }
            }, 400);
        });
    }

    async function loadUserDataAndShowDashboard() {
        // Fetch isolated user data from DB
        entries = await API.getEntries(currentUser.email);
        
        displayName.textContent = currentUser.username || currentUser.name;
        if (currentUser.profilePic) {
            userAvatar.innerHTML = '<img src="' + currentUser.profilePic + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
        } else {
            userAvatar.textContent = (currentUser.username || currentUser.name).charAt(0).toUpperCase();
        }
        
        authPage.classList.remove('active');
        
        setTimeout(() => {
            if (!currentUser.profileComplete) {
                // Show profile setup first
                profileSetupPage.classList.add('active');
            } else if (!currentUser.plan) {
                pricingPage.classList.add('active');
            } else {
                dashboardPage.classList.add('active');
                renderTodayGoals();
                initCalendar();
                enforceFreePlanLimits();
            }
        }, 400);
    }

    // --- About Me (Profile Edit) Logic ---
    const editUsername = document.getElementById('edit-username');
    const editDob = document.getElementById('edit-dob');
    const editAge = document.getElementById('edit-age');
    const editStandard = document.getElementById('edit-standard');
    const editProfilePicWrapper = document.getElementById('edit-profile-pic-wrapper');
    const editProfilePicInput = document.getElementById('edit-profile-pic-input');
    const editProfilePicPreview = document.getElementById('edit-profile-pic-preview');
    const editProfilePicPlaceholder = document.getElementById('edit-profile-pic-placeholder');
    const editProfileForm = document.getElementById('edit-profile-form');
    const profileSaveSuccess = document.getElementById('profile-save-success');
    let editProfilePicBase64 = '';

    function initProfileView() {
        if (!currentUser) return;
        
        editUsername.value = currentUser.username || currentUser.name || '';
        editDob.value = currentUser.dob || '';
        editStandard.value = currentUser.standard || '';
        
        if (currentUser.dob) {
            calculateAndDisplayAge(currentUser.dob, editAge);
        } else {
            editAge.value = '';
        }

        if (currentUser.profilePic) {
            editProfilePicPreview.src = currentUser.profilePic;
            editProfilePicPreview.style.display = 'block';
            editProfilePicPlaceholder.style.display = 'none';
            editProfilePicBase64 = currentUser.profilePic;
        } else {
            editProfilePicPreview.style.display = 'none';
            editProfilePicPlaceholder.style.display = 'block';
            editProfilePicBase64 = '';
        }
        
        profileSaveSuccess.style.display = 'none';
    }

    function calculateAndDisplayAge(dobValue, ageInput) {
        const dob = new Date(dobValue);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
            age--;
        }
        if (age >= 0 && age < 150) {
            ageInput.value = age + ' years';
            ageInput.classList.remove('age-active');
            void ageInput.offsetWidth;
            ageInput.classList.add('age-active');
        } else {
            ageInput.value = '';
            ageInput.classList.remove('age-active');
        }
        return age;
    }

    if (editDob) {
        editDob.addEventListener('change', () => {
            calculateAndDisplayAge(editDob.value, editAge);
        });
    }

    if (editProfilePicWrapper && editProfilePicInput) {
        editProfilePicWrapper.addEventListener('click', () => editProfilePicInput.click());
        editProfilePicInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                editProfilePicBase64 = ev.target.result;
                editProfilePicPreview.src = editProfilePicBase64;
                editProfilePicPreview.style.display = 'block';
                editProfilePicPlaceholder.style.display = 'none';
            };
            reader.readAsDataURL(file);
        });
    }

    if (editProfileForm) {
        editProfileForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const username = editUsername.value.trim();
            const dob = editDob.value;
            const standard = editStandard.value;
            
            if (!username || !dob || !standard) return;

            const age = calculateAndDisplayAge(dob, editAge);

            // Update currentUser
            currentUser.username = username;
            currentUser.dob = dob;
            currentUser.age = age;
            currentUser.standard = standard;
            if (editProfilePicBase64) currentUser.profilePic = editProfilePicBase64;

            // Persist
            try {
                const usersStr = localStorage.getItem('db_users') || '{}';
                const users = JSON.parse(usersStr);
                if (users[currentUser.email]) {
                    users[currentUser.email].username = username;
                    users[currentUser.email].dob = dob;
                    users[currentUser.email].age = age;
                    users[currentUser.email].standard = standard;
                    if (editProfilePicBase64) users[currentUser.email].profilePic = editProfilePicBase64;
                    localStorage.setItem('db_users', JSON.stringify(users));
                }
            } catch (err) { console.error(err); }

            localStorage.setItem('auth_token', JSON.stringify(currentUser));

            // Update UI elements
            displayName.textContent = currentUser.username;
            if (currentUser.profilePic) {
                userAvatar.innerHTML = `<img src="${currentUser.profilePic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            } else {
                userAvatar.textContent = currentUser.username.charAt(0).toUpperCase();
            }

            // Show success message
            profileSaveSuccess.style.display = 'block';
            setTimeout(() => {
                profileSaveSuccess.style.fadeOut = 'true'; // Mock fade out
                setTimeout(() => { profileSaveSuccess.style.display = 'none'; }, 2000);
            }, 3000);
        });
    }

    function saveEntries() {
        API.saveEntries(currentUser.email, entries);
        // If statistics view is currently active, refresh the chart to show updates live
        const statsView = document.getElementById('view-statistics');
        if (statsView && statsView.classList.contains('active')) {
            const activeRangeBtn = document.querySelector('.stats-controls .btn.active');
            const range = activeRangeBtn ? activeRangeBtn.getAttribute('data-range') : 'day';
            renderChart(range);
        }
    }

    // --- Today's Goals Logic ---
    addGoalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = newGoalInput.value.trim();
        if (text) {
            if (!entries[todayStr]) entries[todayStr] = [];
            entries[todayStr].push({
                id: Date.now().toString(),
                text: text,
                type: 'goal',
                completed: false
            });
            saveEntries();
            renderTodayGoals();
            newGoalInput.value = '';
        }
    });

    function renderTodayGoals() {
        goalsList.innerHTML = '';
        const todayEntries = entries[todayStr] || [];
        const todayGoals = todayEntries.filter(e => e.type === 'goal');
        
        if (todayGoals.length === 0) {
            emptyState.style.display = 'flex';
        } else {
            emptyState.style.display = 'none';
            
            todayGoals.forEach(goal => {
                const goalEl = document.createElement('div');
                goalEl.className = `goal-item ${goal.completed ? 'completed' : ''}`;
                goalEl.dataset.id = goal.id;
                
                goalEl.innerHTML = `
                    <div class="goal-content">
                        <div class="checkbox">
                            <i class="ph ph-check"></i>
                        </div>
                        <span class="goal-text">${escapeHTML(goal.text)}</span>
                    </div>
                    <button class="delete-btn">
                        <i class="ph ph-trash"></i>
                    </button>
                `;
                
                goalEl.querySelector('.goal-content').addEventListener('click', () => {
                    goal.completed = !goal.completed;
                    saveEntries();
                    renderTodayGoals();
                });
                
                goalEl.querySelector('.delete-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    goalEl.style.animation = 'slideOut 0.3s ease forwards';
                    setTimeout(() => {
                        entries[todayStr] = entries[todayStr].filter(item => item.id !== goal.id);
                        saveEntries();
                        renderTodayGoals();
                    }, 300);
                });
                
                goalsList.appendChild(goalEl);
            });
        }
        
        updateProgress();
    }

    function updateProgress() {
        const todayEntries = entries[todayStr] || [];
        const todayGoals = todayEntries.filter(e => e.type === 'goal');
        
        if (todayGoals.length === 0) {
            progressFill.style.width = '0%';
            progressPercentage.textContent = '0%';
            return;
        }
        const completedCount = todayGoals.filter(g => g.completed).length;
        const percentage = Math.round((completedCount / todayGoals.length) * 100);
        progressFill.style.width = `${percentage}%`;
        progressPercentage.textContent = `${percentage}%`;
    }
    
    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // --- Calendar Logic ---
    function initCalendar() {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        calMonthSelect.innerHTML = '';
        months.forEach((m, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = m;
            calMonthSelect.appendChild(opt);
        });

        calYearSelect.innerHTML = '';
        for (let y = 2000; y <= 2036; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            calYearSelect.appendChild(opt);
        }

        calMonthSelect.value = calCurrentDate.getMonth();
        
        let initYear = calCurrentDate.getFullYear();
        if(initYear < 2000) initYear = 2000;
        if(initYear > 2036) initYear = 2036;
        calYearSelect.value = initYear;

        calMonthSelect.addEventListener('change', updateCalendarFromSelects);
        calYearSelect.addEventListener('change', updateCalendarFromSelects);
        calTodayBtn.addEventListener('click', () => {
            calCurrentDate = new Date();
            let y = calCurrentDate.getFullYear();
            if(y < 2000) y = 2000;
            if(y > 2036) y = 2036;
            calMonthSelect.value = calCurrentDate.getMonth();
            calYearSelect.value = y;
            selectedCalDateStr = getFormattedDate(new Date(y, calCurrentDate.getMonth(), calCurrentDate.getDate()));
            renderCalendarGrid();
        });
    }

    function updateCalendarFromSelects() {
        calCurrentDate.setMonth(parseInt(calMonthSelect.value));
        calCurrentDate.setFullYear(parseInt(calYearSelect.value));
        renderCalendarGrid();
    }

    function renderCalendarGrid() {
        calGrid.innerHTML = '';
        const year = parseInt(calYearSelect.value);
        const month = parseInt(calMonthSelect.value);

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        let cellIndex = 0;
        for (let i = 0; i < firstDay; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'cal-day empty';
            emptyCell.style.animationDelay = (cellIndex * 0.02) + 's';
            calGrid.appendChild(emptyCell);
            cellIndex++;
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const dayCell = document.createElement('div');
            const dateStr = getFormattedDate(new Date(year, month, i));
            
            dayCell.className = 'cal-day';
            dayCell.style.animationDelay = (cellIndex * 0.02) + 's';
            cellIndex++;
            dayCell.textContent = i;
            
            if (dateStr === todayStr) dayCell.classList.add('today');
            if (dateStr === selectedCalDateStr) dayCell.classList.add('active');

            if (entries[dateStr] && entries[dateStr].length > 0) {
                const dot = document.createElement('div');
                dot.className = 'has-reminder-dot';
                dayCell.appendChild(dot);
            }

            dayCell.addEventListener('click', () => {
                document.querySelectorAll('.cal-day').forEach(el => el.classList.remove('active'));
                dayCell.classList.add('active');
                selectedCalDateStr = dateStr;
                renderReminders();
            });

            calGrid.appendChild(dayCell);
        }

        renderReminders();
    }

    function renderReminders() {
        const dateObj = new Date(selectedCalDateStr + 'T00:00:00');
        selectedDateText.textContent = dateObj.toLocaleDateString('en-US', options);
        remindersListEl.innerHTML = '';

        const currentEntries = entries[selectedCalDateStr] || [];
        
        if (currentEntries.length === 0) {
            remindersListEl.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">Nothing scheduled for this date.</p>';
        } else {
            currentEntries.forEach(r => {
                const rEl = document.createElement('div');
                rEl.className = 'reminder-item';
                
                let iconHtml = '';
                if (r.type === 'goal') {
                    iconHtml = `<div class="checkbox ${r.completed ? 'completed' : ''}" style="margin-right: 15px; width: 22px; height: 22px; border-radius: 6px; border: 2px solid var(--text-secondary); display: flex; align-items: center; justify-content: center; ${r.completed ? 'background: var(--success); border-color: var(--success); color: white;' : 'color: transparent;'}"><i class="ph ph-check" style="font-size: 14px;"></i></div>`;
                } else {
                    iconHtml = `<i class="ph ph-bell" style="margin-right: 15px; font-size: 1.2rem; color: var(--accent-3);"></i>`;
                }
                
                let textStyle = r.type === 'goal' && r.completed ? 'text-decoration: line-through; color: var(--text-secondary);' : 'color: var(--text-primary);';

                rEl.innerHTML = `
                    <div style="display: flex; align-items: center; cursor: ${r.type === 'goal' ? 'pointer' : 'default'}; flex-grow: 1;">
                        ${iconHtml}
                        <span style="${textStyle}">${escapeHTML(r.text)}</span>
                        <span style="margin-left: 10px; font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.1); color: var(--text-secondary);">${r.type === 'goal' ? 'Goal' : 'Reminder'}</span>
                    </div>
                    <button class="delete-btn" style="opacity: 1;" data-id="${r.id}"><i class="ph ph-trash"></i></button>
                `;

                if (r.type === 'goal') {
                    rEl.querySelector('div').addEventListener('click', () => {
                        r.completed = !r.completed;
                        saveEntries();
                        renderReminders();
                        if (selectedCalDateStr === todayStr) renderTodayGoals();
                    });
                }
                
                rEl.querySelector('.delete-btn').addEventListener('click', () => {
                    entries[selectedCalDateStr] = entries[selectedCalDateStr].filter(item => item.id !== r.id);
                    saveEntries();
                    renderReminders();
                    renderCalendarGrid();
                    if (selectedCalDateStr === todayStr) renderTodayGoals();
                });
                
                remindersListEl.appendChild(rEl);
            });
        }
    }

    addReminderForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = reminderInput.value.trim();
        const type = calendarEntryType.value;
        if (text && selectedCalDateStr) {
            if (!entries[selectedCalDateStr]) entries[selectedCalDateStr] = [];
            entries[selectedCalDateStr].push({
                id: Date.now().toString(),
                text: text,
                type: type,
                completed: false
            });
            saveEntries();
            reminderInput.value = '';
            renderReminders();
            renderCalendarGrid();
            if (selectedCalDateStr === todayStr) renderTodayGoals();
        }
    });

    // --- Statistics Logic (Chart.js) ---
    const statsControlsBtn = document.querySelectorAll('.stats-controls .btn');
    let chartInstance = null;

    statsControlsBtn.forEach(btn => {
        btn.addEventListener('click', (e) => {
            statsControlsBtn.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderChart(e.target.getAttribute('data-range'));
        });
    });

    function renderChart(range) {
        // Ensure we have real data from the entries object
        const canvas = document.getElementById('progressChart');
        if (!canvas) return;
        
        // Small timeout to ensure the container is visible and has dimensions
        setTimeout(() => {
            const ctx = canvas.getContext('2d');
            let labels = [];
            let dataPoints = [];

            if (range === 'day') {
                const todayEntries = entries[todayStr] || [];
                const todayGoals = todayEntries.filter(e => e.type === 'goal');
                let currentProg = todayGoals.length > 0 ? (todayGoals.filter(g => g.completed).length / todayGoals.length) * 100 : 0;
                
                labels = ['Start', 'Quarter', 'Halfway', 'Three-Quarters', 'Now'];
                dataPoints = [0, currentProg * 0.25, currentProg * 0.5, currentProg * 0.75, currentProg];
            } else if (range === 'week') {
                // Current week: Sunday to Saturday
                const today = new Date();
                const dayOfWeek = today.getDay(); // 0 (Sun) to 6 (Sat)
                const sunday = new Date(today);
                sunday.setDate(today.getDate() - dayOfWeek);

                for (let i = 0; i < 7; i++) {
                    const d = new Date(sunday);
                    d.setDate(sunday.getDate() + i);
                    const dStr = getFormattedDate(d);
                    const dayEntries = entries[dStr] || [];
                    const dayGoals = dayEntries.filter(e => e.type === 'goal');
                    const prog = dayGoals.length > 0 ? (dayGoals.filter(g => g.completed).length / dayGoals.length) * 100 : 0;
                    
                    labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
                    dataPoints.push(Math.round(prog));
                }
            } else if (range === 'month') {
                // Last 4 weeks
                labels = ['Week 4', 'Week 3', 'Week 2', 'This Week'];
                for (let w = 3; w >= 0; w--) {
                    let totalGoals = 0;
                    let completedGoals = 0;
                    for (let d = 0; d < 7; d++) {
                        const date = new Date();
                        date.setDate(date.getDate() - (w * 7 + d));
                        const dStr = getFormattedDate(date);
                        const dayEntries = entries[dStr] || [];
                        const dayGoals = dayEntries.filter(e => e.type === 'goal');
                        totalGoals += dayGoals.length;
                        completedGoals += dayGoals.filter(g => g.completed).length;
                    }
                    const weekProg = totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0;
                    dataPoints.push(Math.round(weekProg));
                }
            }

            const textColor = currentTheme === 'dark' ? '#f0f0f5' : '#1a1a2e';
            const gridColor = currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

            if (chartInstance) {
                chartInstance.destroy();
            }

            chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Goal Completion (%)',
                        data: dataPoints,
                        borderColor: '#6d28d9',
                        backgroundColor: 'rgba(109, 40, 217, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#ec4899',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 7
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: 1000,
                        easing: 'easeOutQuart'
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            grid: { color: gridColor },
                            ticks: { 
                                color: textColor,
                                callback: function(value) { return value + "%" }
                            }
                        },
                        x: {
                            grid: { color: gridColor },
                            ticks: { color: textColor }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false // Hide legend to make it cleaner
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 16, 21, 0.9)',
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            padding: 10,
                            cornerRadius: 8,
                            displayColors: false,
                            callbacks: {
                                label: function(context) {
                                    return `Completion: ${context.parsed.y}%`;
                                }
                            }
                        }
                    }
                }
            });
        }, 100);
    }

    // --- Tracks AI Floating Agent Logic ---
    const aiFab = document.getElementById('tracks-ai-fab');
    const aiPopup = document.getElementById('tracks-ai-popup');
    const closeAiPopup = document.getElementById('close-ai-popup');
    
    if (aiFab && aiPopup && closeAiPopup) {
        aiFab.addEventListener('click', () => {
            aiPopup.classList.toggle('active');
            if (aiPopup.classList.contains('active')) {
                aiInput.focus();
            }
        });

        closeAiPopup.addEventListener('click', () => {
            aiPopup.classList.remove('active');
        });
    }

    let aiMessages = [
        { role: "system", content: "You are Tracks AI, an intelligent, empathetic productivity assistant integrated into the Gtracks app. You help users manage their daily goals, solve personal productivity problems, and plan their exams or schedules. Keep responses concise and motivating." }
    ];

    function appendMessage(role, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${role === 'user' ? 'user-message' : 'ai-message'}`;
        
        let avatarIcon = role === 'user' ? '<i class="ph ph-user"></i>' : '<i class="ph-fill ph-sparkle tracks-ai-icon" style="font-size: 1.8rem;"></i>';
        
        let formattedText = escapeHTML(text)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');

        msgDiv.innerHTML = `
            <div class="chat-avatar">${avatarIcon}</div>
            <div class="chat-bubble">${formattedText}</div>
        `;
        chatBox.appendChild(msgDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    if (aiChatForm) {
        aiChatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = aiInput.value.trim();
            if (!text) return;

            appendMessage('user', text);
            aiInput.value = '';
            
            const loadingId = 'loading-' + Date.now();
            const msgDiv = document.createElement('div');
            msgDiv.className = 'chat-message ai-message';
            msgDiv.id = loadingId;
            msgDiv.innerHTML = `<div class="chat-avatar" style="background: transparent;"><i class="ph-fill ph-sparkle tracks-ai-icon" style="font-size: 1.8rem;"></i></div><div class="chat-bubble"><i class="ph ph-spinner ph-spin" style="margin-right: 5px;"></i> Thinking...</div>`;
            chatBox.appendChild(msgDiv);
            chatBox.scrollTop = chatBox.scrollHeight;

            aiMessages.push({ role: "user", content: text });

            try {
                let prompt = "";
                aiMessages.forEach(m => {
                    if(m.role === 'system') prompt += m.content + "\n";
                    else prompt += `${m.role === 'user' ? 'User' : 'Tracks AI'}: ${m.content}\n`;
                });
                prompt += "Tracks AI:";

                const response = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
                if (!response.ok) throw new Error('API Error');

                const aiResponseText = await response.text();
                
                aiMessages.push({ role: "assistant", content: aiResponseText });
                
                document.getElementById(loadingId).remove();
                appendMessage('model', aiResponseText);

            } catch (err) {
                document.getElementById(loadingId).remove();
                appendMessage('model', "Oops, I'm having trouble connecting to my brain right now. Try again!");
                aiMessages.pop();
            }
        });
    }

    // --- Database Configuration Logic ---
    if (saveDbConfigBtn) {
        supabaseUrlInput.value = localStorage.getItem('supabase_url') || '';
        supabaseKeyInput.value = localStorage.getItem('supabase_key') || '';

        saveDbConfigBtn.addEventListener('click', async () => {
            const url = supabaseUrlInput.value.trim();
            const key = supabaseKeyInput.value.trim();

            if (!url || !key) {
                dbStatusMsg.textContent = "Please provide both URL and Key.";
                dbStatusMsg.style.color = "var(--danger)";
                dbStatusMsg.style.display = "block";
                return;
            }

            dbStatusMsg.textContent = "Connecting...";
            dbStatusMsg.style.color = "var(--accent-1)";
            dbStatusMsg.style.display = "block";

            try {
                const testClient = supabase.createClient(url, key);
                const { error } = await testClient.from('gtracks_users').select('count', { count: 'exact', head: true });
                
                if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
                    throw error;
                }

                localStorage.setItem('supabase_url', url);
                localStorage.setItem('supabase_key', key);
                API.initSupabase();

                dbStatusMsg.textContent = "Cloud DB Connected Successfully!";
                dbStatusMsg.style.color = "var(--success)";
                
                // If logged in, sync current data
                if (currentUser) {
                    API.saveEntries(currentUser.email, entries);
                }

            } catch (err) {
                dbStatusMsg.textContent = "Connection Failed: " + err.message;
                dbStatusMsg.style.color = "var(--danger)";
            }
        });
    }
});
