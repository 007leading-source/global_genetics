/**
 * Global Genetics MX - Premium POS System
 * FILE:// SAFE VERSION (FIXED INVENTORY + CUSTOMER SEARCH + AUTO-FILL RFC/CFDI)
 */

// ================= CONFIG =================
const SUPABASE_URL = 'https://evpqdpcelmsrptqkvmhj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dxwKtN8SWAELwdtyHaDGWw___xkaGui';
const EDGE_FUNCTION_URL = 'https://vftraocvijumydsqzypj.supabase.co/functions/v1/send-invoice-email';

// ✅ SAFE INIT
let supabaseClient = null;

// ================= STATE =================
let products = [];
let customers = [];
let currentCustomer = null;
let selectedProduct = null;

// ================= INIT =================
document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
});

async function initializeApp() {
    showLoading(true);

    try {
        await waitForSupabase();

        if (window.supabase) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            await Promise.all([loadProducts(), loadCustomers()]);
        } else {
            console.warn('Supabase not loaded - running offline');
        }

        renderDashboard();
        goTo('home');

    } catch (error) {
        console.error(error);
        showToast('Error al iniciar');
    }

    showLoading(false);
}

// ================= WAIT =================
function waitForSupabase(timeout = 3000) {
    return new Promise((resolve) => {
        const start = Date.now();

        const check = () => {
            if (window.supabase) return resolve(true);
            if (Date.now() - start > timeout) return resolve(false);
            setTimeout(check, 50);
        };

        check();
    });
}

// ================= NAV =================
function goTo(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const navBtn = document.getElementById(`nav-${screenId}`);
    if (navBtn) navBtn.classList.add('active');

    if (screenId === 'home') renderDashboard();
    if (screenId === 'inventory') renderInventoryTable();
}

// ================= DATA =================
async function loadProducts() {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .order('name');

    if (!error) products = data || [];
}

async function loadCustomers() {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient
        .from('customers')
        .select('*')
        .order('name');

    if (!error) customers = data || [];
}

// ================= DASHBOARD =================
function renderDashboard() {
    let total = 0, low = 0, out = 0;

    products.forEach(p => {
        total += (p.stock || 0) * (p.cost_price || 0);
        if (p.stock === 0) out++;
        else if (p.stock <= 5) low++;
    });

    setText('inventoryValue', `$${total.toFixed(2)}`);
    setText('lowStockCount', low);
    setText('outStockCount', out);
}

// ================= CUSTOMERS =================
async function addCustomer(e) {
    e.preventDefault();

    if (!supabaseClient) {
        showToast('Sin conexión a base de datos');
        return;
    }

    showLoading(true);

    try {
        const payload = {
            name: getVal('customerNameInput') || 'Sin nombre',
            email: getVal('customerEmailInput') || 'no@email.com',
            rfc: getVal('customerRFC') || null,
            cfdi_use: getVal('customerCFDI') || 'S01',
            phone: getVal('customerPhone') || null,
            address: getVal('customerAddress') || null
        };

        const { error } = await supabaseClient
            .from('customers')
            .insert([payload]);

        if (error) throw error;

        await loadCustomers();
        showToast('Cliente guardado');

    } catch (err) {
        console.error(err);
        showToast('Error al guardar');
    }

    showLoading(false);
}

// ================= CUSTOMER SEARCH =================
function searchCustomers() {
    const input = document.getElementById('customerSearch');
    if (!input) return;

    const q = input.value.toLowerCase();
    const dropdown = document.getElementById('customerDropdown');

    if (!q) {
        dropdown.style.display = 'none';
        return;
    }

    const filtered = customers.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.rfc || '').toLowerCase().includes(q)
    );

    dropdown.innerHTML = filtered.map(c => `
        <div class="dropdown-item" onclick="selectCustomer('${c.customer_id}')">
            ${c.name} ${c.rfc ? `(${c.rfc})` : ''}
        </div>
    `).join('');

    dropdown.style.display = 'block';
}

// ✅ select customer + autofill
function selectCustomer(id) {
    currentCustomer = customers.find(c => c.customer_id === id);
    if (!currentCustomer) return;

    setVal('customerSearch', currentCustomer.name);
    document.getElementById('customerDropdown').style.display = 'none';

    const box = document.getElementById('selectedCustomer');
    if (box) box.style.display = 'flex';

    setText('customerName', currentCustomer.name);

    setVal('saleRFC', currentCustomer.rfc || '');
    setVal('saleCFDI', currentCustomer.cfdi_use || '');
}

function clearCustomer() {
    currentCustomer = null;
    setVal('customerSearch', '');

    const box = document.getElementById('selectedCustomer');
    if (box) box.style.display = 'none';

    setVal('saleRFC', '');
    setVal('saleCFDI', '');
}

// ================= ✅ PRODUCT SEARCH (NEW FIX) =================
function searchProducts() {
    const input = document.getElementById('productSearch');
    if (!input) return;

    const q = input.value.toLowerCase();
    const dropdown = document.getElementById('productDropdown');

    if (!q) {
        dropdown.style.display = 'none';
        return;
    }

    const filtered = products.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.model || '').toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q)
    );

    dropdown.innerHTML = filtered.map(p => `
        <div class="dropdown-item" onclick="selectProduct('${p.product_id}')">
            ${p.name} ${p.model ? `(${p.model})` : ''}
        </div>
    `).join('');

    dropdown.style.display = 'block';
}

function selectProduct(id) {
    selectedProduct = products.find(p => p.product_id === id);
    if (!selectedProduct) return;

    setVal('productSearch', selectedProduct.name);
    document.getElementById('productDropdown').style.display = 'none';
}

// ================= INVENTORY =================
function renderInventoryTable() {
    const table = document.getElementById('inventoryTable');
    if (!table) return;

    if (!products.length) {
        table.innerHTML = `<tr><td colspan="4">Sin datos</td></tr>`;
        return;
    }

    table.innerHTML = products.map(p => `
        <tr>
            <td>${p.name}</td>
            <td>${p.stock || 0}</td>
            <td>$${(p.cost_price || 0).toFixed(2)}</td>
            <td>
                <button class="btn-primary" onclick="openRestockModal('${p.product_id}', '${p.name.replace(/'/g, "")}')">
                    + Stock
                </button>
            </td>
        </tr>
    `).join('');
}

// ================= RESTOCK =================
function openRestockModal(productId, productName) {
    selectedProduct = products.find(p => p.product_id === productId);

    setText('restockProductName', productName);
    setVal('restockQuantity', '');
    setVal('restockCost', '');

    const modal = document.getElementById('restockModal');
    if (modal) modal.style.display = 'flex';
}

function closeRestockModal() {
    const modal = document.getElementById('restockModal');
    if (modal) modal.style.display = 'none';

    selectedProduct = null;
}

async function confirmRestock() {
    if (!supabaseClient || !selectedProduct) {
        showToast('Error');
        return;
    }

    const qty = parseInt(getVal('restockQuantity'));
    const cost = parseFloat(getVal('restockCost'));

    if (!qty || qty <= 0) {
        showToast('Cantidad inválida');
        return;
    }

    showLoading(true);

    try {
        const newStock = (selectedProduct.stock || 0) + qty;

        const updateData = { stock: newStock };

        if (!isNaN(cost) && cost > 0) {
            updateData.cost_price = cost;
        }

        const { error } = await supabaseClient
            .from('products')
            .update(updateData)
            .eq('product_id', selectedProduct.product_id);

        if (error) throw error;

        await loadProducts();
        renderInventoryTable();
        renderDashboard();

        closeRestockModal();
        showToast('Stock actualizado');

    } catch (err) {
        console.error(err);
        showToast('Error al actualizar');
    }

    showLoading(false);
}

// ================= ✅ EMAIL (UPDATED) =================
async function sendInvoiceEmail() {
    if (!currentCustomer) {
        showToast('Selecciona cliente');
        return;
    }

    await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            customer_name: currentCustomer.name,
            customer_email: currentCustomer.email,
            rfc: getVal('saleRFC'),
            cfdi_use: getVal('saleCFDI')
        })
    });

    showToast('Correo enviado');
}

// ================= HELPERS =================
function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

// ================= SAFE FALLBACKS =================
function finalizeSale() {}
function calculateTotals() {}
function toggleNotifications() {}
function loadData() { initializeApp(); }
function toggleChartMode() {}
function prevChartPage() {}
function nextChartPage() {}
function closeSaleModal() {}
function downloadPDF() {}
function shareWhatsApp() {}
function sendWelcomeEmail(e) { e.preventDefault(); showToast('Función pendiente'); }

// ================= UI =================
function showLoading(show) {
    const el = document.getElementById('loadingOverlay');
    if (el) el.style.display = show ? 'flex' : 'none';
}

function showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;

    t.style.cssText = `
        position:fixed;
        bottom:80px;
        left:16px;
        right:16px;
        background:#1e3a5f;
        color:#fff;
        padding:12px;
        border-radius:8px;
        z-index:999;
        text-align:center;
    `;

    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}