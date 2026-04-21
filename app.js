/**
 * Global Genetics MX - Premium POS System
 */

// ================= CONFIG =================
const SUPABASE_URL = 'https://evpqdpcelmsrptqkvmhj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dxwKtN8SWAELwdtyHaDGWw___xkaGui';
const RESEND_API_KEY = 're_3HsyZabz_25fy9yhQqrnW2ZMB3QVDHtYo';

// ✅ SAFE INIT
let supabaseClient = null;

// ================= STATE =================
let products = [];
let customers = [];
let currentCustomer = null;
let selectedProduct = null;
let cart = [];
let chartInstance = null;
let chartMode = 'investment'; // 'investment' or 'stock'

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
    let totalValue = 0, low = 0, out = 0;

    products.forEach(p => {
        totalValue += (p.stock || 0) * (p.cost_price || 0);
        if (p.stock === 0) out++;
        else if (p.stock <= (p.min_stock || 5)) low++;
    });

    setText('inventoryValue', `$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    setText('lowStockCount', low);
    setText('outStockCount', out);

    renderChart();
    renderAlerts();
}

function renderAlerts() {
    const alertsList = document.getElementById('inventoryAlerts');
    if (!alertsList) return;

    const lowStock = products.filter(p => p.stock > 0 && p.stock <= (p.min_stock || 5));
    const outStock = products.filter(p => p.stock === 0);

    if (lowStock.length === 0 && outStock.length === 0) {
        alertsList.innerHTML = '<div class="empty-state">No hay alertas críticas</div>';
        return;
    }

    let html = '';
    outStock.forEach(p => {
        html += `<div class="alert-item danger"><strong>${p.name}</strong> está sin stock.</div>`;
    });
    lowStock.forEach(p => {
        html += `<div class="alert-item"><strong>${p.name}</strong> tiene stock bajo (${p.stock}).</div>`;
    });

    alertsList.innerHTML = html;
}

// ================= CHARTS =================
function toggleChartMode() {
    chartMode = chartMode === 'investment' ? 'stock' : 'investment';
    const title = chartMode === 'investment' ? 'Inversión por Producto' : 'Stock por Producto';
    setText('chartTitle', title);
    renderChart();
}

function renderChart() {
    const ctx = document.getElementById('chart');
    if (!ctx) return;

    if (chartInstance) {
        chartInstance.destroy();
    }

    // Sort products by value/stock and take top 10 for better visibility
    let sortedProducts = [...products];
    if (chartMode === 'investment') {
        sortedProducts.sort((a, b) => ((b.stock || 0) * (b.cost_price || 0)) - ((a.stock || 0) * (a.cost_price || 0)));
    } else {
        sortedProducts.sort((a, b) => (b.stock || 0) - (a.stock || 0));
    }
    
    const topProducts = sortedProducts.slice(0, 10);
    const labels = topProducts.map(p => p.name.length > 15 ? p.name.substring(0, 12) + '...' : p.name);
    const data = topProducts.map(p => chartMode === 'investment' ? (p.stock || 0) * (p.cost_price || 0) : (p.stock || 0));

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: chartMode === 'investment' ? 'Inversión ($)' : 'Stock (Unidades)',
                data: data,
                backgroundColor: chartMode === 'investment' ? '#1e3a5f' : '#22c55e',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { display: false }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });

    setText('page-info', `Top ${topProducts.length} de ${products.length}`);
}

// ================= VENTA MODULE =================
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
        <div class="dropdown-item" onclick="addToCart('${p.product_id}')">
            <div style="display:flex; justify-content:space-between;">
                <span>${p.name} ${p.model ? `(${p.model})` : ''}</span>
                <span style="color:var(--accent); font-weight:600;">$${(p.sale_price || 0).toFixed(2)}</span>
            </div>
            <small style="color:var(--text-muted)">Stock: ${p.stock || 0}</small>
        </div>
    `).join('');

    dropdown.style.display = 'block';
}

function addToCart(productId) {
    const product = products.find(p => p.product_id === productId);
    if (!product) return;

    if (product.stock <= 0) {
        showToast('Producto sin stock');
        return;
    }

    const existing = cart.find(item => item.product_id === productId);
    if (existing) {
        if (existing.quantity < product.stock) {
            existing.quantity++;
        } else {
            showToast('Stock máximo alcanzado');
        }
    } else {
        cart.push({
            product_id: product.product_id,
            name: product.name,
            price: product.sale_price || 0,
            quantity: 1,
            max_stock: product.stock
        });
    }

    setVal('productSearch', '');
    document.getElementById('productDropdown').style.display = 'none';
    renderCart();
    calculateTotals();
}

function renderCart() {
    const container = document.getElementById('cartItems');
    if (!container) return;

    if (cart.length === 0) {
        container.innerHTML = '<div class="empty-state">El carrito está vacío</div>';
        return;
    }

    container.innerHTML = cart.map((item, index) => `
        <div class="cart-item">
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">$${item.price.toFixed(2)} c/u | Subtotal: $${(item.price * item.quantity).toFixed(2)}</div>
            </div>
            <div class="qty-controls">
                <button class="qty-btn" onclick="updateQty(${index}, -1)">-</button>
                <span class="qty-display">${item.quantity}</span>
                <button class="qty-btn" onclick="updateQty(${index}, 1)">+</button>
                <button class="remove-item-btn" onclick="removeFromCart(${index})"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

function updateQty(index, delta) {
    const item = cart[index];
    const newQty = item.quantity + delta;
    
    if (newQty > 0 && newQty <= item.max_stock) {
        item.quantity = newQty;
        renderCart();
        calculateTotals();
    } else if (newQty > item.max_stock) {
        showToast('Stock insuficiente');
    }
}

function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
    calculateTotals();
}

function calculateTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discount = parseFloat(getVal('discount')) || 0;
    const baseForIva = Math.max(0, subtotal - discount);
    const iva = baseForIva * 0.16;
    const total = baseForIva + iva;

    setText('subtotal', `$${subtotal.toFixed(2)}`);
    setText('iva', `$${iva.toFixed(2)}`);
    setText('total', `$${total.toFixed(2)}`);
}

async function finalizeSale() {
    if (cart.length === 0) {
        showToast('El carrito está vacío');
        return;
    }
    if (!currentCustomer) {
        showToast('Selecciona un cliente');
        return;
    }
    if (!getVal('paymentMethod')) {
        showToast('Selecciona método de pago');
        return;
    }

    showLoading(true);

    try {
        const saleId = 'VEN-' + Date.now();
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const discount = parseFloat(getVal('discount')) || 0;
        const iva = (subtotal - discount) * 0.16;
        const total = (subtotal - discount) + iva;

        // 1. Create Sale Record
        const { error: saleError } = await supabaseClient
            .from('sales')
            .insert([{
                sale_id: saleId,
                customer_id: currentCustomer.customer_id,
                subtotal: subtotal,
                discount: discount,
                iva: iva,
                total: total,
                payment_method: getVal('paymentMethod')
            }]);

        if (saleError) throw saleError;

        // 2. Create Sale Items & Update Stock
        for (const item of cart) {
            // Insert sale item
            await supabaseClient.from('sale_items').insert([{
                sale_id: saleId,
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: item.price,
                total: item.price * item.quantity
            }]);

            // Update product stock
            const product = products.find(p => p.product_id === item.product_id);
            const newStock = product.stock - item.quantity;
            await supabaseClient.from('products').update({ stock: newStock }).eq('product_id', item.product_id);

            // Add stock history
            await supabaseClient.from('stock_history').insert([{
                product_id: item.product_id,
                quantity_change: -item.quantity,
                reason: `Venta ${saleId}`
            }]);
        }

        // Success UI
        setText('invoiceNumber', saleId);
        setText('saleTotal', `$${total.toFixed(2)}`);
        setText('saleMessage', `Venta realizada con éxito para ${currentCustomer.name}`);
        
        document.getElementById('saleModal').style.display = 'flex';
        
        // Auto Download PDF
        downloadPDF(saleId);

        // Reset Cart
        cart = [];
        renderCart();
        calculateTotals();
        await loadProducts(); // Refresh local stock
        renderDashboard();

    } catch (err) {
        console.error(err);
        showToast('Error al procesar venta');
    }

    showLoading(false);
}

function closeSaleModal() {
    document.getElementById('saleModal').style.display = 'none';
}

// ================= INVOICE & EMAIL =================
async function downloadPDF(saleId) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const sale_id = saleId || document.getElementById('invoiceNumber').textContent;
    const total = document.getElementById('saleTotal').textContent;
    
    doc.setFontSize(20);
    doc.text('Global Genetics MX', 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`Nota de Venta: ${sale_id}`, 20, 40);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 20, 50);
    doc.text(`Cliente: ${currentCustomer ? currentCustomer.name : 'N/A'}`, 20, 60);
    
    const tableData = cart.map(item => [item.name, item.quantity, `$${item.price.toFixed(2)}`, `$${(item.price * item.quantity).toFixed(2)}`]);
    
    doc.autoTable({
        startY: 70,
        head: [['Producto', 'Cant', 'Precio', 'Total']],
        body: tableData,
    });
    
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.text(`Total: ${total}`, 190, finalY, { align: 'right' });
    
    doc.save(`Factura_${sale_id}.pdf`);
}

async function sendInvoiceEmail() {
    if (!currentCustomer || !currentCustomer.email) {
        showToast('Cliente sin email');
        return;
    }

    const saleId = document.getElementById('invoiceNumber').textContent;
    const total = document.getElementById('saleTotal').textContent;

    showLoading(true);
    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`
            },
            body: JSON.stringify({
                from: 'Global Genetics MX <onboarding@resend.dev>',
                to: [currentCustomer.email],
                subject: `Tu Factura de Global Genetics MX - ${saleId}`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
                        <h2 style="color: #1e3a5f; text-align: center;">Global Genetics MX</h2>
                        <p>Hola <strong>${currentCustomer.name}</strong>,</p>
                        <p>Gracias por tu compra. Aquí tienes los detalles de tu venta:</p>
                        <div style="background: #f9f9f9; padding: 15px; border-radius: 8px;">
                            <p><strong>Folio:</strong> ${saleId}</p>
                            <p><strong>Total:</strong> ${total}</p>
                        </div>
                        <p>Adjunto a este correo (o disponible para descarga en el portal) encontrarás tu comprobante detallado.</p>
                        <p>Saludos,<br>El equipo de Global Genetics MX</p>
                    </div>
                `
            })
        });

        if (response.ok) {
            showToast('Email enviado con éxito');
        } else {
            throw new Error('Failed to send email');
        }
    } catch (err) {
        console.error(err);
        showToast('Error al enviar email');
    }
    showLoading(false);
}

// ================= STOCK MODULE =================
function openAddProductModal() {
    document.getElementById('addProductModal').style.display = 'flex';
}

function closeAddProductModal() {
    document.getElementById('addProductModal').style.display = 'none';
}

async function saveNewProduct() {
    const name = getVal('newProductName');
    const stock = parseInt(getVal('newProductStock')) || 0;
    const cost = parseFloat(getVal('newProductCost')) || 0;
    const price = parseFloat(getVal('newProductPrice')) || 0;

    if (!name || isNaN(price)) {
        showToast('Completa los campos obligatorios');
        return;
    }

    showLoading(true);
    try {
        const productId = 'PROD-' + Date.now();
        const { error } = await supabaseClient
            .from('products')
            .insert([{
                product_id: productId,
                name: name,
                model: getVal('newProductModel'),
                brand: getVal('newProductBrand'),
                stock: stock,
                cost_price: cost,
                sale_price: price
            }]);

        if (error) throw error;

        await loadProducts();
        renderInventoryTable();
        renderDashboard();
        closeAddProductModal();
        showToast('Producto agregado');
    } catch (err) {
        console.error(err);
        showToast('Error al guardar producto');
    }
    showLoading(false);
}

function renderInventoryTable() {
    const table = document.getElementById('inventoryTable');
    if (!table) return;

    if (!products.length) {
        table.innerHTML = `<tr><td colspan="4" class="empty-state">Sin datos</td></tr>`;
        return;
    }

    table.innerHTML = products.map(p => `
        <tr>
            <td>
                <div style="font-weight:600">${p.name}</div>
                <small style="color:var(--text-muted)">${p.brand || ''} ${p.model || ''}</small>
            </td>
            <td>
                <span class="stock-badge ${p.stock === 0 ? 'out' : (p.stock <= (p.min_stock || 5) ? 'low' : 'ok')}">
                    ${p.stock || 0}
                </span>
            </td>
            <td>$${(p.cost_price || 0).toFixed(2)}</td>
            <td>
                <button class="btn-primary" onclick="openRestockModal('${p.product_id}', '${p.name.replace(/'/g, "")}')">
                    + Stock
                </button>
            </td>
        </tr>
    `).join('');
}

function openRestockModal(productId, productName) {
    selectedProduct = products.find(p => p.product_id === productId);
    setText('restockProductName', productName);
    setVal('restockQuantity', '');
    setVal('restockCost', '');
    document.getElementById('restockModal').style.display = 'flex';
}

function closeRestockModal() {
    document.getElementById('restockModal').style.display = 'none';
    selectedProduct = null;
}

async function confirmRestock() {
    if (!supabaseClient || !selectedProduct) return;

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
        if (!isNaN(cost) && cost > 0) updateData.cost_price = cost;

        const { error } = await supabaseClient
            .from('products')
            .update(updateData)
            .eq('product_id', selectedProduct.product_id);

        if (error) throw error;

        await supabaseClient.from('stock_history').insert([{
            product_id: selectedProduct.product_id,
            quantity_change: qty,
            reason: 'Reabastecimiento manual'
        }]);

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

// ================= CUSTOMERS =================
async function addCustomer(e) {
    e.preventDefault();
    if (!supabaseClient) return;

    showLoading(true);
    try {
        const payload = {
            name: getVal('customerNameInput'),
            email: getVal('customerEmailInput'),
            rfc: getVal('customerRFC'),
            cfdi_use: getVal('customerCFDI'),
            phone: getVal('customerPhone'),
            address: getVal('customerAddress'),
            city: getVal('customerCity'),
            state: getVal('customerState'),
            postal_code: getVal('customerPostal')
        };

        const { error } = await supabaseClient.from('customers').insert([payload]);
        if (error) throw error;

        await loadCustomers();
        showToast('Cliente guardado');
        e.target.reset();
    } catch (err) {
        console.error(err);
        showToast('Error al guardar');
    }
    showLoading(false);
}

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

function selectCustomer(id) {
    currentCustomer = customers.find(c => c.customer_id === id);
    if (!currentCustomer) return;

    setVal('customerSearch', currentCustomer.name);
    document.getElementById('customerDropdown').style.display = 'none';
    document.getElementById('selectedCustomer').style.display = 'flex';
    setText('customerName', currentCustomer.name);
}

function clearCustomer() {
    currentCustomer = null;
    setVal('customerSearch', '');
    document.getElementById('selectedCustomer').style.display = 'none';
}

async function sendWelcomeEmail(e) {
    e.preventDefault();
    const email = getVal('welcomeEmailInput');
    if (!email) return;

    showLoading(true);
    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`
            },
            body: JSON.stringify({
                from: 'Global Genetics MX <onboarding@resend.dev>',
                to: [email],
                subject: '¡Bienvenido a Global Genetics MX Partner!',
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;">
                        <h2 style="color: #1e3a5f;">¡Hola!</h2>
                        <p>Te invitamos a formar parte de nuestra red de socios <strong>Global Genetics MX Partner</strong>.</p>
                        <p>Para completar tu registro y brindarte un mejor servicio, por favor llena el siguiente formulario:</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="https://007leading-source.github.io/global_genetics/register.html" 
                               style="background: #22c55e; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                               Completar Registro
                            </a>
                        </div>
                        <p>Es un gusto tenerte con nosotros.</p>
                        <p>Saludos,<br>Equipo Global Genetics MX</p>
                    </div>
                `
            })
        });

        if (response.ok) {
            showToast('Invitación enviada');
            e.target.reset();
        } else {
            throw new Error('Failed to send');
        }
    } catch (err) {
        console.error(err);
        showToast('Error al enviar invitación');
    }
    showLoading(false);
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

function showLoading(show) {
    const el = document.getElementById('loadingOverlay');
    if (el) el.style.display = show ? 'flex' : 'none';
}

function showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `position:fixed; bottom:80px; left:16px; right:16px; background:#1e3a5f; color:#fff; padding:12px; border-radius:8px; z-index:9999; text-align:center; box-shadow: 0 4px 12px rgba(0,0,0,0.2);`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function toggleNotifications() {
    const panel = document.getElementById('notifications-panel');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function shareWhatsApp() {
    const saleId = document.getElementById('invoiceNumber').textContent;
    const total = document.getElementById('saleTotal').textContent;
    const text = encodeURIComponent(`Hola, aquí tienes tu comprobante de Global Genetics MX.\nFolio: ${saleId}\nTotal: ${total}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
}

function searchInventory() {
    renderInventoryTable();
}

function prevChartPage() {}
function nextChartPage() {}
function loadData() { initializeApp(); }
