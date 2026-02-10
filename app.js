/**
 * PedidoMasLog - Gestión de Pedidos tipo Spreadsheet
 * ===================================================
 */

// ==========================================
// Estado Global de la Aplicación
// ==========================================
const AppState = {
    catalog: [],           // Productos cargados del Excel
    rows: [],              // Filas del pedido actual
    rowIdCounter: 0,       // Contador para IDs únicos
    activeSkuInput: null,  // Input SKU actualmente activo
    selectedAutocomplete: -1 // Índice seleccionado en autocomplete
};

// Mapeo de columnas del Excel (ajustar según tu archivo)
const EXCEL_COLUMNS = {
    sku: ['SKU', 'CODIGO', 'SKU / CODIGO', 'SKU/CODIGO', 'COD', 'CÓDIGO'],
    product: ['PRODUCTO', 'DESCRIPCION', 'DESCRIPCIÓN', 'NOMBRE', 'ARTICULO'],
    distPrice: ['DISTRIBUIDOR c/IVA UNIDAD', 'DIST c/IVA', 'PRECIO DIST', 'DISTRIBUIDOR', 'PRECIO DISTRIBUIDOR'],
    pdvPrice: ['PDV c/IVA UNIDAD', 'PDV c/IVA', 'PRECIO PDV', 'PDV', 'PRECIO PVP', 'PVP']
};

// Opciones predefinidas
const MODALITY_OPTIONS = [
    '',
    'Contado',
    'Crédito 15 días',
    'Crédito 30 días',
    'Crédito 45 días',
    'Consignación'
];

const AGENT_OPTIONS = [
    '',
    'Agente 1',
    'Agente 2',
    'Agente 3',
    'Agente 4',
    'Agente 5'
];

// ==========================================
// Inicialización
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
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

    // Cargar datos guardados
    loadSavedData();

    // Agregar primera fila si no hay ninguna
    if (AppState.rows.length === 0) {
        addNewRow();
    }

    showToast('Bienvenido! Carga tu catálogo Excel para comenzar.', 'info');
}

// ==========================================
// Manejo de Excel
// ==========================================
function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            // Tomar la primera hoja
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
            
            if (jsonData.length === 0) {
                showToast('El archivo Excel está vacío', 'error');
                return;
            }

            // Procesar y normalizar datos
            AppState.catalog = processExcelData(jsonData);
            
            // Actualizar UI
            updateCatalogStatus(true, AppState.catalog.length);
            saveDataToStorage();
            
            showToast(`Catálogo cargado: ${AppState.catalog.length} productos`, 'success');
            
        } catch (error) {
            console.error('Error al leer Excel:', error);
            showToast('Error al leer el archivo Excel', 'error');
        }
    };

    reader.readAsArrayBuffer(file);
    event.target.value = ''; // Reset input
}

function processExcelData(jsonData) {
    const headers = Object.keys(jsonData[0]);
    
    // Encontrar las columnas correspondientes
    const skuCol = findColumn(headers, EXCEL_COLUMNS.sku);
    const productCol = findColumn(headers, EXCEL_COLUMNS.product);
    const distPriceCol = findColumn(headers, EXCEL_COLUMNS.distPrice);
    const pdvPriceCol = findColumn(headers, EXCEL_COLUMNS.pdvPrice);

    console.log('Columnas encontradas:', { skuCol, productCol, distPriceCol, pdvPriceCol });

    return jsonData.map(row => ({
        sku: normalizeValue(row[skuCol] || ''),
        product: normalizeValue(row[productCol] || ''),
        distPrice: parsePrice(row[distPriceCol]),
        pdvPrice: parsePrice(row[pdvPriceCol]),
        raw: row // Guardar datos originales por si acaso
    })).filter(item => item.sku); // Solo items con SKU
}

function findColumn(headers, possibleNames) {
    for (const name of possibleNames) {
        const found = headers.find(h => 
            h.toUpperCase().trim() === name.toUpperCase().trim() ||
            h.toUpperCase().trim().includes(name.toUpperCase().trim())
        );
        if (found) return found;
    }
    // Si no encuentra, intentar con el primer header que contenga alguna palabra clave
    for (const name of possibleNames) {
        const found = headers.find(h => 
            h.toUpperCase().includes(name.split(' ')[0].toUpperCase())
        );
        if (found) return found;
    }
    return headers[0]; // Fallback al primer header
}

function normalizeValue(value) {
    if (typeof value === 'string') {
        return value.trim();
    }
    return String(value || '').trim();
}

function parsePrice(value) {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    
    // Limpiar el string y convertir a número
    const cleaned = String(value)
        .replace(/[^0-9.,]/g, '')
        .replace(',', '.');
    
    return parseFloat(cleaned) || 0;
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
        distPrice: data.distPrice || 0,
        pdvPrice: data.pdvPrice || 0,
        quantity: data.quantity || 1,
        modality: data.modality || '',
        observation: data.observation || '',
        agent: data.agent || '',
        location: data.location || ''
    };

    AppState.rows.push(rowData);
    renderRow(rowData);
    updateTotals();
    saveDataToStorage();
    
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
                   placeholder="Ingrese SKU..."
                   data-field="sku"
                   autocomplete="off">
        </td>
        <td>
            <div class="readonly-cell product-cell">${escapeHtml(rowData.product) || '-'}</div>
        </td>
        <td>
            <div class="readonly-cell price-dist">${rowData.distPrice ? formatPrice(rowData.distPrice) : '-'}</div>
        </td>
        <td>
            <div class="readonly-cell price-pdv">${rowData.pdvPrice ? formatPrice(rowData.pdvPrice) : '-'}</div>
        </td>
        <td>
            <input type="number" 
                   class="qty-input" 
                   value="${rowData.quantity}" 
                   min="1" 
                   data-field="quantity">
        </td>
        <td>
            <div class="readonly-cell subtotal-cell">${formatPrice(rowData.pdvPrice * rowData.quantity)}</div>
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
                   placeholder="Observación..."
                   data-field="observation">
        </td>
        <td>
            <select data-field="agent">
                ${AGENT_OPTIONS.map(opt => 
                    `<option value="${opt}" ${rowData.agent === opt ? 'selected' : ''}>${opt || 'Seleccionar...'}</option>`
                ).join('')}
            </select>
        </td>
        <td>
            <input type="text" 
                   value="${escapeHtml(rowData.location)}" 
                   placeholder="Localidad..."
                   data-field="location">
        </td>
        <td>
            <div class="action-cell">
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

    // Listener para eliminar
    tr.querySelector('.btn-delete-row').addEventListener('click', () => deleteRow(rowData.id));

    tbody.appendChild(tr);
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
    saveDataToStorage();
}

function updateRowSubtotal(rowId) {
    const row = AppState.rows.find(r => r.id === rowId);
    if (!row) return;

    const tr = document.querySelector(`[data-row-id="${rowId}"]`);
    if (!tr) return;

    const subtotal = row.pdvPrice * row.quantity;
    tr.querySelector('.subtotal-cell').textContent = formatPrice(subtotal);
}

function updateRowDisplay(rowId) {
    const row = AppState.rows.find(r => r.id === rowId);
    if (!row) return;

    const tr = document.querySelector(`[data-row-id="${rowId}"]`);
    if (!tr) return;

    tr.querySelector('.product-cell').textContent = row.product || '-';
    tr.querySelector('.price-dist').textContent = row.distPrice ? formatPrice(row.distPrice) : '-';
    tr.querySelector('.price-pdv').textContent = row.pdvPrice ? formatPrice(row.pdvPrice) : '-';
    tr.querySelector('.subtotal-cell').textContent = formatPrice(row.pdvPrice * row.quantity);

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

    saveDataToStorage();

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
    saveDataToStorage();
    showToast('Pedido limpiado', 'info');
}

// ==========================================
// Autocompletado de SKU
// ==========================================
function handleSkuInput(event, rowId) {
    const value = event.target.value.toUpperCase();
    AppState.activeSkuInput = { element: event.target, rowId };

    // Buscar en el catálogo
    if (value.length >= 1 && AppState.catalog.length > 0) {
        const matches = AppState.catalog.filter(item => 
            item.sku.toUpperCase().includes(value) ||
            item.product.toUpperCase().includes(value)
        ).slice(0, 10);

        showAutocomplete(matches, event.target);
    } else {
        hideAutocomplete();
    }

    // Actualizar el campo SKU en los datos
    updateRowField(rowId, 'sku', value);
}

function handleSkuFocus(event, rowId) {
    AppState.activeSkuInput = { element: event.target, rowId };
    
    // Mostrar sugerencias si hay texto
    if (event.target.value.length >= 1 && AppState.catalog.length > 0) {
        const value = event.target.value.toUpperCase();
        const matches = AppState.catalog.filter(item => 
            item.sku.toUpperCase().includes(value) ||
            item.product.toUpperCase().includes(value)
        ).slice(0, 10);

        showAutocomplete(matches, event.target);
    }
}

function handleSkuKeydown(event, rowId) {
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
                const exactMatch = AppState.catalog.find(item => 
                    item.sku.toUpperCase() === event.target.value.toUpperCase()
                );
                if (exactMatch) {
                    selectProduct(exactMatch, rowId);
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
    // Tab entre celdas
    if (event.key === 'Tab' && !event.shiftKey) {
        // Comportamiento por defecto del tab
    }
}

function showAutocomplete(matches, inputElement) {
    const dropdown = document.getElementById('autocomplete-dropdown');
    
    if (matches.length === 0) {
        dropdown.innerHTML = '<div class="autocomplete-empty">No se encontraron productos</div>';
    } else {
        dropdown.innerHTML = matches.map((item, index) => `
            <div class="autocomplete-item" data-index="${index}">
                <span class="autocomplete-sku">${escapeHtml(item.sku)}</span>
                <span class="autocomplete-product">${escapeHtml(item.product)}</span>
                <div class="autocomplete-prices">
                    <span>${formatPrice(item.distPrice)}</span>
                    <span>${formatPrice(item.pdvPrice)}</span>
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
    row.distPrice = product.distPrice;
    row.pdvPrice = product.pdvPrice;

    // Actualizar input de SKU
    const tr = document.querySelector(`[data-row-id="${rowId}"]`);
    if (tr) {
        tr.querySelector('.sku-input').value = product.sku;
    }

    // Actualizar display
    updateRowDisplay(rowId);
    hideAutocomplete();
    updateTotals();
    saveDataToStorage();

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
function exportToExcel() {
    const validRows = AppState.rows.filter(row => row.sku && row.product);
    
    if (validRows.length === 0) {
        showToast('No hay productos para exportar', 'error');
        return;
    }

    // Preparar datos para exportar
    const exportData = validRows.map(row => ({
        'SKU / CÓDIGO': row.sku,
        'PRODUCTO': row.product,
        'DISTRIBUIDOR c/IVA': row.distPrice,
        'PDV c/IVA': row.pdvPrice,
        'CANTIDAD': row.quantity,
        'SUBTOTAL': row.pdvPrice * row.quantity,
        'MODALIDAD': row.modality,
        'OBSERVACIÓN': row.observation,
        'AGENTE': row.agent,
        'LOCALIDAD': row.location
    }));

    // Crear workbook
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pedido');

    // Ajustar anchos de columna
    ws['!cols'] = [
        { wch: 15 },  // SKU
        { wch: 40 },  // Producto
        { wch: 15 },  // Dist Price
        { wch: 15 },  // PDV Price
        { wch: 10 },  // Cantidad
        { wch: 15 },  // Subtotal
        { wch: 15 },  // Modalidad
        { wch: 25 },  // Observación
        { wch: 15 },  // Agente
        { wch: 20 }   // Localidad
    ];

    // Generar nombre de archivo con fecha
    const date = new Date();
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const filename = `Pedido_${dateStr}.xlsx`;

    // Descargar
    XLSX.writeFile(wb, filename);
    showToast(`Pedido exportado: ${filename}`, 'success');
}

// ==========================================
// UI Updates
// ==========================================
function updateCatalogStatus(loaded, count = 0) {
    const dot = document.getElementById('catalog-dot');
    const text = document.getElementById('catalog-status-text');
    
    if (loaded) {
        dot.classList.add('active');
        text.textContent = `Catálogo: ${count} productos`;
    } else {
        dot.classList.remove('active');
        text.textContent = 'Sin catálogo cargado';
    }
}

function updateTotals() {
    const rowCount = AppState.rows.filter(r => r.sku && r.product).length;
    const total = AppState.rows.reduce((sum, row) => {
        return sum + (row.pdvPrice * row.quantity);
    }, 0);

    document.getElementById('row-count').textContent = rowCount;
    document.getElementById('total-amount').textContent = formatPrice(total);
}

// ==========================================
// Storage
// ==========================================
function saveDataToStorage() {
    try {
        localStorage.setItem('pedidomaslog_catalog', JSON.stringify(AppState.catalog));
        localStorage.setItem('pedidomaslog_rows', JSON.stringify(AppState.rows));
        localStorage.setItem('pedidomaslog_rowIdCounter', AppState.rowIdCounter);
    } catch (e) {
        console.warn('Error guardando en localStorage:', e);
    }
}

function loadSavedData() {
    try {
        const catalog = localStorage.getItem('pedidomaslog_catalog');
        const rows = localStorage.getItem('pedidomaslog_rows');
        const counter = localStorage.getItem('pedidomaslog_rowIdCounter');

        if (catalog) {
            AppState.catalog = JSON.parse(catalog);
            updateCatalogStatus(true, AppState.catalog.length);
        }

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

