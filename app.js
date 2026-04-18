/**
 * Global Genetics MX - Premium POS System
 * Main Application Logic with Supabase Integration
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
    initApp();
});

async function initApp() {
    showLoading(true);
    try {
        await Promise.all([loadProducts(), loadCustomers()]);
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
// NAVIGATION
// ============================================================================

function goTo(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.add('active');
        currentScreen = screenId;
    }

    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.id === `nav-${screenId}`);
    });

    if (screenId === 'home') {
        renderDashboard();
    } else if (screenId === 'inventory') {
        filterProducts('');
    } else if (screenId === 'sale') {
        document.getElementById('productSearchInput').value = '';
        document.getElementById('searchResults').classList.add('hidden');
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

        const select = document.getElementById('customerSelect');
        if (select) {
            select.innerHTML = '<option value="WALK-IN">Público General</option>' +
                customers.map(c => `<option value="${c.customer_id}">${c.name}</option>`).join('');
        }

        return customers;
    } catch (error) {
        console.error('Load customers error:', error);
        showToast('❌ Error al cargar clientes', 'error');
        return [];
    }
}

// ============================================================================
// DASHBOARD
// ============================================================================

function renderDashboard() {
    let totalValue = 0;
    let lowStock = [];
    let outStock = [];

    products.forEach(p => {
        const stock = Number(p.stock) || 0;
        const cost = Number(p.cost_price) || 0;
        const min = Number(p.min_stock) || 0;

        totalValue += stock * cost;
        if (stock <= 0) {
            outStock.push(p);
        } else if (stock < min) {
            lowStock.push(p);
        }
    });

    // Update stats
    const valEl = document.getElementById('inventoryValue');
    const lowEl = document.getElementById('lowStockCount');
    const outEl = document.getElementById('outStockCount');

    if (valEl) valEl.innerText = `$${totalValue.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
    if (lowEl) lowEl.innerText = lowStock.length;
    if (outEl) outEl.innerText = outStock.length;

    // Update alerts
    const alertsList = document.getElementById('inventoryAlerts');
    if (alertsList) {
        if (lowStock.length === 0 && outStock.length === 0) {
            alertsList.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>Todo en orden</p></div>';
        } else {
            const outAlerts = outStock.map(p => `
                <div class="alert alert-danger">
                    <i class="fas fa-times-circle"></i>
                    <div>
                        <strong>${p.name}</strong> está agotado
                    </div>
                </div>
            `).join('');

            const lowAlerts = lowStock.map(p => `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div>
                        <strong>${p.name}</strong> tiene bajo stock (${p.stock})
                    </div>
                </div>
            `).join('');

            alertsList.innerHTML = outAlerts + lowAlerts;
        }
    }

    renderChart();
}

function renderChart() {
    const canvas = document.getElementById('chart');
    if (!canvas) return;

    // Prepare data with priority: out of stock (red), low stock (yellow), then rest
    let displayProducts = [...products];

    // Separate by status
    const outOfStock = displayProducts.filter(p => p.stock <= 0);
    const lowStock = displayProducts.filter(p => p.stock > 0 && p.stock < p.min_stock);
    const normal = displayProducts.filter(p => p.stock >= p.min_stock);

    // Sort each group by investment value
    const sortByValue = (a, b) => (b.stock * b.cost_price) - (a.stock * a.cost_price);
    outOfStock.sort(sortByValue);
    lowStock.sort(sortByValue);
    normal.sort(sortByValue);

    // Combine and take top 5
    displayProducts = [...outOfStock, ...lowStock, ...normal].slice(0, PRODUCTS_PER_PAGE);

    const ctx = canvas.getContext('2d');
    const labels = displayProducts.map(p => p.name.length > 12 ? p.name.substring(0, 10) + '..' : p.name);
    const data = displayProducts.map(p => chartMode === 'value' ? (p.stock * p.cost_price) : p.stock);
    const colors = displayProducts.map(p => {
        if (p.stock <= 0) return '#ef4444';
        if (p.stock < p.min_stock) return '#f59e0b';
        return '#1e3a5f';
    });

    const titleEl = document.getElementById('chartTitle');
    if (titleEl) titleEl.innerText = chartMode === 'value' ? 'Inversión por Producto' : 'Stock por Producto';

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (chartMode === 'value') {
                                return '$' + context.parsed.y.toLocaleString('es-MX', { minimumFractionDigits: 2 });
                            } else {
                                return context.parsed.y + ' unidades';
                            }
                        }
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, grid: { display: false } },
                x: { grid: { display: false } }
            }
        }
    });
}

function toggleChartMode() {
    chartMode = chartMode === 'value' ? 'quantity' : 'value';
    renderChart();
}

// ============================================================================
// INVENTORY MANAGEMENT
// ============================================================================

function filterProducts(query) {
    const q = query.toLowerCase();
    filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
    );
    renderInventoryTable();
}

function renderInventoryTable() {
    const tableBody = document.getElementById('productsTable');
    if (!tableBody) return;

    if (filteredProducts.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px;">No se encontraron productos</td></tr>';
        return;
    }

    tableBody.innerHTML = filteredProducts.map(p => {
        const stock = Number(p.stock);
        const min = Number(p.min_stock);
        let badgeClass = 'badge-primary';
        let badgeText = `${stock} unidades`;

        if (stock <= 0) {
            badgeClass = 'badge-danger';
            badgeText = 'Agotado';
        } else if (stock < min) {
            badgeClass = 'badge-warning';
            badgeText = `${stock} (Bajo)`;
        } else {
            badgeClass = 'badge-success';
        }

        return `
            <tr>
                <td>
                    <div style="font-weight: 600;">${p.name}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">${p.brand || ''} | ${p.category || ''}</div>
                </td>
                <td><span class="badge ${badgeClass}">${badgeText}</span></td>
                <td>$${Number(p.cost_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                <td>
                    <button class="btn btn-icon btn-secondary" onclick="restockProduct('${p.product_id}')" title="Agregar Stock">
                        <i class="fas fa-plus-circle"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function restockProduct(productId) {
    const product = products.find(p => p.product_id === productId);
    if (!product) return;

    const qty = prompt(`Cantidad a agregar para ${product.name}:`, '10');
    if (qty === null || qty === '' || isNaN(qty)) return;

    const cost = prompt(`Costo unitario:`, product.cost_price);
    if (cost === null || cost === '' || isNaN(cost)) return;

    showLoading(true);
    try {
        const newStock = Number(product.stock) + Number(qty);

        const { error } = await supabase
            .from('products')
            .update({
                stock: newStock,
                cost_price: Number(cost),
                updated_at: new Date().toISOString()
            })
            .eq('product_id', productId);

        if (error) throw error;

        await supabase
            .from('stock_history')
            .insert([{
                product_id: productId,
                quantity_change: Number(qty),
                reason: 'Restock manual'
            }]);

        showToast('✅ Stock actualizado', 'success');
        await loadProducts();
        filterProducts(document.getElementById('inventorySearch').value || '');
    } catch (error) {
        console.error('Restock error:', error);
        showToast('❌ Error al actualizar stock', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// SALES MANAGEMENT
// ============================================================================

function searchCustomers(query) {
    const q = query.toLowerCase();
    const results = customers.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.rfc && c.rfc.toLowerCase().includes(q))
    ).slice(0, 10);

    const dropdown = document.getElementById('customerDropdown');
    if (results.length === 0) {
        dropdown.classList.add('hidden');
        return;
    }

    dropdown.innerHTML = results.map(c => `
        <div class="dropdown-item" onclick="selectCustomer('${c.customer_id}', '${c.name}')">
            <div style="font-weight: 600;">${c.name}</div>
            <div style="font-size: 12px; color: var(--text-muted);">${c.rfc || ''}</div>
        </div>
    `).join('');

    dropdown.classList.remove('hidden');
}

function selectCustomer(customerId, name) {
    document.getElementById('customerSelect').value = customerId;
    document.getElementById('customerSearch').value = name;
    document.getElementById('customerDropdown').classList.add('hidden');
}

function searchProducts(query) {
    const q = query.toLowerCase();
    const results = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q))
    ).slice(0, 10);

    const resultsDiv = document.getElementById('searchResults');
    if (results.length === 0) {
        resultsDiv.classList.add('hidden');
        return;
    }

    resultsDiv.innerHTML = results.map(p => `
        <div class="dropdown-item" onclick="addToCart('${p.product_id}', '${p.name}', ${p.sale_price})">
            <div style="font-weight: 600;">${p.name}</div>
            <div style="font-size: 12px; color: var(--text-muted);">$${Number(p.sale_price).toLocaleString('es-MX')} | Stock: ${p.stock}</div>
        </div>
    `).join('');

    resultsDiv.classList.remove('hidden');
}

function addToCart(productId, name, price) {
    const existingItem = cartItems.find(item => item.ProductID === productId);

    if (existingItem) {
        existingItem.Quantity += 1;
    } else {
        cartItems.push({
            ProductID: productId,
            Name: name,
            Price: price,
            Quantity: 1
        });
    }

    renderCart();
    document.getElementById('productSearchInput').value = '';
    document.getElementById('searchResults').classList.add('hidden');
}

function renderCart() {
    const cartDiv = document.getElementById('cart');

    if (cartItems.length === 0) {
        cartDiv.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shopping-cart"></i>
                <p>El carrito está vacío</p>
            </div>
        `;
    } else {
        cartDiv.innerHTML = cartItems.map((item, index) => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--spacing-md); border-bottom: 1px solid var(--border);">
                <div style="flex: 1;">
                    <div style="font-weight: 600;">${item.Name}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">$${Number(item.Price).toLocaleString('es-MX')}</div>
                </div>
                <div style="display: flex; gap: var(--spacing-sm); align-items: center;">
                    <button class="btn btn-sm btn-secondary" onclick="updateQty(${index}, -1)">−</button>
                    <span style="width: 30px; text-align: center; font-weight: 600;">${item.Quantity}</span>
                    <button class="btn btn-sm btn-secondary" onclick="updateQty(${index}, 1)">+</button>
                    <button class="btn btn-sm btn-danger" onclick="removeFromCart(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
    updateTotals();
}

function updateQty(index, delta) {
    cartItems[index].Quantity += delta;
    if (cartItems[index].Quantity <= 0) {
        cartItems.splice(index, 1);
    }
    renderCart();
}

function removeFromCart(index) {
    cartItems.splice(index, 1);
    renderCart();
}

function updateTotals() {
    const sub = cartItems.reduce((acc, item) => acc + (item.Price * item.Quantity), 0);
    const disc = Number(document.getElementById('discount').value || 0);
    const baseForIva = Math.max(0, sub - disc);
    const ivaVal = baseForIva * 0.16;
    const totalVal = baseForIva + ivaVal;

    document.getElementById('subtotal').innerText = `$${sub.toFixed(2)}`;
    document.getElementById('iva').innerText = `$${ivaVal.toFixed(2)}`;
    document.getElementById('total').innerText = `$${totalVal.toFixed(2)}`;
}

async function createSale() {
    if (cartItems.length === 0) {
        showToast('❌ Agrega productos al carrito', 'error');
        return;
    }

    const customerId = document.getElementById('customerSelect').value;
    const paymentMethod = document.getElementById('paymentMethod').value;
    const subVal = parseFloat(document.getElementById('subtotal').innerText.replace('$', ''));
    const discVal = parseFloat(document.getElementById('discount').value || 0);
    const ivaVal = parseFloat(document.getElementById('iva').innerText.replace('$', ''));
    const totalVal = parseFloat(document.getElementById('total').innerText.replace('$', ''));

    showLoading(true);
    try {
        const saleId = `INV-${Date.now()}`;

        const { error: saleError } = await supabase
            .from('sales')
            .insert([{
                sale_id: saleId,
                customer_id: customerId,
                subtotal: subVal,
                discount: discVal,
                iva: ivaVal,
                total: totalVal,
                payment_method: paymentMethod,
                status: 'completed'
            }]);

        if (saleError) throw saleError;

        const itemsData = cartItems.map(item => ({
            sale_id: saleId,
            product_id: item.ProductID,
            quantity: item.Quantity,
            unit_price: item.Price,
            total: item.Price * item.Quantity
        }));

        const { error: itemsError } = await supabase
            .from('sale_items')
            .insert(itemsData);

        if (itemsError) throw itemsError;

        // Update stock
        for (const item of cartItems) {
            const product = products.find(p => p.product_id === item.ProductID);
            if (product) {
                const newStock = product.stock - item.Quantity;
                await supabase
                    .from('products')
                    .update({ stock: newStock })
                    .eq('product_id', item.ProductID);
            }
        }

        const customerName = document.getElementById('customerSelect').options[
            document.getElementById('customerSelect').selectedIndex
        ].text;

        lastSaleData = {
            sale_id: saleId,
            subtotal: subVal,
            discount: discVal,
            iva: ivaVal,
            total: totalVal,
            items: itemsData,
            customerName: customerName,
            paymentMethod: paymentMethod
        };

        showSaleConfirmation(saleId);

        cartItems = [];
        document.getElementById('discount').value = 0;
        renderCart();
        await loadProducts();

        showToast('✅ Venta registrada exitosamente', 'success');
    } catch (error) {
        console.error('Sale error:', error);
        showToast('❌ Error al procesar la venta', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// SALE CONFIRMATION
// ============================================================================

function showSaleConfirmation(saleId) {
    const modal = document.getElementById('saleConfirmModal');
    const invoiceEl = document.getElementById('saleInvoiceNumber');
    if (invoiceEl) invoiceEl.innerText = `Folio: ${saleId}`;
    modal.classList.remove('hidden');
}

function closeSaleConfirm() {
    document.getElementById('saleConfirmModal').classList.add('hidden');
    goTo('home');
}

async function sendInvoiceEmail() {
    if (!lastSaleData) {
        showToast('❌ No hay datos de venta', 'error');
        return;
    }

    const customer = customers.find(c => c.customer_id === document.getElementById('customerSelect').value);
    if (!customer || !customer.email) {
        showToast('❌ El cliente no tiene correo registrado', 'error');
        return;
    }

    showLoading(true);
    try {
        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
                to_email: customer.email,
                customer_name: customer.name,
                invoice_id: lastSaleData.sale_id,
                total: lastSaleData.total,
                items: lastSaleData.items.map(item => ({
                    product_name: item.product_id,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    total: item.total
                })),
                payment_method: lastSaleData.paymentMethod
            })
        });

        if (!response.ok) {
            throw new Error('Error al enviar email');
        }

        showToast('✅ Email enviado correctamente', 'success');
        closeSaleConfirm();
    } catch (error) {
        console.error('Email error:', error);
        showToast('❌ Error al enviar email: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function downloadInvoicePDF() {
    if (!lastSaleData) {
        showToast('❌ No hay datos de venta', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Header
    doc.setFontSize(16);
    doc.setTextColor(30, 58, 95);
    doc.text('Global Genetics MX', 105, 15, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('RECIBO DE VENTA', 105, 22, { align: 'center' });

    // Sale details
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`Folio: ${lastSaleData.sale_id}`, 20, 32);
    doc.text(`Fecha: ${new Date().toLocaleString('es-MX')}`, 20, 37);
    doc.text(`Cliente: ${lastSaleData.customerName}`, 20, 42);
    doc.text(`Método de Pago: ${lastSaleData.paymentMethod}`, 20, 47);

    // Items table
    const tableData = lastSaleData.items.map(item => [
        item.product_id,
        item.quantity,
        `$${Number(item.unit_price).toFixed(2)}`,
        `$${Number(item.total).toFixed(2)}`
    ]);

    doc.autoTable({
        startY: 55,
        head: [['Producto', 'Cant.', 'Precio Unit.', 'Subtotal']],
        body: tableData,
        headStyles: { fillColor: [30, 58, 95], textColor: [255, 255, 255] },
        foot: [
            ['', '', 'Subtotal:', `$${lastSaleData.subtotal.toFixed(2)}`],
            ['', '', 'Descuento:', `-$${lastSaleData.discount.toFixed(2)}`],
            ['', '', 'IVA (16%):', `$${lastSaleData.iva.toFixed(2)}`],
            ['', '', 'TOTAL:', `$${lastSaleData.total.toFixed(2)}`]
        ],
        footStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: 'bold' }
    });

    const finalY = doc.lastAutoTable.finalY || 150;
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text('¡Gracias por su compra!', 105, finalY + 15, { align: 'center' });

    doc.save(`Venta_${lastSaleData.sale_id}.pdf`);
    showToast('✅ PDF descargado', 'success');
}

function shareWhatsApp() {
    if (!lastSaleData) {
        showToast('❌ No hay datos de venta', 'error');
        return;
    }

    const message = `Hola, aquí está tu recibo de compra:\n\nFolio: ${lastSaleData.sale_id}\nTotal: $${lastSaleData.total.toFixed(2)}\n\n¡Gracias por tu compra en Global Genetics MX!`;
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
    showToast('✅ Abierto WhatsApp', 'success');
}

// ============================================================================
// CUSTOMER MANAGEMENT
// ============================================================================

async function createCustomer(event) {
    event.preventDefault();

    const name = document.getElementById('cName').value.trim();
    if (!name) {
        showToast('❌ El nombre es requerido', 'error');
        return;
    }

    showLoading(true);
    try {
        const { error } = await supabase
            .from('customers')
            .insert([{
                customer_id: `CUST-${Date.now()}`,
                name,
                email: document.getElementById('cEmail').value || null,
                phone: document.getElementById('cPhone').value || null,
                rfc: document.getElementById('cRFC').value || null,
                address: document.getElementById('cAddress').value || null,
                city: document.getElementById('cCity').value || null,
                state: document.getElementById('cState').value || null,
                cfdi_usage: document.getElementById('cCFDI').value,
                notes: document.getElementById('cNotes').value || null
            }]);

        if (error) throw error;

        showToast('✅ Cliente creado exitosamente', 'success');

        document.getElementById('cName').value = '';
        document.getElementById('cEmail').value = '';
        document.getElementById('cPhone').value = '';
        document.getElementById('cRFC').value = '';
        document.getElementById('cAddress').value = '';
        document.getElementById('cCity').value = '';
        document.getElementById('cState').value = '';
        document.getElementById('cCFDI').value = 'G03';
        document.getElementById('cNotes').value = '';

        await loadCustomers();
    } catch (error) {
        console.error('Create customer error:', error);
        showToast('❌ Error al crear cliente', 'error');
    } finally {
        showLoading(false);
    }
}

function sendWelcomeEmail() {
    const email = document.getElementById('welcomeEmail').value.trim();
    if (!email) {
        showToast('❌ Por favor ingresa un correo', 'error');
        return;
    }

    const registrationLink = `https://007leading-source.github.io/global-genetics-registration/registration-landing.html?email=${encodeURIComponent(email)}`;
    const message = `¡Hola! Te invitamos a registrarte en Global Genetics MX:\n\n${registrationLink}`;
    const encodedMessage = encodeURIComponent(message);

    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
    showToast('📧 Enlace de registro preparado', 'success');
    document.getElementById('welcomeEmail').value = '';

    // Add notification
    addNotification(`Enlace de bienvenida enviado a ${email}`);
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

function addNotification(message) {
    const timestamp = new Date().toLocaleTimeString('es-MX');
    notifications.unshift({ message, timestamp });
    if (notifications.length > 10) notifications.pop();
    updateNotificationsDisplay();
}

function updateNotificationsDisplay() {
    const list = document.getElementById('notificationsList');
    if (list) {
        if (notifications.length === 0) {
            list.innerHTML = '<div class="empty-state"><i class="fas fa-bell"></i><p>Sin notificaciones</p></div>';
        } else {
            list.innerHTML = notifications.map((n, i) => `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i>
                    <div>
                        <div style="font-weight: 600;">${n.message}</div>
                        <div style="font-size: 12px; color: var(--text-muted);">${n.timestamp}</div>
                    </div>
                </div>
            `).join('');
        }
    }
}

function toggleNotifications() {
    const panel = document.getElementById('notificationsPanel');
    panel.classList.toggle('hidden');
}

function clearNotifications() {
    notifications = [];
    updateNotificationsDisplay();
    showToast('✅ Notificaciones borradas', 'success');
}

// ============================================================================
// UI UTILITIES
// ============================================================================

function showLoading(show) {
    const el = document.getElementById('loadingOverlay');
    if (el) el.classList.toggle('hidden', !show);
}

function showToast(message, type = 'info') {
    const el = document.getElementById('toast');
    if (el) {
        el.innerText = message;
        el.style.background = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#1e3a5f';
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 3000);
    }
}
