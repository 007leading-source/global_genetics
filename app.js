/**
 * Global Genetics MX - Premium POS System
 * Main Application Logic with Supabase Integration
 * FIXED VERSION - Event listeners properly attached
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = 'https://evpqdpcelmsrptqkvmhj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dxwKtN8SWAELwdtyHaDGWw___xkaGui';
const EDGE_FUNCTION_URL = 'https://vftraocvijumydsqzypj.supabase.co/functions/v1/send-invoice-email';

// Initialize Supabase
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global State
let products = [];
let filteredProducts = [];
let customers = [];
let cartItems = [];
let currentScreen = 'home';
let lastSaleData = null;
let chart = null;
let chartMode = 'value'; // 'value' or 'quantity'
let currentChartPage = 0;
const PRODUCTS_PER_PAGE = 5;
let notifications = [];

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Initializing app...');
    initApp();
    attachEventListeners();
});

async function initApp() {
    showLoading(true);
    try {
        console.log('Loading products and customers...');
        await Promise.all([loadProducts(), loadCustomers()]);
        console.log('Products loaded:', products.length);
        console.log('Customers loaded:', customers.length);
        renderDashboard();
        showToast('✅ Sistema iniciado correctamente', 'success');
    } catch (error) {
        console.error('Init error:', error);
        showToast('❌ Error al iniciar: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// EVENT LISTENERS ATTACHMENT
// ============================================================================

function attachEventListeners() {
    console.log('Attaching event listeners...');
    
    // Navigation buttons
    const navHome = document.getElementById('nav-home');
    const navSale = document.getElementById('nav-sale');
    const navInventory = document.getElementById('nav-inventory');
    const navCustomers = document.getElementById('nav-customers');
    
    if (navHome) navHome.addEventListener('click', () => goTo('home'));
    if (navSale) navSale.addEventListener('click', () => goTo('sale'));
    if (navInventory) navInventory.addEventListener('click', () => goTo('inventory'));
    if (navCustomers) navCustomers.addEventListener('click', () => goTo('customers'));
    
    console.log('Navigation listeners attached');
    
    // Sale module listeners
    const productSearchInput = document.getElementById('productSearchInput');
    if (productSearchInput) {
        productSearchInput.addEventListener('input', (e) => {
            searchProducts(e.target.value);
        });
    }
    
    const finalizeSaleBtn = document.getElementById('finalizeSaleBtn');
    if (finalizeSaleBtn) {
        finalizeSaleBtn.addEventListener('click', finalizeSale);
    }
    
    // Chart mode toggle
    const chartModeBtn = document.getElementById('chartModeBtn');
    if (chartModeBtn) {
        chartModeBtn.addEventListener('click', toggleChartMode);
    }
    
    console.log('All event listeners attached successfully');
}

// ============================================================================
// NAVIGATION
// ============================================================================

function goTo(screenId) {
    console.log('Navigating to:', screenId);
    
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.add('active');
        currentScreen = screenId;
        console.log('Screen changed to:', screenId);
    } else {
        console.error('Screen not found:', screenId);
    }

    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.id === `nav-${screenId}`);
    });

    if (screenId === 'home') {
        renderDashboard();
    } else if (screenId === 'inventory') {
        filterProducts('');
    } else if (screenId === 'sale') {
        const input = document.getElementById('productSearchInput');
        if (input) input.value = '';
        const results = document.getElementById('searchResults');
        if (results) results.classList.add('hidden');
    }
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadProducts() {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        products = data || [];
        filteredProducts = [...products];
        return products;
    } catch (error) {
        console.error('Load products error:', error);
        showToast('❌ Error al cargar productos', 'error');
        return [];
    }
}

async function loadCustomers() {
    try {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        customers = data || [];
        return customers;
    } catch (error) {
        console.error('Load customers error:', error);
        showToast('❌ Error al cargar clientes', 'error');
        return [];
    }
}

// ============================================================================
// DASHBOARD (INICIO)
// ============================================================================

function renderDashboard() {
    console.log('Rendering dashboard...');
    
    // Calculate metrics
    const totalInventoryValue = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.cost_price || 0)), 0);
    const lowStockCount = products.filter(p => p.stock > 0 && p.stock <= (p.min_stock || 5)).length;
    const outOfStockCount = products.filter(p => !p.stock || p.stock === 0).length;

    // Update metrics
    const valueEl = document.querySelector('[data-metric="inventory-value"]');
    const lowStockEl = document.querySelector('[data-metric="low-stock"]');
    const outOfStockEl = document.querySelector('[data-metric="out-of-stock"]');

    if (valueEl) valueEl.textContent = `$${totalInventoryValue.toFixed(2)}`;
    if (lowStockEl) lowStockEl.textContent = lowStockCount;
    if (outOfStockEl) outOfStockEl.textContent = outOfStockCount;

    // Render chart
    renderChart();
    
    // Render alerts
    renderAlerts();
}

function renderChart() {
    const ctx = document.getElementById('chart');
    if (!ctx) return;

    // Prepare chart data
    let chartData = [];
    
    if (chartMode === 'value') {
        // Investment mode - sort by cost_price * stock
        chartData = products
            .map(p => ({
                name: p.name,
                value: (p.stock || 0) * (p.cost_price || 0),
                stock: p.stock || 0,
                product: p
            }))
            .sort((a, b) => {
                // Prioritize out of stock and low stock
                const aIsOut = a.stock === 0 ? 1 : 0;
                const bIsOut = b.stock === 0 ? 1 : 0;
                if (aIsOut !== bIsOut) return bIsOut - aIsOut;
                
                const aIsLow = a.stock > 0 && a.stock <= 5 ? 1 : 0;
                const bIsLow = b.stock > 0 && b.stock <= 5 ? 1 : 0;
                if (aIsLow !== bIsLow) return bIsLow - aIsLow;
                
                return b.value - a.value;
            })
            .slice(0, PRODUCTS_PER_PAGE);
    } else {
        // Stock mode - sort by quantity
        chartData = products
            .map(p => ({
                name: p.name,
                value: p.stock || 0,
                stock: p.stock || 0,
                product: p
            }))
            .sort((a, b) => {
                // Prioritize out of stock and low stock
                const aIsOut = a.stock === 0 ? 1 : 0;
                const bIsOut = b.stock === 0 ? 1 : 0;
                if (aIsOut !== bIsOut) return bIsOut - aIsOut;
                
                const aIsLow = a.stock > 0 && a.stock <= 5 ? 1 : 0;
                const bIsLow = b.stock > 0 && b.stock <= 5 ? 1 : 0;
                if (aIsLow !== bIsLow) return bIsLow - aIsLow;
                
                return b.value - a.value;
            })
            .slice(0, PRODUCTS_PER_PAGE);
    }

    const labels = chartData.map(d => d.name);
    const values = chartData.map(d => d.value);
    const colors = chartData.map(d => {
        if (d.stock === 0) return '#ef4444'; // Red - out of stock
        if (d.stock <= 5) return '#f59e0b'; // Orange - low stock
        return '#22c55e'; // Green - ok
    });

    if (chart) {
        chart.destroy();
    }

    chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: chartMode === 'value' ? 'Inversión por Producto' : 'Stock por Producto',
                data: values,
                backgroundColor: colors,
                borderColor: colors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y',
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { beginAtZero: true }
            }
        }
    });
}

function toggleChartMode() {
    chartMode = chartMode === 'value' ? 'quantity' : 'value';
    const btn = document.getElementById('chartModeBtn');
    if (btn) {
        btn.textContent = chartMode === 'value' ? 'Stock por Producto' : 'Inversión por Producto';
    }
    renderChart();
}

function renderAlerts() {
    const alertsContainer = document.getElementById('alertsContainer');
    if (!alertsContainer) return;

    const alerts = [];
    
    // Out of stock alerts
    products.filter(p => !p.stock || p.stock === 0).forEach(p => {
        alerts.push({
            type: 'error',
            message: `❌ ${p.name} - SIN STOCK`,
            product: p
        });
    });

    // Low stock alerts
    products.filter(p => p.stock > 0 && p.stock <= (p.min_stock || 5)).forEach(p => {
        alerts.push({
            type: 'warning',
            message: `⚠️ ${p.name} - BAJO STOCK (${p.stock} unidades)`,
            product: p
        });
    });

    if (alerts.length === 0) {
        alertsContainer.innerHTML = '<div class="alert-item success"><i class="fas fa-check-circle"></i> Todo en orden</div>';
        return;
    }

    alertsContainer.innerHTML = alerts.map(a => 
        `<div class="alert-item ${a.type}">
            <i class="fas fa-${a.type === 'error' ? 'times-circle' : 'exclamation-triangle'}"></i>
            ${a.message}
        </div>`
    ).join('');
}

// ============================================================================
// SALES MODULE (VENTA)
// ============================================================================

function searchProducts(query) {
    const results = document.getElementById('searchResults');
    if (!results) return;

    if (!query.trim()) {
        results.classList.add('hidden');
        return;
    }

    const matches = products.filter(p => 
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        (p.brand && p.brand.toLowerCase().includes(query.toLowerCase()))
    );

    results.innerHTML = matches.map(p => `
        <div class="search-result-item" onclick="addToCart('${p.product_id}', '${p.name}', ${p.sale_price})">
            <div class="result-name">${p.name}</div>
            <div class="result-price">$${p.sale_price}</div>
            <div class="result-stock">Stock: ${p.stock || 0}</div>
        </div>
    `).join('');

    results.classList.remove('hidden');
}

function addToCart(productId, productName, price) {
    const existingItem = cartItems.find(item => item.productId === productId);
    
    if (existingItem) {
        existingItem.quantity++;
    } else {
        cartItems.push({
            productId,
            productName,
            price,
            quantity: 1
        });
    }

    renderCart();
    document.getElementById('productSearchInput').value = '';
    document.getElementById('searchResults').classList.add('hidden');
}

function renderCart() {
    const cartContainer = document.getElementById('cartItems');
    if (!cartContainer) return;

    if (cartItems.length === 0) {
        cartContainer.innerHTML = '<div class="empty-cart">Carrito vacío</div>';
        return;
    }

    cartContainer.innerHTML = cartItems.map((item, idx) => `
        <div class="cart-item">
            <div class="item-details">
                <div class="item-name">${item.productName}</div>
                <div class="item-price">$${item.price}</div>
            </div>
            <div class="item-quantity">
                <button onclick="updateQuantity(${idx}, -1)">-</button>
                <span>${item.quantity}</span>
                <button onclick="updateQuantity(${idx}, 1)">+</button>
            </div>
            <div class="item-total">$${(item.price * item.quantity).toFixed(2)}</div>
            <button onclick="removeFromCart(${idx})" class="btn-remove">×</button>
        </div>
    `).join('');

    updateTotals();
}

function updateQuantity(idx, change) {
    cartItems[idx].quantity += change;
    if (cartItems[idx].quantity <= 0) {
        removeFromCart(idx);
    } else {
        renderCart();
    }
}

function removeFromCart(idx) {
    cartItems.splice(idx, 1);
    renderCart();
}

function updateTotals() {
    const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discountEl = document.getElementById('discountInput');
    const discount = discountEl ? parseFloat(discountEl.value) || 0 : 0;
    const iva = (subtotal - discount) * 0.16;
    const total = subtotal - discount + iva;

    const subtotalEl = document.getElementById('subtotalAmount');
    const ivaEl = document.getElementById('ivaAmount');
    const totalEl = document.getElementById('totalAmount');

    if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
    if (ivaEl) ivaEl.textContent = `$${iva.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;
}

async function finalizeSale() {
    console.log('Finalizing sale...');
    
    if (cartItems.length === 0) {
        showToast('❌ El carrito está vacío', 'error');
        return;
    }

    showLoading(true);

    try {
        const customerSelect = document.getElementById('customerSelect');
        const customerId = customerSelect ? customerSelect.value : 'GENERAL';
        const paymentMethod = document.getElementById('paymentMethodSelect')?.value || 'Efectivo';
        const discountEl = document.getElementById('discountInput');
        const discount = discountEl ? parseFloat(discountEl.value) || 0 : 0;

        const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const iva = (subtotal - discount) * 0.16;
        const total = subtotal - discount + iva;

        // Create sale
        const saleId = `SALE-${Date.now()}`;
        const { data: saleData, error: saleError } = await supabase
            .from('sales')
            .insert([{
                sale_id: saleId,
                customer_id: customerId,
                subtotal: subtotal,
                discount: discount,
                iva: iva,
                total: total,
                payment_method: paymentMethod,
                status: 'completed'
            }])
            .select();

        if (saleError) throw saleError;

        // Add sale items
        const saleItems = cartItems.map(item => ({
            sale_id: saleId,
            product_id: item.productId,
            quantity: item.quantity,
            unit_price: item.price,
            total: item.price * item.quantity
        }));

        const { error: itemsError } = await supabase
            .from('sale_items')
            .insert(saleItems);

        if (itemsError) throw itemsError;

        // Update product stock
        for (const item of cartItems) {
            const product = products.find(p => p.product_id === item.productId);
            if (product) {
                const newStock = (product.stock || 0) - item.quantity;
                await supabase
                    .from('products')
                    .update({ stock: newStock })
                    .eq('product_id', item.productId);
            }
        }

        // Show success
        lastSaleData = {
            saleId,
            customerId,
            paymentMethod,
            subtotal,
            discount,
            iva,
            total,
            items: cartItems
        };

        showSaleConfirmation();
        cartItems = [];
        renderCart();
        showToast('✅ Venta completada', 'success');

    } catch (error) {
        console.error('Sale error:', error);
        showToast('❌ Error al completar la venta: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function showSaleConfirmation() {
    const modal = document.getElementById('saleConfirmationModal');
    if (modal) {
        const invoiceEl = document.getElementById('invoiceNumber');
        if (invoiceEl && lastSaleData) {
            invoiceEl.textContent = lastSaleData.saleId;
        }
        modal.classList.remove('hidden');
    }
}

function closeSaleConfirmation() {
    const modal = document.getElementById('saleConfirmationModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ============================================================================
// INVENTORY MODULE (STOCK)
// ============================================================================

function filterProducts(query) {
    filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        (p.brand && p.brand.toLowerCase().includes(query.toLowerCase())) ||
        (p.category && p.category.toLowerCase().includes(query.toLowerCase()))
    );

    renderInventoryTable();
}

function renderInventoryTable() {
    const tableBody = document.getElementById('inventoryTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = filteredProducts.map(p => `
        <tr>
            <td>${p.name}</td>
            <td>${p.stock || 0}</td>
            <td>$${p.cost_price || 0}</td>
            <td>
                <button onclick="openRestockModal('${p.product_id}', '${p.name}')" class="btn-action">
                    <i class="fas fa-plus"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function openRestockModal(productId, productName) {
    const modal = document.getElementById('restockModal');
    if (modal) {
        document.getElementById('restockProductId').value = productId;
        document.getElementById('restockProductName').textContent = productName;
        document.getElementById('restockQuantity').value = '';
        document.getElementById('restockCost').value = '';
        modal.classList.remove('hidden');
    }
}

function closeRestockModal() {
    const modal = document.getElementById('restockModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function submitRestock() {
    const productId = document.getElementById('restockProductId').value;
    const quantity = parseInt(document.getElementById('restockQuantity').value);
    const cost = parseFloat(document.getElementById('restockCost').value);

    if (!quantity || quantity <= 0) {
        showToast('❌ Ingresa una cantidad válida', 'error');
        return;
    }

    showLoading(true);

    try {
        const product = products.find(p => p.product_id === productId);
        if (!product) throw new Error('Producto no encontrado');

        const newStock = (product.stock || 0) + quantity;

        const { error } = await supabase
            .from('products')
            .update({ stock: newStock, cost_price: cost || product.cost_price })
            .eq('product_id', productId);

        if (error) throw error;

        // Update local state
        product.stock = newStock;
        if (cost) product.cost_price = cost;

        showToast('✅ Stock actualizado', 'success');
        closeRestockModal();
        filterProducts('');
        renderDashboard();

    } catch (error) {
        console.error('Restock error:', error);
        showToast('❌ Error al actualizar stock: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// CUSTOMERS MODULE (CLIENTES)
// ============================================================================

async function submitCustomerForm() {
    const name = document.getElementById('customerName')?.value;
    const email = document.getElementById('customerEmail')?.value;
    const rfc = document.getElementById('customerRfc')?.value;
    const cfdiUsage = document.getElementById('customerCfdi')?.value;

    if (!name || !email || !cfdiUsage) {
        showToast('❌ Completa los campos requeridos', 'error');
        return;
    }

    showLoading(true);

    try {
        const customerId = `CUST-${Date.now()}`;

        const { error } = await supabase
            .from('customers')
            .insert([{
                customer_id: customerId,
                name: name,
                email: email,
                rfc: rfc || null,
                cfdi_usage: cfdiUsage,
                phone: document.getElementById('customerPhone')?.value || null,
                address: document.getElementById('customerAddress')?.value || null,
                city: document.getElementById('customerCity')?.value || null,
                state: document.getElementById('customerState')?.value || null,
                postal_code: document.getElementById('customerPostal')?.value || null
            }]);

        if (error) throw error;

        // Add notification
        notifications.push({
            id: Date.now(),
            message: `Nuevo cliente: ${name}`,
            type: 'info'
        });

        showToast('✅ Cliente registrado', 'success');
        document.getElementById('customerForm').reset();
        await loadCustomers();

    } catch (error) {
        console.error('Customer error:', error);
        showToast('❌ Error al registrar cliente: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.toggle('hidden', !show);
    }
}

function showToast(message, type = 'info') {
    const toastEl = document.getElementById('toast');
    if (!toastEl) return;

    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    const el = toastEl;
    el.style.background = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#1e3a5f';
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
}

// Make functions globally accessible for onclick handlers
window.goTo = goTo;
window.showSection = goTo;
window.addToCart = addToCart;
window.updateQuantity = updateQuantity;
window.removeFromCart = removeFromCart;
window.finalizeSale = finalizeSale;
window.closeSaleConfirmation = closeSaleConfirmation;
window.filterProducts = filterProducts;
window.openRestockModal = openRestockModal;
window.closeRestockModal = closeRestockModal;
window.submitRestock = submitRestock;
window.submitCustomerForm = submitCustomerForm;
window.toggleChartMode = toggleChartMode;
window.searchProducts = searchProducts;

console.log('App.js loaded successfully');
