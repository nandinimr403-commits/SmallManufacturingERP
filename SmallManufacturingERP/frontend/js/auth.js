/**
 * UdyogERP - Authentication & Session Management Module
 * Manages user sign-in, account creation, enterprise role-based access,
 * session persistence, and topbar identity display.
 */

const DEFAULT_DEMO_USERS = [
    {
        id: "USR-001",
        username: "admin",
        password: "admin123",
        fullName: "Rajesh Sharma",
        email: "rajesh.sharma@shreeprecision.com",
        role: "Admin",
        department: "Plant Management",
        avatarText: "RS"
    },
    {
        id: "USR-002",
        username: "manager",
        password: "manager123",
        fullName: "Vikram Deshmukh",
        email: "vikram.d@shreeprecision.com",
        role: "Plant Manager",
        department: "Production & Quality",
        avatarText: "VD"
    },
    {
        id: "USR-003",
        username: "purchase",
        password: "purchase123",
        fullName: "Amit Patel",
        email: "amit.patel@shreeprecision.com",
        role: "Purchase Officer",
        department: "Commercial Procurement",
        avatarText: "AP"
    },
    {
        id: "USR-004",
        username: "store",
        password: "store123",
        fullName: "Sunil Jadhav",
        email: "sunil.j@shreeprecision.com",
        role: "Store Keeper",
        department: "Raw Material Stores",
        avatarText: "SJ"
    },
    {
        id: "USR-005",
        username: "accounts",
        password: "accounts123",
        fullName: "Pooja Kulkarni",
        email: "pooja.k@shreeprecision.com",
        role: "Accountant",
        department: "Finance & Taxation",
        avatarText: "PK"
    }
];

const AuthManager = {
    currentUser: null,
    token: null,
    listeners: [],

    init() {
        // Retrieve persisted token and user
        const storedToken = localStorage.getItem("udyog_auth_token");
        const storedUser = localStorage.getItem("udyog_auth_user");

        if (storedToken && storedUser) {
            try {
                this.token = storedToken;
                this.currentUser = JSON.parse(storedUser);
            } catch (e) {
                this.currentUser = null;
                this.token = null;
            }
        }

        // Default to Admin demo user if no user is signed in
        if (!this.currentUser) {
            this.currentUser = DEFAULT_DEMO_USERS[0];
            this.token = "demo_token_admin_001";
            localStorage.setItem("udyog_auth_user", JSON.stringify(this.currentUser));
            localStorage.setItem("udyog_auth_token", this.token);
        }

        this.renderUserBadge();
        this.verifyWithBackend();
    },

    subscribe(callback) {
        this.listeners.push(callback);
    },

    notifyChange() {
        this.listeners.forEach(cb => cb(this.currentUser));
    },

    async verifyWithBackend() {
        if (!this.token || !StorageManager.apiBaseUrl) return;

        try {
            const res = await fetch(`${StorageManager.apiBaseUrl}/auth/me`, {
                headers: { "Authorization": `Bearer ${this.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.authenticated && data.user) {
                    this.currentUser = data.user;
                    localStorage.setItem("udyog_auth_user", JSON.stringify(this.currentUser));
                    this.renderUserBadge();
                }
            }
        } catch (e) {
            // Backend offline, keep local session
        }
    },

    async login(usernameOrEmail, password) {
        const u = usernameOrEmail.trim().toLowerCase();
        const p = password.trim();

        if (!u || !p) {
            App.showToast("Validation Error", "Please enter both username/email and password", "warning");
            return false;
        }

        // Try backend login first if connected
        if (StorageManager.isBackendConnected) {
            try {
                const res = await fetch(`${StorageManager.apiBaseUrl}/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ username: u, password: p })
                });
                const data = await res.json();
                if (res.ok && data.token) {
                    this.token = data.token;
                    this.currentUser = data.user;
                    localStorage.setItem("udyog_auth_token", this.token);
                    localStorage.setItem("udyog_auth_user", JSON.stringify(this.currentUser));
                    this.renderUserBadge();
                    this.notifyChange();
                    this.closeLoginModal();
                    App.showToast("Sign In Successful", `Welcome back, ${this.currentUser.fullName} (${this.currentUser.role})`, "success");
                    return true;
                } else {
                    App.showToast("Sign In Failed", data.error || "Invalid username or password", "danger");
                    return false;
                }
            } catch (err) {
                console.warn("Backend auth failed, falling back to local verification:", err);
            }
        }

        // Fallback local demo account verification
        const demoUser = DEFAULT_DEMO_USERS.find(user => 
            (user.username.toLowerCase() === u || user.email.toLowerCase() === u) && user.password === p
        );

        if (demoUser) {
            this.currentUser = { ...demoUser };
            delete this.currentUser.password;
            this.token = `local_token_${demoUser.id}_${Date.now()}`;
            localStorage.setItem("udyog_auth_token", this.token);
            localStorage.setItem("udyog_auth_user", JSON.stringify(this.currentUser));
            this.renderUserBadge();
            this.notifyChange();
            this.closeLoginModal();
            App.showToast("Sign In Successful", `Signed in as ${this.currentUser.fullName} (${this.currentUser.role})`, "success");
            return true;
        }

        App.showToast("Sign In Failed", "Invalid credentials. Use a demo quick-fill or register a new user.", "danger");
        return false;
    },

    async register(username, password, fullName, email, role, department) {
        if (!username || !password || !fullName || !email) {
            App.showToast("Validation Error", "Please fill in all required registration fields", "warning");
            return false;
        }

        if (password.length < 6) {
            App.showToast("Password Too Short", "Password must be at least 6 characters long", "warning");
            return false;
        }

        // Try backend registration if connected
        if (StorageManager.isBackendConnected) {
            try {
                const res = await fetch(`${StorageManager.apiBaseUrl}/auth/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: username.trim(),
                        password: password.trim(),
                        fullName: fullName.trim(),
                        email: email.trim(),
                        role: role || "Plant Manager",
                        department: department || "Manufacturing"
                    })
                });
                const data = await res.json();
                if (res.ok && data.token) {
                    this.token = data.token;
                    this.currentUser = data.user;
                    localStorage.setItem("udyog_auth_token", this.token);
                    localStorage.setItem("udyog_auth_user", JSON.stringify(this.currentUser));
                    this.renderUserBadge();
                    this.notifyChange();
                    this.closeLoginModal();
                    App.showToast("Account Created", `Welcome to UdyogERP, ${this.currentUser.fullName}!`, "success");
                    return true;
                } else {
                    App.showToast("Registration Failed", data.error || "Could not create user account", "danger");
                    return false;
                }
            } catch (err) {
                console.warn("Backend registration error, using local:", err);
            }
        }

        // Fallback local registration
        const names = fullName.trim().split(" ");
        const avatarText = names.map(n => n[0].toUpperCase()).slice(0, 2).join("");
        const newUser = {
            id: `USR-${Date.now().toString().slice(-4)}`,
            username: username.trim(),
            fullName: fullName.trim(),
            email: email.trim(),
            role: role || "Plant Manager",
            department: department || "Operations",
            avatarText: avatarText || "U"
        };

        this.currentUser = newUser;
        this.token = `local_token_${newUser.id}_${Date.now()}`;
        localStorage.setItem("udyog_auth_token", this.token);
        localStorage.setItem("udyog_auth_user", JSON.stringify(this.currentUser));
        this.renderUserBadge();
        this.notifyChange();
        this.closeLoginModal();
        App.showToast("Account Created", `Registered and signed in as ${newUser.fullName} (${newUser.role})`, "success");
        return true;
    },

    quickLogin(username) {
        const demoUser = DEFAULT_DEMO_USERS.find(u => u.username === username);
        if (demoUser) {
            return this.login(demoUser.username, demoUser.password);
        }
    },

    async logout() {
        if (this.token && StorageManager.isBackendConnected) {
            try {
                await fetch(`${StorageManager.apiBaseUrl}/auth/logout`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${this.token}` }
                });
            } catch (e) {
                // ignore
            }
        }

        this.currentUser = null;
        this.token = null;
        localStorage.removeItem("udyog_auth_token");
        localStorage.removeItem("udyog_auth_user");

        this.renderUserBadge();
        this.notifyChange();
        App.showToast("Signed Out", "You have been safely signed out of UdyogERP.", "info");
        
        // Re-prompt sign-in modal
        setTimeout(() => {
            this.openLoginModal();
        }, 500);
    },

    getCurrentUser() {
        return this.currentUser;
    },

    getUserRole() {
        return this.currentUser ? this.currentUser.role : "Guest";
    },

    hasRole(...roles) {
        if (!this.currentUser) return false;
        if (this.currentUser.role === "Admin") return true; // Admin has universal access
        return roles.includes(this.currentUser.role);
    },

    openLoginModal(tab = "login") {
        const modal = document.getElementById("modal-auth");
        if (!modal) return;

        this.switchAuthTab(tab);
        App.openModal("modal-auth");
    },

    closeLoginModal() {
        App.closeModal("modal-auth");
    },

    switchAuthTab(tab) {
        const tabLogin = document.getElementById("auth-tab-btn-login");
        const tabRegister = document.getElementById("auth-tab-btn-register");
        const formLogin = document.getElementById("auth-form-login");
        const formRegister = document.getElementById("auth-form-register");

        if (tab === "login") {
            if (tabLogin) tabLogin.classList.add("active");
            if (tabRegister) tabRegister.classList.remove("active");
            if (formLogin) formLogin.style.display = "block";
            if (formRegister) formRegister.style.display = "none";
        } else {
            if (tabRegister) tabRegister.classList.add("active");
            if (tabLogin) tabLogin.classList.remove("active");
            if (formRegister) formRegister.style.display = "block";
            if (formLogin) formLogin.style.display = "none";
        }
    },

    renderUserBadge() {
        const container = document.getElementById("topbar-user-area");
        if (!container) return;

        if (!this.currentUser) {
            container.innerHTML = `
                <button class="btn btn-sm btn-primary" onclick="AuthManager.openLoginModal('login')">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
                    <span>Sign In</span>
                </button>
            `;
            return;
        }

        const initials = this.currentUser.avatarText || this.currentUser.fullName.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

        container.innerHTML = `
            <div class="user-dropdown-wrapper">
                <button class="user-profile-btn" id="user-profile-btn" onclick="AuthManager.toggleUserDropdown()">
                    <div class="user-avatar">${initials}</div>
                    <div class="user-meta">
                        <span class="user-name">${this.currentUser.fullName}</span>
                        <span class="user-role-badge">${this.currentUser.role}</span>
                    </div>
                    <svg class="dropdown-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>

                <div class="user-dropdown-menu" id="user-dropdown-menu">
                    <div class="dropdown-user-header">
                        <div class="dropdown-avatar-lg">${initials}</div>
                        <div>
                            <div class="dropdown-name">${this.currentUser.fullName}</div>
                            <div class="dropdown-email">${this.currentUser.email}</div>
                            <div class="dropdown-badge-row">
                                <span class="badge badge-primary">${this.currentUser.role}</span>
                                <span class="dropdown-dept">${this.currentUser.department || 'Operations'}</span>
                            </div>
                        </div>
                    </div>

                    <div class="dropdown-divider"></div>

                    <div class="dropdown-section-title">Database Storage Status</div>
                    <div class="dropdown-db-status" onclick="StorageManager.openDatabaseModal()">
                        <div class="db-status-dot ${StorageManager.isBackendConnected ? 'dot-online' : 'dot-local'}"></div>
                        <div class="db-status-info">
                            <span class="db-status-title">${StorageManager.isBackendConnected ? 'SQLite 3 Database (Connected)' : 'Local Browser Database (Active)'}</span>
                            <span class="db-status-sub">${StorageManager.isBackendConnected ? 'Fast ACID relational persistence' : 'Click to inspect / test connection'}</span>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </div>

                    <div class="dropdown-divider"></div>

                    <div class="dropdown-section-title">Quick Switch Demo Profile</div>
                    <div class="dropdown-quick-switch">
                        ${DEFAULT_DEMO_USERS.map(u => `
                            <button class="quick-switch-item ${u.username === this.currentUser.username ? 'active' : ''}" onclick="AuthManager.quickLogin('${u.username}')">
                                <span class="switch-initials">${u.avatarText}</span>
                                <div class="switch-text">
                                    <span class="switch-name">${u.fullName}</span>
                                    <span class="switch-role">${u.role}</span>
                                </div>
                            </button>
                        `).join("")}
                    </div>

                    <div class="dropdown-divider"></div>

                    <button class="dropdown-item text-danger" onclick="AuthManager.logout()">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        <span>Sign Out</span>
                    </button>
                </div>
            </div>
        `;
    },

    toggleUserDropdown() {
        const menu = document.getElementById("user-dropdown-menu");
        if (menu) {
            menu.classList.toggle("open");
        }
    }
};

// Global click listener to close dropdown when clicking outside
document.addEventListener("click", (e) => {
    const wrapper = document.querySelector(".user-dropdown-wrapper");
    const menu = document.getElementById("user-dropdown-menu");
    if (wrapper && menu && !wrapper.contains(e.target)) {
        menu.classList.remove("open");
    }
});
