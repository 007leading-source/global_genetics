/**
 * Global Genetics MX - Premium POS Pro
 * Supabase-powered Point of Sale System
 * Mobile-First Design with Company Branding
 */

// ============================================================================
// CONFIGURATION & INITIALIZATION
// ============================================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';
const COMPANY_LOGO = import.meta.env.VITE_APP_LOGO || 'https://via.placeholder.com/200';
const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || 'Global Genetics MX';
const REGISTRATION_FORM_URL = import.meta.env.VITE_CUSTOMER_REGISTRATION_URL || 'https://your-github-pages-url/form.html';

// Initialize Supabase client
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global State
let products = [];
let filtered = [];
let chart = null;
let chartMode = "value"; // 'value' or 'quantity'
let customers = [];
let cartItems = [];
let currentScreen = 'home';
let lastSaleData = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    showLoading(true);
    try {
        // Set company logo
        const logoImg = document.getElementById('companyLogo');
        if (logoImg) logoImg.src = COMPANY_LOGO;

        // Load data from Supabase
        await Promise.all([loadProducts(), loadCustomers()]);
        goTo('home');
    } catch (error) {
        console.error('Initialization error:', error);
        showToast("Error al iniciar la aplicación: " + error.message);
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// NAVIGATION
// ============================================================================

function goTo(screenId) {
    // Update active screen
    document.querySelectorAll(".screen").forEach(x => x.classList.remove("active"));
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add("active");
        currentScreen = screenId;
    }

    // Update nav buttons
    document.querySelectorAll(".nav-item").forEach(btn => {
        btn.classList.toggle("active", btn.id === `nav-${screenId}`);
    });

    // Refresh data based on screen
    if (screenId === "inventory") {
        renderInventoryTable();
    } else if (screenId === "home") {
        renderDashboard();
    } else if (screenId === "sale") {
        const searchInput = document.getElementById('productSearchInput');
        if (searchInput) searchInput.value = '';
        hideSearchResults();
    }
}

// ============================================================================
// DATA LOADING FROM SUPABASE
// ============================================================================

async function loadProducts() {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;
        products = data || [];
        filtered = [...products];

        if (currentScreen === 'home') renderDashboard();
        if (currentScreen === 'inventory') renderInventoryTable();

        return products;
    } catch (error) {
        console.error('Load Products Error:', error);
        showToast("Error al cargar productos");
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
            select.innerHTML = `<option value="WALK-IN">Público General</option>` +
                customers.map(c => `<option value="${c.customer_id}">${c.name}</option>`).join("");
        }

        return customers;
    } catch (error) {
        console.error('Load Customers Error:', error);
        showToast("Error al cargar clientes");
        return [];
    }
}

// ============================================================================
// DASHBOARD & ANALYTICS
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

    // Update Stats
    const valEl = document.getElementById('inventoryValue');
    const lowEl = document.getElementById('lowStockCount');
    const outEl = document.getElementById('outStockCount');

    if (valEl) valEl.innerText = `$${totalValue.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
    if (lowEl) lowEl.innerText = lowStock.length;
    if (outEl) outEl.innerText = outStock.length;

    // Update Alerts List
    const alertsList = document.getElementById('inventoryAlerts');
    if (alertsList) {
        if (lowStock.length === 0 && outStock.length === 0) {
            alertsList.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>Todo en orden</p></div>';
        } else {
            const outAlerts = outStock.map(p => `
                <div class="alert-item out">
                    <i class="fas fa-times-circle"></i>
                    <span><strong>${p.name}</strong> está agotado</span>
                </div>
            `).join("");

            const lowAlerts = lowStock.map(p => `
                <div class="alert-item low">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span><strong>${p.name}</strong> tiene bajo stock (${p.stock})</span>
                </div>
            `).join("");

            alertsList.innerHTML = outAlerts + lowAlerts;
        }
    }

    renderChart();
}

function renderChart() {
    const canvas = document.getElementById("chart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    // Display top 8 products for better mobile visibility
    const displayProducts = [...products]
        .sort((a, b) => (b.stock * b.cost_price) - (a.stock * a.cost_price))
        .slice(0, 8);

    const labels = displayProducts.map(p => p.name.length > 12 ? p.name.substring(0, 10) + '..' : p.name);
    const data = displayProducts.map(p => chartMode === "value" ? (p.stock * p.cost_price) : p.stock);
    const colors = displayProducts.map(p => p.stock < p.min_stock ? "#ef4444" : "#1e3a5f");

    const titleEl = document.getElementById('chartTitle');
    if (titleEl) titleEl.innerText = chartMode === "value" ? "Inversión por Producto" : "Stock por Producto";

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
        type: "bar",
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
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (chartMode === 'value') {
                                label += '$' + context.parsed.y.toLocaleString();
                            } else {
                                label += context.parsed.y;
                            }
                            return label;
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
    chartMode = chartMode === "value" ? "quantity" : "value";
    renderChart();
}

// ============================================================================
// INVENTORY MANAGEMENT
// ============================================================================

function renderInventoryTable() {
    const tableBody = document.getElementById('productsTable');
    if (!tableBody) return;

    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="empty-state">No se encontraron productos</td></tr>';
        return;
    }

    tableBody.innerHTML = filtered.map(p => {
        const isLow = Number(p.stock) < Number(p.min_stock);
        const isOut = Number(p.stock) <= 0;
        let badgeClass = 'ok';
        let badgeText = p.stock;

        if (isOut) { badgeClass = 'out'; badgeText = 'Agotado'; }
        else if (isLow) { badgeClass = 'low'; badgeText = `${p.stock} (Bajo)`; }

        return `
            <tr>
                <td>
                    <div style="font-weight:600">${p.name}</div>
                    <div style="font-size:11px; color:var(--text-muted)">${p.brand || ''} | ${p.category || ''}</div>
                </td>
                <td>
                    <span class="stock-badge ${badgeClass}">${badgeText}</span>
                </td>
                <td>$${Number(p.cost_price).toLocaleString("es-MX")}</td>
                <td>
                    <div style="display:flex; gap:8px">
                        <button class="icon-btn" onclick="restock('${p.product_id}')" title="Restock">
                            <i class="fas fa-plus-circle"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function filterProducts(query) {
    const q = query.toLowerCase();
    filtered = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
    );
    renderInventoryTable();
}

function sort(field) {
    filtered.sort((a, b) => {
        let valA = a[field];
        let valB = b[field];

        if (!isNaN(valA) && !isNaN(valB)) {
            return Number(valA) - Number(valB);
        }

        return String(valA).localeCompare(String(valB));
    });
    renderInventoryTable();
}

async function restock(id) {
    const product = products.find(p => p.product_id === id);
    const qty = prompt(`Cantidad a añadir para ${product.name}:`, "10");
    if (qty === null || qty === "" || isNaN(qty)) return;

    const cost = prompt(`Costo unitario de esta entrada:`, product.cost_price);
    if (cost === null || cost === "" || isNaN(cost)) return;

    showLoading(true);
    try {
        const newStock = Number(product.stock) + Number(qty);
        const { error } = await supabase
            .from('products')
            .update({
                stock: newStock,
                cost_price: cost,
                updated_at: new Date()
            })
            .eq('product_id', id);

        if (error) throw error;

        // Record stock history
        await supabase
            .from('stock_history')
            .insert([{
                product_id: id,
                quantity_change: Number(qty),
                reason: 'Restock manual'
            }]);

        showToast("✅ Stock actualizado");
        await loadProducts();
    } catch (error) {
        console.error('Restock error:', error);
        showToast("Error al actualizar stock");
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// PRODUCT MANAGEMENT
// ============================================================================

function openProductForm() {
    document.getElementById('productModal').classList.remove('hidden');
}

function closeProductForm() {
    document.getElementById('productModal').classList.add('hidden');
}

async function createProduct() {
    const name = document.getElementById('pName').value.trim();
    if (!name) {
        showToast("El nombre del producto es requerido");
        return;
    }

    showLoading(true);
    try {
        const { error } = await supabase
            .from('products')
            .insert([{
                product_id: `PROD-${Date.now()}`,
                name,
                brand: document.getElementById('pBrand').value,
                category: document.getElementById('pCategory').value,
                model: document.getElementById('pModel').value,
                unit: document.getElementById('pUnit').value || 'pcs',
                cost_price: Number(document.getElementById('pCost').value) || 0,
                sale_price: Number(document.getElementById('pPrice').value) || 0,
                stock: Number(document.getElementById('pStock').value) || 0,
                min_stock: Number(document.getElementById('pMinStock').value) || 10,
                supplier: document.getElementById('pSupplier').value,
                description: document.getElementById('pDesc').value
            }]);

        if (error) throw error;

        showToast("✅ Producto creado exitosamente");
        closeProductForm();
        await loadProducts();
    } catch (error) {
        console.error('Create product error:', error);
        showToast("Error al crear producto");
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// SALE MANAGEMENT
// ============================================================================

function searchProducts(query) {
    const q = query.toLowerCase();
    const results = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q))
    ).slice(0, 10);

    const resultsDiv = document.getElementById('searchResults');
    if (results.length === 0) {
        hideSearchResults();
        return;
    }

    resultsDiv.innerHTML = results.map(p => `
        <div class="search-item" onclick="addToCart('${p.product_id}', '${p.name}', ${p.sale_price})">
            <div style="font-weight: 600;">${p.name}</div>
            <div style="font-size: 12px; color: var(--text-muted);">$${Number(p.sale_price).toLocaleString("es-MX")} | Stock: ${p.stock}</div>
        </div>
    `).join("");

    resultsDiv.classList.remove('hidden');
}

function hideSearchResults() {
    document.getElementById('searchResults').classList.add('hidden');
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
    hideSearchResults();
    document.getElementById('productSearchInput').value = '';
}

function renderCart() {
    const cartDiv = document.getElementById('cart');

    if (cartItems.length === 0) {
        cartDiv.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-shopping-cart"></i>
                <p>El carrito está vacío</p>
            </div>
        `;
    } else {
        cartDiv.innerHTML = cartItems.map((item, index) => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.Name}</div>
                    <div class="cart-item-price">$${Number(item.Price).toLocaleString("es-MX")}</div>
                </div>
                <div class="qty-controls">
                    <button class="qty-btn" onclick="updateQty(${index}, -1)">−</button>
                    <span style="width: 30px; text-align: center; font-weight: 600;">${item.Quantity}</span>
                    <button class="qty-btn" onclick="updateQty(${index}, 1)">+</button>
                </div>
                <button class="text-btn" onclick="removeFromCart(${index})" style="color:var(--danger); margin-left:12px">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join("");
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

    document.getElementById('subtotal').innerText = sub.toFixed(2);
    document.getElementById('iva').innerText = ivaVal.toFixed(2);
    document.getElementById('total').innerText = totalVal.toFixed(2);
}

async function createSale() {
    if (cartItems.length === 0) {
        showToast("Agrega productos al carrito");
        return;
    }

    const customerId = document.getElementById('customerSelect').value;
    const paymentMethod = document.getElementById('paymentMethod').value;
    const subVal = parseFloat(document.getElementById('subtotal').innerText);
    const discVal = parseFloat(document.getElementById('discount').value || 0);
    const ivaVal = parseFloat(document.getElementById('iva').innerText);
    const totalVal = parseFloat(document.getElementById('total').innerText);

    showLoading(true);
    try {
        // Create sale
        const saleId = `INV-${Date.now()}`;
        const { data: saleData, error: saleError } = await supabase
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
            }])
            .select();

        if (saleError) throw saleError;

        // Create sale items
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

        // Update product stock
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

        // Prepare data for PDF and confirmation
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

        // Show confirmation modal
        showSaleConfirmation(saleId);

        // Reset cart
        cartItems = [];
        document.getElementById('discount').value = 0;
        renderCart();
        await loadProducts();

    } catch (error) {
        console.error('Create sale error:', error);
        showToast("❌ Error al procesar la venta");
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// SALE CONFIRMATION & ACTIONS
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

function downloadInvoicePDF() {
    if (!lastSaleData) {
        showToast("No hay datos de venta disponibles");
        return;
    }
    generateProfessionalPDF(lastSaleData);
    showToast("✅ PDF descargado");
}

function sendInvoiceEmail() {
    if (!lastSaleData) {
        showToast("No hay datos de venta disponibles");
        return;
    }
    showToast("📧 Función de email en desarrollo");
    // TODO: Implement email sending via backend
}

function shareWhatsApp() {
    if (!lastSaleData) {
        showToast("No hay datos de venta disponibles");
        return;
    }
    const message = `Hola, aquí está tu recibo de compra:\n\nFolio: ${lastSaleData.sale_id}\nTotal: $${lastSaleData.total.toFixed(2)}\n\nGracias por tu compra en ${COMPANY_NAME}`;
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
}

// ============================================================================
// PDF GENERATION
// ============================================================================

function generateProfessionalPDF(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Header with company info
    doc.setFontSize(14);
    doc.setTextColor(30, 58, 95); // Primary color
    doc.text(COMPANY_NAME, 105, 15, { align: "center" });

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("RECIBO DE VENTA", 105, 22, { align: "center" });

    // Company details
    doc.setFontSize(9);
    doc.text(`Folio: ${data.sale_id}`, 20, 32);
    doc.text(`Fecha: ${new Date().toLocaleString('es-MX')}`, 20, 37);
    doc.text(`Cliente: ${data.customerName}`, 20, 42);
    doc.text(`Método de Pago: ${data.paymentMethod}`, 20, 47);

    // Items table
    const tableData = (data.items || []).map(item => [
        item.product_id || "Producto",
        item.quantity || 0,
        `$${Number(item.unit_price || 0).toFixed(2)}`,
        `$${Number(item.total || 0).toFixed(2)}`
    ]);

    doc.autoTable({
        startY: 55,
        head: [['Producto', 'Cant.', 'Precio Unit.', 'Subtotal']],
        body: tableData,
        headStyles: { fillColor: [30, 58, 95], textColor: [255, 255, 255] },
        foot: [
            ['', '', 'Subtotal:', `$${Number(data.subtotal || 0).toFixed(2)}`],
            ['', '', 'Descuento:', `-$${Number(data.discount || 0).toFixed(2)}`],
            ['', '', 'IVA (16%):', `$${Number(data.iva || 0).toFixed(2)}`],
            ['', '', 'TOTAL:', `$${Number(data.total || 0).toFixed(2)}`]
        ],
        footStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: 'bold' }
    });

    const finalY = doc.lastAutoTable.finalY || 150;
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text("¡Gracias por su compra!", 105, finalY + 15, { align: "center" });

    doc.save(`Venta_${data.sale_id}.pdf`);
}

// ============================================================================
// CUSTOMER MANAGEMENT
// ============================================================================

async function createCustomer() {
    const name = document.getElementById('cName').value.trim();
    if (!name) {
        showToast("El nombre del cliente es requerido");
        return;
    }

    showLoading(true);
    try {
        const { error } = await supabase
            .from('customers')
            .insert([{
                customer_id: `CUST-${Date.now()}`,
                name,
                email: document.getElementById('cEmail').value,
                phone: document.getElementById('cPhone').value,
                rfc: document.getElementById('cRFC').value,
                address: document.getElementById('cAddress').value,
                cfdi_usage: document.getElementById('cCFDI').value,
                notes: document.getElementById('cNotes').value
            }]);

        if (error) throw error;

        showToast("✅ Cliente creado exitosamente");
        // Clear form
        document.getElementById('cName').value = '';
        document.getElementById('cEmail').value = '';
        document.getElementById('cPhone').value = '';
        document.getElementById('cRFC').value = '';
        document.getElementById('cAddress').value = '';
        document.getElementById('cCFDI').value = 'G03';
        document.getElementById('cNotes').value = '';

        await loadCustomers();
    } catch (error) {
        console.error('Create customer error:', error);
        showToast("Error al crear cliente");
    } finally {
        showLoading(false);
    }
}

function sendWelcomeEmail() {
    const email = document.getElementById('cEmail').value.trim();
    if (!email) {
        showToast("Por favor ingresa un correo electrónico");
        return;
    }

    const registrationLink = `${REGISTRATION_FORM_URL}?email=${encodeURIComponent(email)}`;
    const message = `Hola, te invitamos a registrarte en nuestro sistema:\n\n${registrationLink}`;
    const encodedMessage = encodeURIComponent(message);

    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
    showToast("📧 Enlace de registro preparado");
}

// ============================================================================
// UI UTILITIES
// ============================================================================

function showLoading(show) {
    const el = document.getElementById('loading');
    if (el) el.classList.toggle('hidden', !show);
}

function showToast(message) {
    const el = document.getElementById('toast');
    const msg = document.getElementById('toastMessage');
    if (el && msg) {
        msg.innerText = message;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 3000);
    }
}
