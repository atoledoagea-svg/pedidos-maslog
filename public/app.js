/**
 * PedidoMasLog - Cliente Frontend (Node.js Backend)
 * ==================================================
 */

// ==========================================
// Configuración API
// ==========================================
const API_BASE = '/api';

// ==========================================
// Estado Global de la Aplicación
// ==========================================
const AppState = {
    catalogLoaded: false,
    productCount: 0,
    rows: [],
    rowIdCounter: 0,
    activeSkuInput: null,
    selectedAutocomplete: -1,
    searchTimeout: null
};

// Opciones predefinidas
const MODALITY_OPTIONS = [
    '',
    'Firme',
    'Consignación'
];


// ==========================================
// Inicialización
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    // Elementos del DOM
    const excelUpload = document.getElementById('excel-upload');
    const exportBtn = document.getElementById('export-btn');
    const clearBtn = document.getElementById('clear-btn');
    const addRowBtn = document.getElementById('add-row-btn');

    // Event Listeners
    excelUpload.addEventListener('change', handleExcelUpload);
    exportBtn.addEventListener('click', exportToExcel);
    clearBtn.addEventListener('click', clearAllRows);
    addRowBtn.addEventListener('click', () => addNewRow());

    // Cerrar autocomplete al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-dropdown') && !e.target.classList.contains('sku-input')) {
            hideAutocomplete();
        }
    });

    // Keyboard navigation para autocomplete
    document.addEventListener('keydown', handleGlobalKeydown);

    // Verificar estado del servidor y catálogo
    await checkServerStatus();

    // Cargar datos guardados localmente
    loadSavedRows();

    // Agregar primera fila si no hay ninguna
    if (AppState.rows.length === 0) {
        addNewRow();
    }

    showToast('Bienvenido! Carga tu catálogo Excel para comenzar.', 'info');
}


// ==========================================
// API Calls
// ==========================================
async function checkServerStatus() {
    try {
        const response = await fetch(`${API_BASE}/status`);
        const data = await response.json();
        
        if (data.ok && data.catalog.loaded) {
            AppState.catalogLoaded = true;
            AppState.productCount = data.catalog.productCount;
            updateCatalogStatus(true, data.catalog.productCount, data.catalog.filename);
        }
    } catch (error) {
        console.error('Error al verificar estado del servidor:', error);
        showToast('Error de conexión con el servidor', 'error');
    }
}

async function uploadCatalog(file) {
    const formData = new FormData();
    formData.append('catalog', file);

    try {
        const response = await fetch(`${API_BASE}/catalog/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.ok) {
            AppState.catalogLoaded = true;
            AppState.productCount = data.productCount;
            updateCatalogStatus(true, data.productCount, data.filename);
            showToast(`Catálogo cargado: ${data.productCount} productos`, 'success');
        } else {
            showToast(data.error || 'Error al cargar el catálogo', 'error');
        }
    } catch (error) {
        console.error('Error al subir catálogo:', error);
        showToast('Error de conexión al subir el archivo', 'error');
    }
}

async function searchProducts(query) {
    if (!query || query.length < 1) {
        return [];
    }

    try {
        const response = await fetch(`${API_BASE}/catalog/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        return data.ok ? data.products : [];
    } catch (error) {
        console.error('Error en búsqueda:', error);
        return [];
    }
}

async function getProductBySku(sku) {
    try {
        const response = await fetch(`${API_BASE}/catalog/sku/${encodeURIComponent(sku)}`);
        const data = await response.json();
        
        return data.ok ? data.product : null;
    } catch (error) {
        console.error('Error al buscar producto:', error);
        return null;
    }
}

async function exportOrderToServer(rows) {
    try {
        const response = await fetch(`${API_BASE}/order/export`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ rows })
        });

        if (response.ok) {
            // Descargar el archivo
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Obtener nombre del archivo del header
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'Pedido.xlsx';
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/);
                if (match) filename = match[1];
            }
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            showToast(`Pedido exportado: ${filename}`, 'success');
        } else {
            const data = await response.json();
            showToast(data.error || 'Error al exportar', 'error');
        }
    } catch (error) {
        console.error('Error al exportar:', error);
        showToast('Error de conexión al exportar', 'error');
    }
}

// ==========================================
// Manejo de Excel
// ==========================================
function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    uploadCatalog(file);
    event.target.value = ''; // Reset input
}

function formatPrice(value) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS'
    }).format(value || 0);
}

// ==========================================
// Gestión de Filas
// ==========================================
function addNewRow(data = {}) {
    const rowId = ++AppState.rowIdCounter;
    
    const rowData = {
        id: rowId,
        sku: data.sku || '',
        product: data.product || '',
        costoIvaUnidad: data.costoIvaUnidad || 0,
        costoIvaBulto: data.costoIvaBulto || 0,
        distIvaUnidad: data.distIvaUnidad || 0,
        distIvaBulto: data.distIvaBulto || 0,
        pdvIvaUnidad: data.pdvIvaUnidad || 0,
        pdvIvaBulto: data.pdvIvaBulto || 0,
        pvpSugeridoBulto: data.pvpSugeridoBulto || 0,
        pvpSugeridoUnidad: data.pvpSugeridoUnidad || 0,
        quantity: data.quantity || 1,
        modality: data.modality || '',
        observation: data.observation || '',
        agent: data.agent || '',
        location: data.location || '',
        pdv: data.pdv || ''
    };

    AppState.rows.push(rowData);
    renderRow(rowData);
    updateTotals();
    saveRowsToStorage();
    
    // Focus en el input de SKU de la nueva fila
    setTimeout(() => {
        const skuInput = document.querySelector(`[data-row-id="${rowId}"] .sku-input`);
        if (skuInput) skuInput.focus();
    }, 50);
}

function renderRow(rowData) {
    const tbody = document.getElementById('spreadsheet-body');
    const rowIndex = AppState.rows.findIndex(r => r.id === rowData.id) + 1;
    
    const tr = document.createElement('tr');
    tr.setAttribute('data-row-id', rowData.id);
    
    tr.innerHTML = `
        <td class="row-num">${rowIndex}</td>
        <td>
            <input type="text" 
                   class="sku-input" 
                   value="${escapeHtml(rowData.sku)}" 
                   placeholder="SKU..."
                   data-field="sku"
                   autocomplete="off">
        </td>
        <td>
            <div class="readonly-cell product-cell">${escapeHtml(rowData.product) || '-'}</div>
        </td>
        <td>
            <div class="readonly-cell price-costo">${rowData.costoIvaUnidad ? formatPrice(rowData.costoIvaUnidad) : '-'}</div>
        </td>
        <td>
            <div class="readonly-cell price-costo">${rowData.costoIvaBulto ? formatPrice(rowData.costoIvaBulto) : '-'}</div>
        </td>
        <td>
            <div class="readonly-cell price-dist">${rowData.distIvaUnidad ? formatPrice(rowData.distIvaUnidad) : '-'}</div>
        </td>
        <td>
            <div class="readonly-cell price-dist">${rowData.distIvaBulto ? formatPrice(rowData.distIvaBulto) : '-'}</div>
        </td>
        <td>
            <div class="readonly-cell price-pdv">${rowData.pdvIvaUnidad ? formatPrice(rowData.pdvIvaUnidad) : '-'}</div>
        </td>
        <td>
            <div class="readonly-cell price-pdv">${rowData.pdvIvaBulto ? formatPrice(rowData.pdvIvaBulto) : '-'}</div>
        </td>
        <td>
            <div class="readonly-cell price-pvp">${rowData.pvpSugeridoBulto ? formatPrice(rowData.pvpSugeridoBulto) : '-'}</div>
        </td>
        <td>
            <div class="readonly-cell price-pvp">${rowData.pvpSugeridoUnidad ? formatPrice(rowData.pvpSugeridoUnidad) : '-'}</div>
        </td>
        <td>
            <input type="number" 
                   class="qty-input" 
                   value="${rowData.quantity}" 
                   min="1" 
                   data-field="quantity">
        </td>
        <td>
            <div class="readonly-cell subtotal-cell">${formatPrice(rowData.pdvIvaUnidad * rowData.quantity)}</div>
        </td>
        <td>
            <select data-field="modality">
                ${MODALITY_OPTIONS.map(opt => 
                    `<option value="${opt}" ${rowData.modality === opt ? 'selected' : ''}>${opt || 'Seleccionar...'}</option>`
                ).join('')}
            </select>
        </td>
        <td>
            <input type="text" 
                   value="${escapeHtml(rowData.observation)}" 
                   placeholder="Obs..."
                   data-field="observation">
        </td>
        <td>
            <input type="text" 
                   value="${escapeHtml(rowData.agent)}" 
                   placeholder="Agente..."
                   data-field="agent">
        </td>
        <td>
            <input type="text" 
                   value="${escapeHtml(rowData.location)}" 
                   placeholder="Localidad..."
                   data-field="location">
        </td>
        <td>
            <input type="text" 
                   value="${escapeHtml(rowData.pdv)}" 
                   placeholder="PDV..."
                   data-field="pdv">
        </td>
        <td>
            <div class="action-cell">
                <button class="btn-duplicate-row" title="Duplicar fila">📋</button>
                <button class="btn-delete-row" title="Eliminar fila">🗑️</button>
            </div>
        </td>
    `;

    // Event listeners para los inputs
    const skuInput = tr.querySelector('.sku-input');
    skuInput.addEventListener('input', (e) => handleSkuInput(e, rowData.id));
    skuInput.addEventListener('focus', (e) => handleSkuFocus(e, rowData.id));
    skuInput.addEventListener('keydown', (e) => handleSkuKeydown(e, rowData.id));

    // Listener para cantidad
    const qtyInput = tr.querySelector('.qty-input');
    qtyInput.addEventListener('input', (e) => {
        updateRowField(rowData.id, 'quantity', parseInt(e.target.value) || 1);
    });

    // Listeners para otros campos
    tr.querySelectorAll('input:not(.sku-input):not(.qty-input), select').forEach(input => {
        input.addEventListener('change', (e) => {
            updateRowField(rowData.id, e.target.dataset.field, e.target.value);
        });
    });

    // Listener para duplicar
    tr.querySelector('.btn-duplicate-row').addEventListener('click', () => duplicateRow(rowData.id));

    // Listener para eliminar
    tr.querySelector('.btn-delete-row').addEventListener('click', () => deleteRow(rowData.id));

    tbody.appendChild(tr);
}

// ==========================================
// Duplicar Fila
// ==========================================
function duplicateRow(rowId) {
    const row = AppState.rows.find(r => r.id === rowId);
    if (!row) return;

    // Crear copia de los datos (sin el id)
    const newRowData = {
        sku: row.sku,
        product: row.product,
        costoIvaUnidad: row.costoIvaUnidad,
        costoIvaBulto: row.costoIvaBulto,
        distIvaUnidad: row.distIvaUnidad,
        distIvaBulto: row.distIvaBulto,
        pdvIvaUnidad: row.pdvIvaUnidad,
        pdvIvaBulto: row.pdvIvaBulto,
        pvpSugeridoBulto: row.pvpSugeridoBulto,
        pvpSugeridoUnidad: row.pvpSugeridoUnidad,
        quantity: row.quantity,
        modality: row.modality,
        observation: row.observation,
        agent: row.agent,
        location: row.location,
        pdv: row.pdv
    };

    addNewRow(newRowData);
    showToast('Fila duplicada', 'success');
}

function updateRowField(rowId, field, value) {
    const row = AppState.rows.find(r => r.id === rowId);
    if (!row) return;

    row[field] = value;
    
    // Si cambió la cantidad, actualizar subtotal
    if (field === 'quantity') {
        updateRowSubtotal(rowId);
    }

    updateTotals();
    saveRowsToStorage();
}

function updateRowSubtotal(rowId) {
    const row = AppState.rows.find(r => r.id === rowId);
    if (!row) return;

    const tr = document.querySelector(`[data-row-id="${rowId}"]`);
    if (!tr) return;

    const subtotal = row.pdvIvaUnidad * row.quantity;
    tr.querySelector('.subtotal-cell').textContent = formatPrice(subtotal);
}

function updateRowDisplay(rowId) {
    const row = AppState.rows.find(r => r.id === rowId);
    if (!row) return;

    const tr = document.querySelector(`[data-row-id="${rowId}"]`);
    if (!tr) return;

    tr.querySelector('.product-cell').textContent = row.product || '-';
    
    // Actualizar todos los precios
    const priceCostos = tr.querySelectorAll('.price-costo');
    const priceDists = tr.querySelectorAll('.price-dist');
    const pricePdvs = tr.querySelectorAll('.price-pdv');
    const pricePvps = tr.querySelectorAll('.price-pvp');
    
    if (priceCostos[0]) priceCostos[0].textContent = row.costoIvaUnidad ? formatPrice(row.costoIvaUnidad) : '-';
    if (priceCostos[1]) priceCostos[1].textContent = row.costoIvaBulto ? formatPrice(row.costoIvaBulto) : '-';
    if (priceDists[0]) priceDists[0].textContent = row.distIvaUnidad ? formatPrice(row.distIvaUnidad) : '-';
    if (priceDists[1]) priceDists[1].textContent = row.distIvaBulto ? formatPrice(row.distIvaBulto) : '-';
    if (pricePdvs[0]) pricePdvs[0].textContent = row.pdvIvaUnidad ? formatPrice(row.pdvIvaUnidad) : '-';
    if (pricePdvs[1]) pricePdvs[1].textContent = row.pdvIvaBulto ? formatPrice(row.pdvIvaBulto) : '-';
    if (pricePvps[0]) pricePvps[0].textContent = row.pvpSugeridoBulto ? formatPrice(row.pvpSugeridoBulto) : '-';
    if (pricePvps[1]) pricePvps[1].textContent = row.pvpSugeridoUnidad ? formatPrice(row.pvpSugeridoUnidad) : '-';
    
    tr.querySelector('.subtotal-cell').textContent = formatPrice(row.pdvIvaUnidad * row.quantity);

    // Animación de encontrado
    tr.classList.add('row-found');
    setTimeout(() => tr.classList.remove('row-found'), 600);
}

function deleteRow(rowId) {
    const index = AppState.rows.findIndex(r => r.id === rowId);
    if (index === -1) return;

    AppState.rows.splice(index, 1);
    
    const tr = document.querySelector(`[data-row-id="${rowId}"]`);
    if (tr) {
        tr.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => {
            tr.remove();
            renumberRows();
            updateTotals();
        }, 200);
    }

    saveRowsToStorage();

    // Asegurar que siempre hay al menos una fila
    if (AppState.rows.length === 0) {
        addNewRow();
    }
}

function renumberRows() {
    const rows = document.querySelectorAll('#spreadsheet-body tr');
    rows.forEach((tr, index) => {
        tr.querySelector('.row-num').textContent = index + 1;
    });
}

function clearAllRows() {
    if (!confirm('¿Estás seguro de que quieres limpiar todos los productos del pedido?')) return;

    AppState.rows = [];
    document.getElementById('spreadsheet-body').innerHTML = '';
    addNewRow();
    updateTotals();
    saveRowsToStorage();
    showToast('Pedido limpiado', 'info');
}

// ==========================================
// Autocompletado de SKU
// ==========================================
async function handleSkuInput(event, rowId) {
    const value = event.target.value.toUpperCase();
    AppState.activeSkuInput = { element: event.target, rowId };

    // Actualizar el campo SKU en los datos
    updateRowField(rowId, 'sku', value);

    // Debounce para la búsqueda
    if (AppState.searchTimeout) {
        clearTimeout(AppState.searchTimeout);
    }

    if (value.length >= 1 && AppState.catalogLoaded) {
        AppState.searchTimeout = setTimeout(async () => {
            const matches = await searchProducts(value);
            showAutocomplete(matches, event.target);
        }, 150); // 150ms debounce
    } else {
        hideAutocomplete();
    }
}

function handleSkuFocus(event, rowId) {
    AppState.activeSkuInput = { element: event.target, rowId };
}

async function handleSkuKeydown(event, rowId) {
    const dropdown = document.getElementById('autocomplete-dropdown');
    const items = dropdown.querySelectorAll('.autocomplete-item');

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            AppState.selectedAutocomplete = Math.min(
                AppState.selectedAutocomplete + 1,
                items.length - 1
            );
            updateAutocompleteSelection(items);
            break;

        case 'ArrowUp':
            event.preventDefault();
            AppState.selectedAutocomplete = Math.max(
                AppState.selectedAutocomplete - 1,
                0
            );
            updateAutocompleteSelection(items);
            break;

        case 'Enter':
            event.preventDefault();
            if (AppState.selectedAutocomplete >= 0 && items[AppState.selectedAutocomplete]) {
                items[AppState.selectedAutocomplete].click();
            } else if (event.target.value) {
                // Buscar coincidencia exacta
                const product = await getProductBySku(event.target.value);
                if (product) {
                    selectProduct(product, rowId);
                }
            }
            break;

        case 'Escape':
            hideAutocomplete();
            break;

        case 'Tab':
            hideAutocomplete();
            break;
    }
}

function handleGlobalKeydown(event) {
    // Tab entre celdas - comportamiento por defecto
}

function showAutocomplete(matches, inputElement) {
    const dropdown = document.getElementById('autocomplete-dropdown');
    
    if (!matches || matches.length === 0) {
        dropdown.innerHTML = '<div class="autocomplete-empty">No se encontraron productos</div>';
    } else {
        dropdown.innerHTML = matches.map((item, index) => `
            <div class="autocomplete-item" data-index="${index}">
                <span class="autocomplete-sku">${escapeHtml(item.sku)}</span>
                <span class="autocomplete-product">${escapeHtml(item.product)}</span>
                <div class="autocomplete-prices">
                    <span title="PDV c/IVA Unidad">${formatPrice(item.pdvIvaUnidad)}</span>
                </div>
            </div>
        `).join('');

        // Event listeners para selección
        dropdown.querySelectorAll('.autocomplete-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                if (AppState.activeSkuInput) {
                    selectProduct(matches[index], AppState.activeSkuInput.rowId);
                }
            });
            item.addEventListener('mouseenter', () => {
                AppState.selectedAutocomplete = index;
                updateAutocompleteSelection(dropdown.querySelectorAll('.autocomplete-item'));
            });
        });
    }

    // Posicionar el dropdown
    const rect = inputElement.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${Math.max(rect.width, 400)}px`;
    
    dropdown.classList.add('visible');
    AppState.selectedAutocomplete = -1;
}

function hideAutocomplete() {
    const dropdown = document.getElementById('autocomplete-dropdown');
    dropdown.classList.remove('visible');
    AppState.selectedAutocomplete = -1;
}

function updateAutocompleteSelection(items) {
    items.forEach((item, index) => {
        item.classList.toggle('selected', index === AppState.selectedAutocomplete);
    });
    
    // Scroll into view
    if (items[AppState.selectedAutocomplete]) {
        items[AppState.selectedAutocomplete].scrollIntoView({ block: 'nearest' });
    }
}

function selectProduct(product, rowId) {
    const row = AppState.rows.find(r => r.id === rowId);
    if (!row) return;

    // Actualizar datos
    row.sku = product.sku;
    row.product = product.product;
    row.costoIvaUnidad = product.costoIvaUnidad;
    row.costoIvaBulto = product.costoIvaBulto;
    row.distIvaUnidad = product.distIvaUnidad;
    row.distIvaBulto = product.distIvaBulto;
    row.pdvIvaUnidad = product.pdvIvaUnidad;
    row.pdvIvaBulto = product.pdvIvaBulto;
    row.pvpSugeridoBulto = product.pvpSugeridoBulto;
    row.pvpSugeridoUnidad = product.pvpSugeridoUnidad;

    // Actualizar input de SKU
    const tr = document.querySelector(`[data-row-id="${rowId}"]`);
    if (tr) {
        tr.querySelector('.sku-input').value = product.sku;
    }

    // Actualizar display
    updateRowDisplay(rowId);
    hideAutocomplete();
    updateTotals();
    saveRowsToStorage();

    // Mover focus a cantidad
    if (tr) {
        tr.querySelector('.qty-input').focus();
        tr.querySelector('.qty-input').select();
    }

    showToast(`Producto agregado: ${product.product}`, 'success');
}

// ==========================================
// Exportar a Excel
// ==========================================
async function exportToExcel() {
    const validRows = AppState.rows.filter(row => row.sku && row.product);
    
    if (validRows.length === 0) {
        showToast('No hay productos para exportar', 'error');
        return;
    }

    await exportOrderToServer(validRows);
}

// ==========================================
// UI Updates
// ==========================================
function updateCatalogStatus(loaded, count = 0, filename = '') {
    const dot = document.getElementById('catalog-dot');
    const text = document.getElementById('catalog-status-text');
    
    if (loaded) {
        dot.classList.add('active');
        text.textContent = `Catálogo: ${count} productos`;
        if (filename) {
            text.title = `Archivo: ${filename}`;
        }
    } else {
        dot.classList.remove('active');
        text.textContent = 'Sin catálogo cargado';
    }
}

function updateTotals() {
    const rowCount = AppState.rows.filter(r => r.sku && r.product).length;
    const total = AppState.rows.reduce((sum, row) => {
        return sum + ((row.pdvIvaUnidad || 0) * row.quantity);
    }, 0);

    document.getElementById('row-count').textContent = rowCount;
    document.getElementById('total-amount').textContent = formatPrice(total);
}

// ==========================================
// Storage (Local para las filas del pedido)
// ==========================================
function saveRowsToStorage() {
    try {
        localStorage.setItem('pedidomaslog_rows', JSON.stringify(AppState.rows));
        localStorage.setItem('pedidomaslog_rowIdCounter', AppState.rowIdCounter);
    } catch (e) {
        console.warn('Error guardando en localStorage:', e);
    }
}

function loadSavedRows() {
    try {
        const rows = localStorage.getItem('pedidomaslog_rows');
        const counter = localStorage.getItem('pedidomaslog_rowIdCounter');

        if (rows) {
            AppState.rows = JSON.parse(rows);
            AppState.rows.forEach(row => renderRow(row));
        }

        if (counter) {
            AppState.rowIdCounter = parseInt(counter);
        }

        updateTotals();
    } catch (e) {
        console.warn('Error cargando de localStorage:', e);
    }
}

// ==========================================
// Utilidades
// ==========================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    // Auto-remove después de 4 segundos
    setTimeout(() => {
        toast.style.animation = 'toastSlide 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Animación de fadeOut para filas eliminadas
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        to {
            opacity: 0;
            transform: translateX(-20px);
        }
    }
`;
document.head.appendChild(style);

