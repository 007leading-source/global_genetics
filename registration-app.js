/**
 * Global Genetics MX - Customer Registration Form
 * Standalone web form for new customer registration
 * Connected to Supabase backend
 */

// Configuration
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';
const COMPANY_LOGO = import.meta.env.VITE_APP_LOGO || 'https://via.placeholder.com/200';

// Initialize Supabase
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initForm();
});

function initForm() {
    // Set company logo
    const logoImg = document.getElementById('companyLogo');
    if (logoImg) logoImg.src = COMPANY_LOGO;

    // Get email from URL parameter if available
    const urlParams = new URLSearchParams(window.location.search);
    const emailParam = urlParams.get('email');
    if (emailParam) {
        document.getElementById('email').value = decodeURIComponent(emailParam);
    }

    // Add form submission handler
    document.getElementById('registrationForm').addEventListener('submit', handleFormSubmit);
}

// ============================================================================
// FORM SUBMISSION
// ============================================================================

async function handleFormSubmit(e) {
    e.preventDefault();

    // Validate required fields
    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const cfdiUsage = document.getElementById('cfdiUsage').value;
    const terms = document.getElementById('terms').checked;

    if (!fullName) {
        showToast('Por favor ingresa tu nombre completo', 'error');
        return;
    }

    if (!email) {
        showToast('Por favor ingresa tu correo electrónico', 'error');
        return;
    }

    if (!cfdiUsage) {
        showToast('Por favor selecciona el uso de CFDI', 'error');
        return;
    }

    if (!terms) {
        showToast('Debes aceptar los términos y condiciones', 'error');
        return;
    }

    // Show loading
    showLoading(true);

    try {
        // Prepare customer data
        const customerData = {
            customer_id: `CUST-${Date.now()}`,
            name: fullName,
            email: email,
            phone: document.getElementById('phone').value || null,
            rfc: document.getElementById('rfc').value || null,
            address: document.getElementById('address').value || null,
            city: document.getElementById('city').value || null,
            state: document.getElementById('state').value || null,
            postal_code: document.getElementById('postalCode').value || null,
            cfdi_usage: cfdiUsage,
            notes: document.getElementById('notes').value || null
        };

        // Insert into Supabase
        const { data, error } = await supabase
            .from('customers')
            .insert([customerData])
            .select();

        if (error) throw error;

        // Show success modal
        showSuccessModal();

        // Clear form
        document.getElementById('registrationForm').reset();

    } catch (error) {
        console.error('Registration error:', error);
        
        // Check if error is due to duplicate email
        if (error.message && error.message.includes('duplicate')) {
            showToast('Este correo electrónico ya está registrado', 'error');
        } else {
            showToast('Error al completar el registro. Por favor intenta de nuevo.', 'error');
        }
    } finally {
        showLoading(false);
    }
}

// ============================================================================
// UI FUNCTIONS
// ============================================================================

function showSuccessModal() {
    const modal = document.getElementById('successModal');
    modal.classList.remove('hidden');
}

function closeSuccessModal() {
    const modal = document.getElementById('successModal');
    modal.classList.add('hidden');
}

function goToThankYou() {
    // Redirect to thank you page
    window.location.href = 'registration-thankyou.html';
}

function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.toggle('hidden', !show);
    }
}

function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'error' ? '#ef4444' : '#22c55e'};
        color: white;
        padding: 14px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 2500;
        font-weight: 500;
        animation: slideUp 0.3s ease;
        max-width: 90%;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideUp {
        from { transform: translateX(-50%) translateY(100%); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
    }
    @keyframes slideDown {
        from { transform: translateX(-50%) translateY(0); opacity: 1; }
        to { transform: translateX(-50%) translateY(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);
