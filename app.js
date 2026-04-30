/**
 * Global Genetics MX - Premium POS System
 */

// ================= PASSWORD PROTECTION =================
const CORRECT_PASSWORD = '1234';

function checkPassword(event) {
    event.preventDefault();
    const passwordInput = document.getElementById('passwordInput');
    const passwordError = document.getElementById('passwordError');
    
    if (passwordInput.value === CORRECT_PASSWORD) {
        // Password correct - hide password screen and show app
        document.getElementById('passwordScreen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        passwordInput.value = '';
        // Initialize the app
        initializeApp();
    } else {
        // Password incorrect - show error
        passwordError.style.display = 'block';
        passwordInput.value = '';
        passwordInput.focus();
        setTimeout(() => {
            passwordError.style.display = 'none';
        }, 3000);
    }
}

// ================= CONFIG =================
const SUPABASE_URL = 'https://evpqdpcelmsrptqkvmhj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dxwKtN8SWAELwdtyHaDGWw___xkaGui';
const EDGE_FUNCTION_URL = 'https://evpqdpcelmsrptqkvmhj.supabase.co/functions/v1/resend-email';

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
// Note: initializeApp() is now called from checkPassword() after password validation
// This prevents the app from initializing until the correct password is entered

async function initializeApp() {
    // Focus password input on page load
    setTimeout(() => {
        const passwordInput = document.getElementById('passwordInput');
        if (passwordInput) passwordInput.focus();
    }, 100);
    
    // Only initialize app data if already authenticated
    if (document.getElementById('app').style.display === 'none') {
        return; // Password screen is still showing
    }
    
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
    const totalStr = document.getElementById('saleTotal').textContent;
    const totalNum = parseFloat(totalStr.replace(/[^0-9.-]+/g, "")) || 0;
    const subtotal = totalNum / 1.16;
    const iva = totalNum - subtotal;
    const now = new Date();

    // --- MODERN PREMIUM HEADER ---
    // Logo (Embedded Base64 JPEG)
    const logoBase64 = "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";

    // --- HEADER ---
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 50, 'F');
    
    // Logo
    try {
        doc.addImage(logoBase64, 'JPEG', 20, 10, 30, 30);
    } catch (e) {
        console.warn("Logo could not be loaded");
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(30, 58, 95);
    doc.text("GLOBAL GENETICS MX", 55, 25);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(30, 58, 95);
    doc.text("JALOSTOTITLAN, JALISCO", 190, 25, { align: "right" });
    doc.text("TEL. 431 101 0504", 190, 30, { align: "right" });
    doc.text("CTA. BANCOMER: 0465 8705 85", 190, 35, { align: "right" });
    doc.text("CLABE: 01235 6004 6587 0585 71", 190, 40, { align: "right" });

    // Invoice Details Bar
    doc.setFillColor(245, 245, 245);
    doc.rect(20, 60, 170, 15, 'F');
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 58, 95);
    doc.text(`NOTA DE VENTA: #${sale_id}`, 25, 70);
    doc.setTextColor(0, 0, 0);
    doc.text(`FECHA: ${now.toLocaleDateString('es-MX')}`, 185, 70, { align: "right" });

    // --- CUSTOMER SECTION ---
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 95);
    doc.text("DATOS DEL CLIENTE", 20, 85);
    doc.setDrawColor(230, 230, 230);
    doc.line(20, 87, 190, 87);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    if (currentCustomer) {
        doc.setFont("helvetica", "bold");
        doc.text(currentCustomer.name || "N/A", 20, 95);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(`${currentCustomer.address || ""}, ${currentCustomer.city || ""}`, 20, 100);
        doc.text(`Tel: ${currentCustomer.phone || "N/A"}`, 20, 105);
        doc.text(`RFC: ${currentCustomer.rfc || "N/A"}`, 20, 110);
    }

    // --- ITEMS TABLE ---
    const tableData = cart.map(item => [
        item.name,
        item.unit || "PZA",
        item.quantity,
        `$${item.price.toLocaleString('es-MX', {minimumFractionDigits: 2})}`,
        `$${(item.price * item.quantity).toLocaleString('es-MX', {minimumFractionDigits: 2})}`
    ]);

    doc.autoTable({
        startY: 120,
        head: [['PRODUCTO', 'UNIDAD', 'CANT', 'PRECIO UNIT.', 'IMPORTE']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [30, 58, 95], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 25, halign: 'center' },
            2: { cellWidth: 20, halign: 'center' },
            3: { cellWidth: 35, halign: 'right' },
            4: { cellWidth: 35, halign: 'right' }
        },
        margin: { left: 20, right: 20 }
    });

    // --- TOTALS SECTION ---
    let finalY = doc.lastAutoTable.finalY + 10;
    const totalsX = 140;

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("SUBTOTAL:", totalsX, finalY);
    doc.text(`$${subtotal.toLocaleString('es-MX', {minimumFractionDigits: 2})}`, 190, finalY, { align: "right" });
    
    finalY += 7;
    doc.text("IVA (16%):", totalsX, finalY);
    doc.text(`$${iva.toLocaleString('es-MX', {minimumFractionDigits: 2})}`, 190, finalY, { align: "right" });
    
    finalY += 10;
    doc.setFillColor(30, 58, 95);
    doc.rect(totalsX - 5, finalY - 6, 55, 10, 'F');
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("TOTAL:", totalsX, finalY);
    doc.text(`$${totalNum.toLocaleString('es-MX', {minimumFractionDigits: 2})}`, 190, finalY, { align: "right" });

    // --- FOOTER ---
    finalY = 260;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Gracias por su preferencia.", 105, finalY, { align: "center" });
    doc.text("Este documento es una nota de venta simplificada.", 105, finalY + 5, { align: "center" });

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
        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
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
                <div class="action-cell">
                    <button class="btn-primary" onclick="openRestockModal('${p.product_id}', '${p.name.replace(/'/g, "")}')">
                        + Stock
                    </button>
                    <div class="menu-container">
                        <button class="btn-dots" onclick="toggleActionMenu(event, '${p.product_id}')">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <div id="menu-${p.product_id}" class="action-menu" style="display:none;">
                            <div class="menu-option" onclick="openEditProductModal('${p.product_id}')">
                                <i class="fas fa-edit"></i> Editar
                            </div>
                            <div class="menu-option delete" onclick="deleteProduct('${p.product_id}')">
                                <i class="fas fa-trash"></i> Borrar
                            </div>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    `).join('');
}

function toggleActionMenu(event, productId) {
    event.stopPropagation();
    const menu = document.getElementById(`menu-${productId}`);
    const allMenus = document.querySelectorAll('.action-menu');
    
    allMenus.forEach(m => {
        if (m.id !== `menu-${productId}`) m.style.display = 'none';
    });

    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }

    // Close menu when clicking outside
    const closeMenu = () => {
        if (menu) menu.style.display = 'none';
        document.removeEventListener('click', closeMenu);
    };
    document.addEventListener('click', closeMenu);
}

function openEditProductModal(productId) {
    selectedProduct = products.find(p => p.product_id === productId);
    if (!selectedProduct) return;

    setText('editProductName', selectedProduct.name);
    setVal('editProductPrice', selectedProduct.sale_price || 0);
    setVal('editProductStock', selectedProduct.stock || 0);
    document.getElementById('editProductModal').style.display = 'flex';
}

function closeEditProductModal() {
    document.getElementById('editProductModal').style.display = 'none';
    selectedProduct = null;
}

async function saveEditProduct() {
    if (!supabaseClient || !selectedProduct) return;

    const price = parseFloat(getVal('editProductPrice'));
    const stock = parseInt(getVal('editProductStock'));

    if (isNaN(price) || isNaN(stock)) {
        showToast('Valores inválidos');
        return;
    }

    showLoading(true);
    try {
        const { error } = await supabaseClient
            .from('products')
            .update({ 
                sale_price: price,
                stock: stock 
            })
            .eq('product_id', selectedProduct.product_id);

        if (error) throw error;

        await loadProducts();
        renderInventoryTable();
        renderDashboard();
        closeEditProductModal();
        showToast('Producto actualizado');
    } catch (err) {
        console.error(err);
        showToast('Error al actualizar');
    }
    showLoading(false);
}

async function deleteProduct(productId) {
    if (!supabaseClient) return;
    
    const product = products.find(p => p.product_id === productId);
    if (!product) return;

    if (!confirm(`¿Estás seguro de que deseas borrar "${product.name}"?`)) return;

    showLoading(true);
    try {
        // Attempt to delete, if it fails (due to foreign keys), set stock to 0
        const { error: deleteError } = await supabaseClient
            .from('products')
            .delete()
            .eq('product_id', productId);

        if (deleteError) {
            console.warn('Delete failed, setting stock to 0 instead:', deleteError);
            const { error: updateError } = await supabaseClient
                .from('products')
                .update({ stock: 0 })
                .eq('product_id', productId);
            
            if (updateError) throw updateError;
            showToast('Stock establecido a 0');
        } else {
            showToast('Producto eliminado');
        }

        await loadProducts();
        renderInventoryTable();
        renderDashboard();
    } catch (err) {
        console.error(err);
        showToast('Error al procesar');
    }
    showLoading(false);
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
        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
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
