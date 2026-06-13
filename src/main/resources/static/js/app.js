// Global State
const state = {
    user: null, // Logged in user info
    client: null, // Client profile details (if role is client)
    store: null, // Store info (name, address)
    items: [],
    suppliers: [],
    promotions: [],
    orders: [],
    cart: [], // [{itemId, quantity}]
    currentView: 'catalog'
};

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    
    // Logo redirect
    document.getElementById('nav-logo').addEventListener('click', () => {
        navigate('catalog');
    });
    
    // Setup modal close
    document.getElementById('close-invoice-modal').addEventListener('click', closeInvoiceModal);
    document.getElementById('invoice-modal-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'invoice-modal-overlay') closeInvoiceModal();
    });
});

async function initApp() {
    await fetchStoreInfo();
    await checkAuth();
    
    // Router based on hash change
    window.addEventListener('hashchange', handleRouting);
    handleRouting();
}

// --- Routing ---
function handleRouting() {
    const hash = window.location.hash.substring(1) || 'catalog';
    
    // Redirect if not logged in
    if (!state.user && hash !== 'login' && hash !== 'register') {
        window.location.hash = 'login';
        return;
    }
    
    // Redirect if logged in and trying to go to login
    if (state.user && (hash === 'login' || hash === 'register')) {
        window.location.hash = 'catalog';
        return;
    }
    
    state.currentView = hash;
    updateNavActiveState();
    
    switch (hash) {
        case 'login':
            renderLogin(false);
            break;
        case 'register':
            renderLogin(true);
            break;
        case 'catalog':
            renderCatalog();
            break;
        case 'cart':
            renderCart();
            break;
        case 'accounts':
            renderAccounts();
            break;
        case 'orders':
            renderOrders();
            break;
        case 'moderator':
            if (state.user.role === 'moderator' || state.user.role === 'admin') {
                renderModerator();
            } else {
                navigate('catalog');
            }
            break;
        case 'admin':
            if (state.user.role === 'admin') {
                renderAdmin();
            } else {
                navigate('catalog');
            }
            break;
        default:
            renderCatalog();
    }
}

function navigate(view) {
    window.location.hash = view;
}

function updateNavActiveState() {
    const navMenu = document.getElementById('nav-menu');
    const navUserInfo = document.getElementById('nav-user-info');
    
    if (!state.user) {
        navMenu.innerHTML = `
            <li><a class="nav-link ${state.currentView === 'login' ? 'active' : ''}" href="#login">Вход</a></li>
            <li><a class="nav-link ${state.currentView === 'register' ? 'active' : ''}" href="#register">Регистрация</a></li>
        `;
        navUserInfo.style.display = 'none';
        return;
    }
    
    let menuItems = `
        <li><a class="nav-link ${state.currentView === 'catalog' ? 'active' : ''}" href="#catalog"><i class="fas fa-store"></i> Каталог</a></li>
    `;
    
    if (state.user.role === 'client') {
        const cartCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
        menuItems += `
            <li><a class="nav-link ${state.currentView === 'cart' ? 'active' : ''}" href="#cart"><i class="fas fa-shopping-cart"></i> Количка <span style="background:var(--primary); padding: 0.1rem 0.4rem; border-radius:10px; font-size:0.75rem;">${cartCount}</span></a></li>
            <li><a class="nav-link ${state.currentView === 'accounts' ? 'active' : ''}" href="#accounts"><i class="fas fa-university"></i> Банкови сметки</a></li>
            <li><a class="nav-link ${state.currentView === 'orders' ? 'active' : ''}" href="#orders"><i class="fas fa-history"></i> Поръчки и Сметки</a></li>
        `;
    }
    
    if (state.user.role === 'moderator' || state.user.role === 'admin') {
        menuItems += `
            <li><a class="nav-link ${state.currentView === 'moderator' ? 'active' : ''}" href="#moderator"><i class="fas fa-tasks"></i> Модераторски Панел</a></li>
        `;
    }
    
    if (state.user.role === 'admin') {
        menuItems += `
            <li><a class="nav-link ${state.currentView === 'admin' ? 'active' : ''}" href="#admin"><i class="fas fa-user-shield"></i> Админ Панел</a></li>
        `;
    }
    
    navMenu.innerHTML = menuItems;
    
    let roleText = 'Клиент';
    if (state.user.role === 'moderator') roleText = 'Модератор';
    if (state.user.role === 'admin') roleText = 'Администратор';
    
    navUserInfo.style.display = 'flex';
    navUserInfo.className = 'user-badge';
    navUserInfo.innerHTML = `
        <span><i class="fas fa-user"></i> <strong>${state.user.username}</strong> (${roleText})</span>
        <button class="btn-logout" onclick="logout()">Изход</button>
    `;
}

// --- API Calls ---

async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
            const data = await res.json();
            state.user = data.user;
            state.client = data.client;
            if (localStorage.getItem(`cart_${state.user.username}`)) {
                state.cart = JSON.parse(localStorage.getItem(`cart_${state.user.username}`));
            } else {
                state.cart = [];
            }
        } else {
            state.user = null;
            state.client = null;
            state.cart = [];
        }
    } catch (e) {
        console.error("Auth check failed", e);
    }
}

async function fetchStoreInfo() {
    try {
        const res = await fetch('/api/store');
        if (res.ok) {
            state.store = await res.json();
        }
    } catch (e) {
        console.error("Fetch store info failed", e);
    }
}

async function fetchCatalogData() {
    try {
        const [itemsRes, suppliersRes, promotionsRes] = await Promise.all([
            fetch('/api/items'),
            fetch('/api/suppliers'),
            fetch('/api/promotions')
        ]);
        
        if (itemsRes.ok) state.items = await itemsRes.json();
        if (suppliersRes.ok) state.suppliers = await suppliersRes.json();
        if (promotionsRes.ok) state.promotions = await promotionsRes.json();
    } catch (e) {
        showToast("Грешка при извличане на каталога", "danger");
    }
}

async function logout() {
    try {
        const res = await fetch('/api/auth/logout', { method: 'POST' });
        if (res.ok) {
            state.user = null;
            state.client = null;
            state.cart = [];
            showToast("Успешно излязохте от профила си", "success");
            navigate('login');
        }
    } catch (e) {
        showToast("Грешка при излизане", "danger");
    }
}

// --- Views Rendering ---

// 1. LOGIN & REGISTER VIEW
function renderLogin(isRegister = false) {
    const view = document.getElementById('app-view');
    
    view.innerHTML = `
        <div class="auth-wrapper card">
            <div class="auth-tabs">
                <div class="auth-tab ${!isRegister ? 'active' : ''}" onclick="navigate('login')">Вход</div>
                <div class="auth-tab ${isRegister ? 'active' : ''}" onclick="navigate('register')">Регистрация</div>
            </div>
            
            <div id="auth-alert" style="display:none;"></div>
            
            <form id="auth-form">
                <div class="form-group">
                    <label for="username">Потребителско име</label>
                    <input type="text" id="username" class="form-control" placeholder="Въведете потребителско име" required autocomplete="username">
                </div>
                
                <div class="form-group">
                    <label for="password">Парола</label>
                    <input type="password" id="password" class="form-control" placeholder="Въведете парола" required autocomplete="current-password">
                </div>
                
                ${isRegister ? `
                    <div class="form-group">
                        <label for="firstName">Собствено име</label>
                        <input type="text" id="firstName" class="form-control" placeholder="Иван" required>
                    </div>
                    <div class="form-group">
                        <label for="lastName">Фамилно име</label>
                        <input type="text" id="lastName" class="form-control" placeholder="Иванов" required>
                    </div>
                    
                    <div style="border-top: 1px solid var(--card-border); padding-top: 1rem; margin-top: 1.5rem;">
                        <h4 style="margin-bottom: 0.5rem; font-size: 0.95rem; color: var(--secondary);">Банкови сметки</h4>
                        <p style="font-size:0.8rem; color: var(--text-muted); margin-bottom: 1rem;">Изисква се поне една банкова сметка за приключване на сметки.</p>
                        
                        <div id="bank-accounts-container">
                            <div class="bank-account-row">
                                <input type="text" placeholder="Име на Банка (напр. ОББ)" class="form-control bank-name" required>
                                <input type="text" placeholder="IBAN Номер на сметка" class="form-control bank-iban" required>
                            </div>
                        </div>
                        
                        <button type="button" class="btn btn-secondary btn-sm" id="btn-add-bank-row" style="margin-top:0.5rem;">
                            <i class="fas fa-plus"></i> Добави сметка
                        </button>
                    </div>
                ` : ''}
                
                <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1.5rem;">
                    ${isRegister ? 'Регистрация' : 'Вход в системата'}
                </button>
            </form>
        </div>
    `;
    
    // Bind register add bank account row
    if (isRegister) {
        document.getElementById('btn-add-bank-row').addEventListener('click', () => {
            const container = document.getElementById('bank-accounts-container');
            const row = document.createElement('div');
            row.className = 'bank-account-row';
            row.innerHTML = `
                <input type="text" placeholder="Име на Банка" class="form-control bank-name">
                <input type="text" placeholder="IBAN Номер на сметка" class="form-control bank-iban">
                <button type="button" class="btn btn-danger btn-sm remove-row" style="padding: 0.8rem 1rem;">&times;</button>
            `;
            container.appendChild(row);
            
            row.querySelector('.remove-row').addEventListener('click', () => row.remove());
        });
    }
    
    // Submit form
    document.getElementById('auth-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const passwordHash = document.getElementById('password').value;
        const alertBox = document.getElementById('auth-alert');
        
        alertBox.style.display = 'none';
        
        if (isRegister) {
            const firstName = document.getElementById('firstName').value;
            const lastName = document.getElementById('lastName').value;
            
            const bankNameInputs = document.querySelectorAll('.bank-name');
            const bankIbanInputs = document.querySelectorAll('.bank-iban');
            const bankAccounts = [];
            
            for (let i = 0; i < bankNameInputs.length; i++) {
                if (bankNameInputs[i].value && bankIbanInputs[i].value) {
                    bankAccounts.push({
                        bankName: bankNameInputs[i].value,
                        accountNumber: bankIbanInputs[i].value
                    });
                }
            }
            
            if (bankAccounts.length === 0) {
                alertBox.className = 'alert alert-danger';
                alertBox.innerText = 'Трябва да добавите поне една валидна банкова сметка!';
                alertBox.style.display = 'block';
                return;
            }
            
            try {
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, passwordHash, firstName, lastName, bankAccounts })
                });
                
                const data = await res.json();
                if (res.ok) {
                    showToast("Успешна регистрация! Влезте в профила си.", "success");
                    navigate('login');
                } else {
                    alertBox.className = 'alert alert-danger';
                    alertBox.innerText = data.error || 'Възникна грешка при регистрацията';
                    alertBox.style.display = 'block';
                }
            } catch (e) {
                alertBox.className = 'alert alert-danger';
                alertBox.innerText = 'Връзката със сървъра бе прекъсната';
                alertBox.style.display = 'block';
            }
        } else {
            // Login
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, passwordHash })
                });
                
                const data = await res.json();
                if (res.ok) {
                    showToast(`Добре дошли, ${data.username}!`, "success");
                    await initApp();
                    navigate('catalog');
                } else {
                    alertBox.className = 'alert alert-danger';
                    alertBox.innerText = data.error || 'Грешна парола или потребителско име';
                    alertBox.style.display = 'block';
                }
            } catch (e) {
                alertBox.className = 'alert alert-danger';
                alertBox.innerText = 'Връзката със сървъра бе прекъсната';
                alertBox.style.display = 'block';
            }
        }
    });
}

// 2. CATALOG VIEW
async function renderCatalog() {
    const view = document.getElementById('app-view');
    view.innerHTML = `
        <div style="text-align: center; padding: 5rem 0;">
            <i class="fas fa-spinner fa-spin fa-2x" style="color:var(--primary);"></i>
            <p style="margin-top:1rem; color:var(--text-muted);">Зареждане на каталога...</p>
        </div>
    `;
    
    await fetchCatalogData();
    
    const now = new Date();
    
    let html = `
        <div class="card" style="padding: 1.5rem 2rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
            <div>
                <h1 style="margin-bottom:0.2rem;" class="gradient-text">${state.store?.name || 'Мини Маркет'}</h1>
                <p style="color:var(--text-muted); font-size:0.9rem;"><i class="fas fa-map-marker-alt" style="color:var(--danger)"></i> ${state.store?.address || ''}</p>
            </div>
            <div>
                <span class="user-badge" style="background: rgba(138,43,226,0.1); border-color:var(--primary); font-size:0.9rem;">
                    Добре дошли, ${state.user.username}!
                </span>
            </div>
        </div>
        
        <h2 style="margin-bottom:1.5rem;">Нашите Артикули</h2>
    `;
    
    if (state.items.length === 0) {
        html += `
            <div class="card" style="text-align:center; padding:4rem;">
                <i class="fas fa-boxes fa-3x" style="color:var(--text-muted); margin-bottom:1rem;"></i>
                <p style="color:var(--text-muted);">В момента няма налични артикули в магазина.</p>
            </div>
        `;
    } else {
        html += `<div class="grid-catalog">`;
        
        state.items.forEach(item => {
            // Check active promotion
            let activePromo = null;
            state.promotions.forEach(promo => {
                const start = new Date(promo.startDate);
                const end = new Date(promo.endDate);
                if (promo.itemIds.includes(item.id) && now >= start && now <= end) {
                    if (!activePromo || promo.discountPercent > activePromo.discountPercent) {
                        activePromo = promo;
                    }
                }
            });
            
            const finalPrice = activePromo 
                ? (item.price * (1 - (activePromo.discountPercent / 100))).toFixed(2) 
                : item.price.toFixed(2);
                
            const itemSuppliers = state.suppliers
                .filter(s => item.supplierIds.includes(s.id))
                .map(s => s.name)
                .join(', ') || 'Няма посочени';
            
            html += `
                <div class="card catalog-card">
                    <div class="catalog-header">
                        <span class="category-tag">${item.category}</span>
                        <span class="price-class ${item.itemClass}">${item.itemClass}</span>
                    </div>
                    <div class="item-title">${item.name}</div>
                    <div class="item-desc">${item.description}</div>
                    <div class="item-suppliers">
                        <i class="fas fa-truck-loading"></i> Доставчици: <strong>${itemSuppliers}</strong>
                    </div>
                    <div class="item-footer">
                        <div class="item-price">
                            ${activePromo ? `
                                <div class="promo-price-wrapper">
                                    <span class="old-price">${item.price.toFixed(2)} лв.</span>
                                    <span>${finalPrice} лв.</span>
                                    <span class="promo-badge">-${activePromo.discountPercent}% (${activePromo.name})</span>
                                </div>
                            ` : `
                                <span>${finalPrice} лв.</span>
                            `}
                        </div>
                        ${state.user.role === 'client' ? `
                            <button class="btn btn-primary btn-sm" onclick="addToCart(${item.id})">
                                <i class="fas fa-cart-plus"></i> Купи
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    view.innerHTML = html;
}

// 3. CART VIEW
function renderCart() {
    const view = document.getElementById('app-view');
    
    if (state.cart.length === 0) {
        view.innerHTML = `
            <div class="card" style="text-align:center; padding: 5rem 2rem;">
                <i class="fas fa-shopping-basket fa-4x" style="color:var(--text-muted); margin-bottom: 1.5rem;"></i>
                <h2>Вашата количка е празна</h2>
                <p style="color:var(--text-muted); margin-bottom: 2rem;">Разгледайте нашите артикули и добавете любимите си продукти.</p>
                <a href="#catalog" class="btn btn-primary">Към Каталога</a>
            </div>
        `;
        return;
    }
    
    const now = new Date();
    let subtotal = 0;
    let totalDiscount = 0;
    
    let itemsHtml = '';
    
    state.cart.forEach(cartItem => {
        const item = state.items.find(i => i.id === cartItem.itemId);
        if (!item) return;
        
        // Check promotion
        let activePromo = null;
        state.promotions.forEach(promo => {
            const start = new Date(promo.startDate);
            const end = new Date(promo.endDate);
            if (promo.itemIds.includes(item.id) && now >= start && now <= end) {
                if (!activePromo || promo.discountPercent > activePromo.discountPercent) {
                    activePromo = promo;
                }
            }
        });
        
        const price = item.price;
        const discountPercent = activePromo ? activePromo.discountPercent : 0;
        const discountAmount = (price * (discountPercent / 100)) * cartItem.quantity;
        const finalPrice = (price * cartItem.quantity) - discountAmount;
        
        subtotal += price * cartItem.quantity;
        totalDiscount += discountAmount;
        
        itemsHtml += `
            <tr>
                <td>
                    <strong>${item.name}</strong><br>
                    <span class="price-class ${item.itemClass}" style="font-size:0.7rem; padding: 0.1rem 0.4rem;">${item.itemClass}</span>
                    <span style="font-size:0.8rem; color:var(--text-muted); margin-left: 0.5rem;">кат. ${item.category}</span>
                </td>
                <td style="text-align:right;">${price.toFixed(2)} лв.</td>
                <td>
                    <div class="quantity-controls">
                        <button class="btn-qty" onclick="changeQuantity(${item.id}, -1)">-</button>
                        <span style="font-weight:600; width: 20px; text-align:center;">${cartItem.quantity}</span>
                        <button class="btn-qty" onclick="changeQuantity(${item.id}, 1)">+</button>
                    </div>
                </td>
                <td style="color: var(--danger); text-align:right;">
                    ${discountAmount > 0 ? `-${discountAmount.toFixed(2)} лв. (${discountPercent}%)` : '0.00 лв.'}
                </td>
                <td style="text-align:right; font-weight:600;">${finalPrice.toFixed(2)} лв.</td>
            </tr>
        `;
    });
    
    const grandTotal = subtotal - totalDiscount;
    
    // Generate Bank Account Select option
    const accounts = state.client?.bankAccounts || [];
    let accountsHtml = '<option value="">-- Изберете банкова сметка --</option>';
    accounts.forEach(acc => {
        accountsHtml += `<option value="${acc.id}">${acc.bankName} - ${acc.accountNumber}</option>`;
    });
    
    view.innerHTML = `
        <h2 style="margin-bottom: 1.5rem;"><i class="fas fa-shopping-cart" style="color:var(--primary)"></i> Вашата Пазарска Количка</h2>
        
        <div class="card" style="padding: 1.5rem; overflow-x: auto;">
            <table class="cart-table">
                <thead>
                    <tr>
                        <th>Артикул</th>
                        <th style="text-align:right;">Ед. цена</th>
                        <th>Количество</th>
                        <th style="text-align:right;">Отстъпка</th>
                        <th style="text-align:right;">Крайна сума</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
            
            <div class="checkout-box">
                <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; color:var(--text-muted);">
                    <span>Междинна сума:</span>
                    <span>${subtotal.toFixed(2)} лв.</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:0.8rem; color:var(--danger);">
                    <span>Спестени от промоции:</span>
                    <span>-${totalDiscount.toFixed(2)} лв.</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:1.5rem; border-top: 1px solid var(--card-border); padding-top:0.8rem; font-size:1.3rem; font-weight:700;">
                    <span>Общо за плащане:</span>
                    <span style="color: var(--secondary);">${grandTotal.toFixed(2)} лв.</span>
                </div>
                
                <form id="checkout-form" style="border-top:1px solid var(--card-border); padding-top:1.5rem;">
                    <div class="form-group">
                        <label for="checkout-bank">Банкова сметка за приключване на сметка <span style="color:var(--danger)">*</span></label>
                        <select id="checkout-bank" class="form-control" required>
                            ${accountsHtml}
                        </select>
                        <p style="font-size: 0.8rem; color:var(--text-muted); margin-top: 0.3rem;">
                            <i class="fas fa-info-circle"></i> За приключване на сметката се изисква избор на банкова сметка. Можете да добавите нова сметка от меню "Банкови сметки".
                        </p>
                    </div>
                    
                    <button type="submit" class="btn btn-primary" style="width:100%; display:flex; justify-content:center; align-items:center; gap:0.5rem;">
                        <i class="fas fa-credit-card"></i> Приключи и плати (${grandTotal.toFixed(2)} лв.)
                    </button>
                </form>
            </div>
        </div>
    `;
    
    document.getElementById('checkout-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const bankAccountId = parseInt(document.getElementById('checkout-bank').value);
        if (!bankAccountId) {
            showToast("Моля, изберете банкова сметка за плащане!", "danger");
            return;
        }
        
        try {
            const res = await fetch('/api/orders/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bankAccountId: bankAccountId,
                    items: state.cart
                })
            });
            
            const data = await res.json();
            if (res.ok) {
                showToast("Плащането бе приключено успешно! Сметката е генерирана.", "success");
                state.cart = [];
                localStorage.removeItem(`cart_${state.user.username}`);
                updateNavActiveState();
                
                // Show invoice receipt modal
                showInvoiceModal(data.invoice);
                navigate('orders');
            } else {
                showToast(data.error || "Грешка при приключване на сметката", "danger");
            }
        } catch (err) {
            showToast("Връзката с базата данни пропадна", "danger");
        }
    });
}

// 4. CLIENT BANK ACCOUNTS VIEW
function renderAccounts() {
    const view = document.getElementById('app-view');
    const accounts = state.client?.bankAccounts || [];
    
    let listHtml = '';
    if (accounts.length === 0) {
        listHtml = `
            <div style="text-align:center; padding:2rem; color:var(--text-muted);">
                Нямате въведени банкови сметки. Добавете поне една, за да можете да пазарувате.
            </div>
        `;
    } else {
        listHtml = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Име на банка</th>
                        <th>IBAN номер</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${accounts.map(acc => `
                        <tr>
                            <td><strong>${acc.bankName}</strong></td>
                            <td><code>${acc.accountNumber}</code></td>
                            <td>
                                <button class="btn btn-danger btn-sm" onclick="deleteBankAccount(${acc.id})">
                                    <i class="fas fa-trash"></i> Изтрий
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }
    
    view.innerHTML = `
        <h2 style="margin-bottom: 1.5rem;"><i class="fas fa-university" style="color:var(--primary)"></i> Управление на Вашите Банкови Сметки</h2>
        
        <div style="display:grid; grid-template-columns: 1fr 2fr; gap: 2rem; align-items:start;">
            <div class="card">
                <h3>Добавяне на банкова сметка</h3>
                <form id="add-bank-form">
                    <div class="form-group">
                        <label for="bankName">Име на банка</label>
                        <input type="text" id="bankName" class="form-control" placeholder="напр. ОББ, ДСК" required>
                    </div>
                    <div class="form-group">
                        <label for="iban">IBAN на сметката</label>
                        <input type="text" id="iban" class="form-control" placeholder="BG..." required>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width:100%;">Добави сметка</button>
                </form>
            </div>
            
            <div class="card" style="padding: 1.5rem;">
                <h3>Въведени банкови сметки</h3>
                ${listHtml}
            </div>
        </div>
    `;
    
    document.getElementById('add-bank-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const bankName = document.getElementById('bankName').value;
        const accountNumber = document.getElementById('iban').value;
        
        try {
            const res = await fetch(`/api/clients/${state.client.id}/bank-accounts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bankName, accountNumber })
            });
            
            const data = await res.json();
            if (res.ok) {
                showToast("Банковата сметка е добавена успешно", "success");
                await checkAuth(); // reload accounts list
                renderAccounts();
            } else {
                showToast(data.error || "Грешка при добавяне на сметка", "danger");
            }
        } catch (err) {
            showToast("Сървърна грешка при базата данни", "danger");
        }
    });
}

async function deleteBankAccount(accId) {
    if (!confirm("Наистина ли искате да изтриете тази банкова сметка?")) return;
    try {
        const res = await fetch(`/api/clients/${state.client.id}/bank-accounts/${accId}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            showToast("Сметката е изтрита", "success");
            await checkAuth();
            renderAccounts();
        } else {
            const data = await res.json();
            showToast(data.error || "Грешка при изтриване", "danger");
        }
    } catch (e) {
        showToast("Неуспешно изтриване", "danger");
    }
}

// 5. CLIENT ORDERS & INVOICES VIEW
async function renderOrders() {
    const view = document.getElementById('app-view');
    view.innerHTML = `<p style="text-align:center;">Зареждане на поръчки...</p>`;
    
    try {
        const res = await fetch('/api/orders');
        if (res.ok) {
            state.orders = await res.json();
        }
    } catch (e) {
        showToast("Грешка при изтегляне на поръчките", "danger");
    }
    
    if (state.orders.length === 0) {
        view.innerHTML = `
            <div class="card" style="text-align:center; padding: 4rem 2rem;">
                <i class="fas fa-receipt fa-3x" style="color:var(--text-muted); margin-bottom:1rem;"></i>
                <h2>Нямате направени покупки</h2>
                <p style="color:var(--text-muted); margin-bottom: 2rem;">След като приключите първата си количка, сметката Ви ще се появи тук.</p>
                <a href="#catalog" class="btn btn-primary">Към Каталога</a>
            </div>
        `;
        return;
    }
    
    let html = `
        <h2 style="margin-bottom: 1.5rem;"><i class="fas fa-history" style="color:var(--primary)"></i> Вашите Сметки и Поръчки</h2>
        <div class="card" style="padding: 1.5rem;">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Код Поръчка</th>
                        <th>Дата</th>
                        <th>Обща сума</th>
                        <th>Статус</th>
                        <th>Действие</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    state.orders.forEach(order => {
        const date = new Date(order.orderDate).toLocaleString('bg-BG');
        html += `
            <tr>
                <td><strong>#${order.id}</strong></td>
                <td>${date}</td>
                <td style="font-weight:600; color:var(--secondary);">${order.totalAmount.toFixed(2)} лв.</td>
                <td><span style="background:rgba(0, 255, 136, 0.15); color:var(--success); font-weight:600; font-size:0.8rem; padding: 0.2rem 0.5rem; border-radius:10px;">Платена</span></td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="showInvoice(${order.id})">
                        <i class="fas fa-file-invoice-dollar"></i> Виж Сметка/Фактура
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    view.innerHTML = html;
}

// Show invoice helper from order ID
async function showInvoice(orderId) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return;
    
    let clientName = state.client ? `${state.client.firstName} ${state.client.lastName}` : "Клиент";
    let clientNum = state.client ? state.client.clientNumber : "N/A";
    
    // In case Admin/Mod accesses, look up from DB or order info
    if (state.user.role !== 'client') {
        try {
            const clientsRes = await fetch('/api/clients');
            if (clientsRes.ok) {
                const clientsList = await clientsRes.json();
                const matched = clientsList.find(c => c.id === order.clientId);
                if (matched) {
                    clientName = `${matched.firstName} ${matched.lastName}`;
                    clientNum = matched.clientNumber;
                }
            }
        } catch(e) {}
    }
    
    // Bank account lookup
    let bankStr = `сметка ID: ${order.bankAccountId}`;
    if (state.client) {
        const bank = state.client.bankAccounts.find(b => b.id === order.bankAccountId);
        if (bank) bankStr = `${bank.bankName} - ${bank.accountNumber}`;
    } else {
        // Admin / Moderator checkout check
        try {
            const clientsRes = await fetch('/api/clients');
            if (clientsRes.ok) {
                const clientsList = await clientsRes.json();
                const matched = clientsList.find(c => c.id === order.clientId);
                const bank = matched?.bankAccounts.find(b => b.id === order.bankAccountId);
                if (bank) bankStr = `${bank.bankName} - ${bank.accountNumber}`;
            }
        } catch(e) {}
    }
    
    const invoiceData = {
        id: order.id,
        orderDate: order.orderDate,
        clientId: order.clientId,
        clientName: clientName,
        clientNumber: clientNum,
        totalAmount: order.totalAmount,
        bankStr: bankStr,
        items: order.items
    };
    
    showInvoiceModal(invoiceData);
}

// 6. MODERATOR PANEL VIEW
async function renderModerator() {
    const view = document.getElementById('app-view');
    view.innerHTML = `<p style="text-align:center;">Зареждане на модераторски данни...</p>`;
    
    await fetchCatalogData();
    
    // Fetch stats
    let stats = null;
    try {
        const res = await fetch('/api/stats');
        if (res.ok) stats = await res.json();
    } catch(e) {}
    
    let statsHtml = '';
    if (stats && stats.categoryStats) {
        statsHtml = `
            <div class="card">
                <h3>Статистика по категории продадени стоки</h3>
                <div class="chart-container">
        `;
        
        const maxVal = Math.max(...stats.categoryStats.map(c => c.totalSold), 1);
        
        stats.categoryStats.forEach(c => {
            const percent = ((c.totalSold / maxVal) * 100).toFixed(0);
            statsHtml += `
                <div class="bar-row">
                    <div class="bar-label">
                        <span><strong>${c.category}</strong> (${c.totalSold} бр.)</span>
                        <span style="color:var(--secondary);">${c.totalRevenue.toFixed(2)} лв.</span>
                    </div>
                    <div class="bar-track">
                        <div class="bar-fill" style="width: ${percent}%;"></div>
                    </div>
                </div>
            `;
        });
        
        statsHtml += `
                </div>
            </div>
        `;
    }
    
    let html = `
        <h2 style="margin-bottom: 1.5rem;"><i class="fas fa-tasks" style="color:var(--primary)"></i> Модераторски Панел</h2>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
            <!-- Register client by mod -->
            <div class="card">
                <h3>Бърза регистрация на клиент</h3>
                <form id="mod-reg-client-form">
                    <div class="form-group">
                        <label>Потребителско име за клиента</label>
                        <input type="text" id="mrc-username" class="form-control" placeholder="username" required>
                    </div>
                    <div class="form-group">
                        <label>Парола</label>
                        <input type="password" id="mrc-password" class="form-control" placeholder="password" required>
                    </div>
                    <div class="form-group">
                        <label>Собствено име</label>
                        <input type="text" id="mrc-first" class="form-control" placeholder="Иван" required>
                    </div>
                    <div class="form-group">
                        <label>Фамилно име</label>
                        <input type="text" id="mrc-last" class="form-control" placeholder="Иванов" required>
                    </div>
                    <div class="form-group">
                        <label>Основна банка</label>
                        <input type="text" id="mrc-bank" class="form-control" placeholder="ОББ" required>
                    </div>
                    <div class="form-group">
                        <label>Основен IBAN</label>
                        <input type="text" id="mrc-iban" class="form-control" placeholder="BG..." required>
                    </div>
                    
                    <button type="submit" class="btn btn-primary" style="width:100%;">Регистрирай Клиент</button>
                </form>
            </div>
            
            ${statsHtml}
        </div>
        
        <!-- Items CRUD section -->
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
                <h3>Управление на Стоки / Артикули</h3>
                <button class="btn btn-primary btn-sm" onclick="showItemModal()"><i class="fas fa-plus"></i> Нова Стока</button>
            </div>
            
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Име</th>
                        <th>Категория</th>
                        <th>Цена</th>
                        <th>Клас</th>
                        <th>Доставчици</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.items.map(item => {
                        const sups = state.suppliers
                            .filter(s => item.supplierIds.includes(s.id))
                            .map(s => s.name)
                            .join(', ') || 'няма';
                        return `
                            <tr>
                                <td><strong>${item.name}</strong><br><small style="color:var(--text-muted);">${item.description.substring(0,40)}...</small></td>
                                <td>${item.category}</td>
                                <td><strong>${item.price.toFixed(2)} лв.</strong></td>
                                <td><span class="price-class ${item.itemClass}">${item.itemClass}</span></td>
                                <td>${sups}</td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn btn-secondary btn-sm" onclick="showItemModal(${item.id})"><i class="fas fa-edit"></i> Редакция</button>
                                        <button class="btn btn-danger btn-sm" onclick="deleteItem(${item.id})"><i class="fas fa-trash"></i> Изтрий</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        
        <!-- Suppliers section -->
        <div class="card" style="margin-top: 2rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
                <h3>Управление на Доставчици</h3>
                <button class="btn btn-primary btn-sm" onclick="showSupplierModal()"><i class="fas fa-plus"></i> Нов Доставчик</button>
            </div>
            
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Име на фирма</th>
                        <th>Адрес</th>
                        <th>Телефон</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.suppliers.map(sup => `
                        <tr>
                            <td><strong>${sup.name}</strong></td>
                            <td>${sup.address}</td>
                            <td><code>${sup.phone}</code></td>
                            <td>
                                <div class="action-buttons">
                                    <button class="btn btn-secondary btn-sm" onclick="showSupplierModal(${sup.id})"><i class="fas fa-edit"></i> Редакция</button>
                                    <button class="btn btn-danger btn-sm" onclick="deleteSupplier(${sup.id})"><i class="fas fa-trash"></i> Изтрий</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <!-- Promotions section -->
        <div class="card" style="margin-top: 2rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
                <h3>Управление на Промоции и Отстъпки</h3>
                <button class="btn btn-primary btn-sm" onclick="showPromotionModal()"><i class="fas fa-plus"></i> Нова Промоция</button>
            </div>
            
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Име на кампания</th>
                        <th>Отстъпка</th>
                        <th>Период</th>
                        <th>Продукти</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.promotions.map(promo => {
                        const items = state.items
                            .filter(i => promo.itemIds.includes(i.id))
                            .map(i => i.name)
                            .join(', ') || 'всички';
                        const start = new Date(promo.startDate).toLocaleDateString('bg-BG');
                        const end = new Date(promo.endDate).toLocaleDateString('bg-BG');
                        return `
                            <tr>
                                <td><strong>${promo.name}</strong></td>
                                <td style="color:var(--premium-color); font-weight:700;">-${promo.discountPercent}%</td>
                                <td>${start} - ${end}</td>
                                <td><small>${items}</small></td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn btn-secondary btn-sm" onclick="showPromotionModal(${promo.id})"><i class="fas fa-edit"></i> Редакция</button>
                                        <button class="btn btn-danger btn-sm" onclick="deletePromotion(${promo.id})"><i class="fas fa-trash"></i> Изтрий</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    view.innerHTML = html;
    
    // Bind register client form
    document.getElementById('mod-reg-client-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('mrc-username').value;
        const passwordHash = document.getElementById('mrc-password').value;
        const firstName = document.getElementById('mrc-first').value;
        const lastName = document.getElementById('mrc-last').value;
        const bankName = document.getElementById('mrc-bank').value;
        const accountNumber = document.getElementById('mrc-iban').value;
        
        try {
            const res = await fetch('/api/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    passwordHash,
                    firstName,
                    lastName,
                    bankAccounts: [{ bankName, accountNumber }]
                })
            });
            
            const data = await res.json();
            if (res.ok) {
                showToast("Клиентът е регистриран успешно!", "success");
                document.getElementById('mod-reg-client-form').reset();
            } else {
                showToast(data.error || "Грешка при регистрация на клиент", "danger");
            }
        } catch (err) {
            showToast("Сървърна грешка при базата данни", "danger");
        }
    });
}

// 7. ADMIN PANEL VIEW
async function renderAdmin() {
    const view = document.getElementById('app-view');
    view.innerHTML = `<p style="text-align:center;">Зареждане на администраторски данни...</p>`;
    
    // Fetch stats
    let stats = null;
    try {
        const res = await fetch('/api/stats');
        if (res.ok) stats = await res.json();
    } catch(e) {}
    
    // Fetch users list
    let usersList = [];
    try {
        const res = await fetch('/api/users');
        if (res.ok) usersList = await res.json();
    } catch(e) {}
    
    let statsGridHtml = '';
    if (stats) {
        statsGridHtml = `
            <div class="stats-grid">
                <div class="stat-widget">
                    <div class="stat-label">Общ оборот</div>
                    <div class="stat-val" style="color:var(--success);">${stats.totalRevenue.toFixed(2)} лв.</div>
                </div>
                <div class="stat-widget">
                    <div class="stat-label">Продадени поръчки</div>
                    <div class="stat-val">${stats.totalOrders} бр.</div>
                </div>
                <div class="stat-widget">
                    <div class="stat-label">Регистрирани клиенти</div>
                    <div class="stat-val">${stats.totalClients} потребители</div>
                </div>
            </div>
        `;
    }
    
    let html = `
        <h2 style="margin-bottom: 1.5rem;"><i class="fas fa-user-shield" style="color:var(--primary)"></i> Администраторски Панел</h2>
        
        ${statsGridHtml}
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem; align-items:start;">
            <!-- Store info settings -->
            <div class="card">
                <h3>Настройки на Магазина</h3>
                <form id="admin-store-form">
                    <div class="form-group">
                        <label>Име на Магазина</label>
                        <input type="text" id="store-name" class="form-control" value="${state.store?.name || ''}" required>
                    </div>
                    <div class="form-group">
                        <label>Адрес</label>
                        <textarea id="store-address" class="form-control" required rows="3">${state.store?.address || ''}</textarea>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width:100%;">Запази промените</button>
                </form>
            </div>
            
            <!-- Create user -->
            <div class="card">
                <h3>Добавяне на нов потребител (Admin/Moderator)</h3>
                <form id="admin-create-user-form">
                    <div class="form-group">
                        <label>Потребителско име</label>
                        <input type="text" id="acu-username" class="form-control" placeholder="username" required>
                    </div>
                    <div class="form-group">
                        <label>Парола</label>
                        <input type="password" id="acu-password" class="form-control" placeholder="password" required>
                    </div>
                    <div class="form-group">
                        <label>Роля в системата</label>
                        <select id="acu-role" class="form-control" required>
                            <option value="moderator">Модератор</option>
                            <option value="admin">Администратор</option>
                            <option value="client">Клиент (без клиентски профил)</option>
                        </select>
                    </div>
                    <button type="submit" class="btn btn-primary" style="width:100%;">Създай потребител</button>
                </form>
            </div>
        </div>
        
        <!-- Users list -->
        <div class="card">
            <h3>Управление на Потребители и Роли</h3>
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Потребителско име</th>
                        <th>Роля</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${usersList.map(user => `
                        <tr>
                            <td>#${user.id}</td>
                            <td><strong>${user.username}</strong></td>
                            <td>
                                <span style="background:rgba(255,255,255,0.05); border:1px solid var(--card-border); padding: 0.2rem 0.6rem; border-radius:12px; font-size:0.8rem; font-weight:600;">
                                    ${user.role}
                                </span>
                            </td>
                            <td>
                                <div class="action-buttons">
                                    <button class="btn btn-secondary btn-sm" onclick="editUserRole(${user.id}, '${user.role}')"><i class="fas fa-user-edit"></i> Промени Роля</button>
                                    <button class="btn btn-danger btn-sm" onclick="deleteUser(${user.id})"><i class="fas fa-trash"></i> Изтрий</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    view.innerHTML = html;
    
    // Bind store info update form
    document.getElementById('admin-store-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('store-name').value;
        const address = document.getElementById('store-address').value;
        
        try {
            const res = await fetch('/api/store', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, address })
            });
            if (res.ok) {
                showToast("Магазинът е обновен успешно", "success");
                await fetchStoreInfo();
            } else {
                showToast("Грешка при обновяване", "danger");
            }
        } catch(err) {
            showToast("Базата данни не реагира", "danger");
        }
    });
    
    // Bind create user form
    document.getElementById('admin-create-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('acu-username').value;
        const passwordHash = document.getElementById('acu-password').value;
        const role = document.getElementById('acu-role').value;
        
        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, passwordHash, role })
            });
            const data = await res.json();
            if (res.ok) {
                showToast("Потребителят е създаден!", "success");
                renderAdmin();
            } else {
                showToast(data.error || "Грешка при създаване на потребител", "danger");
            }
        } catch(err) {
            showToast("Сървърна грешка при базата данни", "danger");
        }
    });
}

async function editUserRole(id, currentRole) {
    const newRole = prompt("Въведете нова роля (admin, moderator, client):", currentRole);
    if (!newRole || !['admin', 'moderator', 'client'].includes(newRole)) {
        if (newRole) alert("Невалидна роля! Изберете между: admin, moderator, client");
        return;
    }
    
    try {
        const res = await fetch(`/api/users/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: '', passwordHash: '', role: newRole })
        });
        if (res.ok) {
            showToast("Ролята на потребителя е променена", "success");
            renderAdmin();
        } else {
            const data = await res.json();
            showToast(data.error || "Грешка при промяна", "danger");
        }
    } catch(e) {
        showToast("Грешка при комуникация", "danger");
    }
}

async function deleteUser(id) {
    if (!confirm("Внимание! Изтриването на потребителя е необратимо. Продължаване?")) return;
    try {
        const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast("Потребителят е изтрит", "success");
            renderAdmin();
        } else {
            const data = await res.json();
            showToast(data.error || "Грешка при изтриване на потребител", "danger");
        }
    } catch(e) {
        showToast("Грешка при изтриване", "danger");
    }
}

// --- Cart Actions ---
function addToCart(itemId) {
    const cartItem = state.cart.find(c => c.itemId === itemId);
    if (cartItem) {
        cartItem.quantity += 1;
    } else {
        state.cart.push({ itemId: itemId, quantity: 1 });
    }
    
    localStorage.setItem(`cart_${state.user.username}`, JSON.stringify(state.cart));
    updateNavActiveState();
    showToast("Артикулът е добавен в количката", "success");
}

function changeQuantity(itemId, delta) {
    const idx = state.cart.findIndex(c => c.itemId === itemId);
    if (idx === -1) return;
    
    state.cart[idx].quantity += delta;
    if (state.cart[idx].quantity <= 0) {
        state.cart.splice(idx, 1);
    }
    
    localStorage.setItem(`cart_${state.user.username}`, JSON.stringify(state.cart));
    updateNavActiveState();
    renderCart();
}

// --- Modals for CRUD operations ---

// A. ITEM MODAL (Create/Edit)
function showItemModal(itemId = null) {
    const item = itemId ? state.items.find(i => i.id === itemId) : null;
    
    const div = document.createElement('div');
    div.className = 'modal-overlay active';
    div.id = 'crud-item-overlay';
    
    const supsCheckboxes = state.suppliers.map(sup => {
        const checked = item && item.supplierIds.includes(sup.id) ? 'checked' : '';
        return `
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom: 0.5rem;">
                <input type="checkbox" class="sup-check" value="${sup.id}" ${checked}>
                <span>${sup.name}</span>
            </div>
        `;
    }).join('');
    
    div.innerHTML = `
        <div class="invoice-modal" style="text-align:left;">
            <button class="close-modal" onclick="document.getElementById('crud-item-overlay').remove()">&times;</button>
            <h3>${item ? 'Редактиране на артикул' : 'Добавяне на нов артикул'}</h3>
            
            <form id="crud-item-form">
                <div class="form-group">
                    <label>Име на артикул</label>
                    <input type="text" id="ci-name" class="form-control" value="${item ? item.name : ''}" required>
                </div>
                <div class="form-group">
                    <label>Категория</label>
                    <input type="text" id="ci-category" class="form-control" value="${item ? item.category : ''}" placeholder="напр. Електроника, Храни" required>
                </div>
                <div class="form-group">
                    <label>Цена (лв.)</label>
                    <input type="number" step="0.01" id="ci-price" class="form-control" value="${item ? item.price : ''}" required>
                    <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.2rem;">
                        * Класът на стоката се изчислява автоматично: <=50 Budget | <=200 Standard | >200 Premium.
                    </p>
                </div>
                <div class="form-group">
                    <label>Описание</label>
                    <textarea id="ci-description" class="form-control" required rows="3">${item ? item.description : ''}</textarea>
                </div>
                
                <div class="form-group">
                    <label>Доставчици</label>
                    <div style="max-height:100px; overflow-y:auto; padding: 0.5rem; background:rgba(0,0,0,0.2); border-radius:8px;">
                        ${supsCheckboxes || '<p style="font-size:0.8rem; color:var(--text-muted);">Няма въведени доставчици</p>'}
                    </div>
                </div>
                
                <button type="submit" class="btn btn-primary" style="width:100%; margin-top: 1rem;">Запази</button>
            </form>
        </div>
    `;
    
    document.body.appendChild(div);
    
    document.getElementById('crud-item-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('ci-name').value;
        const category = document.getElementById('ci-category').value;
        const price = parseFloat(document.getElementById('ci-price').value);
        const description = document.getElementById('ci-description').value;
        
        const supChecks = document.querySelectorAll('.sup-check:checked');
        const supplierIds = Array.from(supChecks).map(c => parseInt(c.value));
        
        const payload = { name, category, price, description, supplierIds };
        
        const url = item ? `/api/items/${item.id}` : '/api/items';
        const method = item ? 'PUT' : 'POST';
        
        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showToast("Артикулът е запазен!", "success");
                div.remove();
                renderModerator();
            } else {
                showToast("Грешка при запис на артикул", "danger");
            }
        } catch(err) {
            showToast("Грешка в базата данни", "danger");
        }
    });
}

async function deleteItem(id) {
    if (!confirm("Сигурни ли сте, че искате да изтриете този артикул?")) return;
    try {
        const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast("Артикулът е изтрит", "success");
            renderModerator();
        } else {
            showToast("Грешка при изтриване", "danger");
        }
    } catch(e) {
        showToast("Грешка при комуникация", "danger");
    }
}

// B. SUPPLIER MODAL (Create/Edit)
function showSupplierModal(supId = null) {
    const sup = supId ? state.suppliers.find(s => s.id === supId) : null;
    
    const div = document.createElement('div');
    div.className = 'modal-overlay active';
    div.id = 'crud-sup-overlay';
    
    div.innerHTML = `
        <div class="invoice-modal" style="text-align:left;">
            <button class="close-modal" onclick="document.getElementById('crud-sup-overlay').remove()">&times;</button>
            <h3>${sup ? 'Редактиране на доставчик' : 'Добавяне на доставчик'}</h3>
            
            <form id="crud-sup-form">
                <div class="form-group">
                    <label>Име на доставчик / фирма</label>
                    <input type="text" id="cs-name" class="form-control" value="${sup ? sup.name : ''}" required>
                </div>
                <div class="form-group">
                    <label>Адрес</label>
                    <input type="text" id="cs-address" class="form-control" value="${sup ? sup.address : ''}" required>
                </div>
                <div class="form-group">
                    <label>Телефон за връзка</label>
                    <input type="text" id="cs-phone" class="form-control" value="${sup ? sup.phone : ''}" required>
                </div>
                
                <button type="submit" class="btn btn-primary" style="width:100%; margin-top: 1rem;">Запази</button>
            </form>
        </div>
    `;
    
    document.body.appendChild(div);
    
    document.getElementById('crud-sup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('cs-name').value;
        const address = document.getElementById('cs-address').value;
        const phone = document.getElementById('cs-phone').value;
        
        const payload = { name, address, phone };
        
        const url = sup ? `/api/suppliers/${sup.id}` : '/api/suppliers';
        const method = sup ? 'PUT' : 'POST';
        
        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showToast("Доставчикът е запазен!", "success");
                div.remove();
                renderModerator();
            } else {
                showToast("Грешка при запис", "danger");
            }
        } catch(err) {
            showToast("Грешка", "danger");
        }
    });
}

async function deleteSupplier(id) {
    if (!confirm("Наистина ли изтривате този доставчик? Всички негови асоциации със стоки ще бъдат изтрити.")) return;
    try {
        const res = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast("Доставчикът е изтрит", "success");
            renderModerator();
        } else {
            showToast("Възникна грешка", "danger");
        }
    } catch(e) {
        showToast("Грешка", "danger");
    }
}

// C. PROMOTION MODAL (Create/Edit)
function showPromotionModal(promoId = null) {
    const promo = promoId ? state.promotions.find(p => p.id === promoId) : null;
    
    const div = document.createElement('div');
    div.className = 'modal-overlay active';
    div.id = 'crud-promo-overlay';
    
    const itemsCheckboxes = state.items.map(item => {
        const checked = promo && promo.itemIds.includes(item.id) ? 'checked' : '';
        return `
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom: 0.5rem;">
                <input type="checkbox" class="promo-item-check" value="${item.id}" ${checked}>
                <span>${item.name} (${item.price.toFixed(2)} лв.)</span>
            </div>
        `;
    }).join('');
    
    div.innerHTML = `
        <div class="invoice-modal" style="text-align:left;">
            <button class="close-modal" onclick="document.getElementById('crud-promo-overlay').remove()">&times;</button>
            <h3>${promo ? 'Редактиране на промоция' : 'Нова промо кампания'}</h3>
            
            <form id="crud-promo-form">
                <div class="form-group">
                    <label>Име на кампанията</label>
                    <input type="text" id="cp-name" class="form-control" value="${promo ? promo.name : ''}" placeholder="Лятно Намаление" required>
                </div>
                <div class="form-group">
                    <label>Процент отстъпка (%)</label>
                    <input type="number" id="cp-discount" class="form-control" value="${promo ? promo.discountPercent : ''}" min="1" max="99" required>
                </div>
                <div class="form-group">
                    <label>Начална дата и час</label>
                    <input type="datetime-local" id="cp-start" class="form-control" value="${promo ? promo.startDate : ''}" required>
                </div>
                <div class="form-group">
                    <label>Крайна дата и час</label>
                    <input type="datetime-local" id="cp-end" class="form-control" value="${promo ? promo.endDate : ''}" required>
                </div>
                
                <div class="form-group">
                    <label>Приложи за артикули</label>
                    <div style="max-height:150px; overflow-y:auto; padding: 0.5rem; background:rgba(0,0,0,0.2); border-radius:8px;">
                        ${itemsCheckboxes || '<p style="font-size:0.8rem; color:var(--text-muted);">Няма въведени артикули</p>'}
                    </div>
                </div>
                
                <button type="submit" class="btn btn-primary" style="width:100%; margin-top: 1rem;">Запази промоция</button>
            </form>
        </div>
    `;
    
    document.body.appendChild(div);
    
    // Autofill dates helper
    if (!promo) {
        const start = new Date();
        const end = new Date();
        end.setDate(end.getDate() + 7); // 7 days promo default
        
        document.getElementById('cp-start').value = start.toISOString().substring(0, 16);
        document.getElementById('cp-end').value = end.toISOString().substring(0, 16);
    }
    
    document.getElementById('crud-promo-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('cp-name').value;
        const discountPercent = parseFloat(document.getElementById('cp-discount').value);
        const startDate = document.getElementById('cp-start').value;
        const endDate = document.getElementById('cp-end').value;
        
        const itemChecks = document.querySelectorAll('.promo-item-check:checked');
        const itemIds = Array.from(itemChecks).map(c => parseInt(c.value));
        
        if (itemIds.length === 0) {
            showToast("Моля, изберете поне един артикул за промоцията!", "danger");
            return;
        }
        
        const payload = { name, discountPercent, startDate, endDate, itemIds };
        
        const url = promo ? `/api/promotions/${promo.id}` : '/api/promotions';
        const method = promo ? 'PUT' : 'POST';
        
        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showToast("Промоцията е запазена успешно!", "success");
                div.remove();
                renderModerator();
            } else {
                const data = await res.json();
                showToast(data.error || "Грешка при запис", "danger");
            }
        } catch(err) {
            showToast("Проблем при изпращане", "danger");
        }
    });
}

async function deletePromotion(id) {
    if (!confirm("Наистина ли триете тази промо кампания? Отстъпките ще спрат веднага.")) return;
    try {
        const res = await fetch(`/api/promotions/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast("Промоцията е изтрита", "success");
            renderModerator();
        } else {
            showToast("Грешка при изтриване", "danger");
        }
    } catch(e) {
        showToast("Грешка", "danger");
    }
}

// --- Invoice Receipt Modal Functions ---

function showInvoiceModal(invoice) {
    document.getElementById('inv-store-name').innerText = state.store?.name || 'Мини Маркет';
    document.getElementById('inv-store-address').innerText = state.store?.address || '';
    document.getElementById('inv-order-id').innerText = invoice.id;
    document.getElementById('inv-order-date').innerText = new Date(invoice.orderDate).toLocaleString('bg-BG');
    document.getElementById('inv-client-number').innerText = invoice.clientNumber;
    document.getElementById('inv-client-name').innerText = invoice.clientName;
    document.getElementById('inv-total-amount').innerText = invoice.totalAmount.toFixed(2) + " лв.";
    document.getElementById('inv-bank-account').innerText = invoice.bankStr;
    
    const body = document.getElementById('invoice-items-body');
    body.innerHTML = '';
    
    invoice.items.forEach(item => {
        body.innerHTML += `
            <tr>
                <td><strong>${item.name || `Артикул ID ${item.itemId}`}</strong></td>
                <td style="text-align: center;">${item.quantity} бр.</td>
                <td style="text-align: right;">${item.unitPrice.toFixed(2)} лв.</td>
                <td style="text-align: right; color: var(--danger);">${item.discountAmount > 0 ? `-${item.discountAmount.toFixed(2)} лв.` : '0.00 лв.'}</td>
                <td style="text-align: right; font-weight: 600;">${item.finalPrice.toFixed(2)} лв.</td>
            </tr>
        `;
    });
    
    document.getElementById('invoice-modal-overlay').classList.add('active');
}

function closeInvoiceModal() {
    document.getElementById('invoice-modal-overlay').classList.remove('active');
}

// --- Toast Notifications helper ---
function showToast(message, type = 'success') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.position = 'fixed';
        toastContainer.style.bottom = '20px';
        toastContainer.style.right = '20px';
        toastContainer.style.zIndex = '9999';
        toastContainer.style.display = 'flex';
        toastContainer.style.flexDirection = 'column';
        toastContainer.style.gap = '10px';
        document.body.appendChild(toastContainer);
    }
    
    const toast = document.createElement('div');
    toast.className = `alert alert-${type}`;
    toast.style.margin = '0';
    toast.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
    toast.style.minWidth = '250px';
    toast.style.animation = 'slideIn 0.3s cubic-bezier(0.1, 0.8, 0.3, 1)';
    toast.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <span>${message}</span>
            <button style="background:transparent; border:none; color:inherit; font-size:1.1rem; cursor:pointer; margin-left:1rem;" onclick="this.parentElement.parentElement.remove()">&times;</button>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

// Inject CSS slideIn keyframe for toast
const styleSheet = document.createElement("style");
styleSheet.innerText = `
@keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}
`;
document.head.appendChild(styleSheet);
