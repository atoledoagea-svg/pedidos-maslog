/**
 * PedidoMasLog - Cliente Frontend (Híbrido: Server + Static)
 * ==========================================================
 */

// ==========================================
// Configuración
// ==========================================
const API_BASE = '/api';
let USE_SERVER = true; // Se detecta automáticamente

// ==========================================
// Estado Global de la Aplicación
// ==========================================
const AppState = {
    catalogLoaded: false,
    productCount: 0,
    catalog: [],  // Para modo estático
    rows: [],
    rowIdCounter: 0,
    activeSkuInput: null,
    selectedAutocomplete: -1,
    searchTimeout: null
};

// Mapeo de columnas del Excel (para modo estático)
const EXCEL_COLUMNS = {
    sku: ['SKU', 'CODIGO', 'SKU / CODIGO', 'SKU/CODIGO', 'COD', 'CÓDIGO'],
    product: ['PRODUCTO', 'DESCRIPCION', 'DESCRIPCIÓN', 'NOMBRE', 'ARTICULO'],
    costoIvaUnidad: ['COSTO C/IVA UNIDAD', 'COSTO IVA UNIDAD', 'COSTO UNIDAD'],
    costoIvaBulto: ['COSTO C/IVA BULTO', 'COSTO IVA BULTO', 'COSTO BULTO'],
    distIvaUnidad: ['DISTRIBUIDOR c/IVA UNIDAD', 'DIST c/IVA UNIDAD', 'DISTRIBUIDOR UNIDAD'],
    distIvaBulto: ['DISTRIBUIDOR c/IVA BULTO', 'DIST c/IVA BULTO', 'DISTRIBUIDOR BULTO'],
    pdvIvaUnidad: ['PDV c/IVA UNIDAD', 'PDV IVA UNIDAD', 'PDV UNIDAD'],
    pdvIvaBulto: ['PDV c/IVA BULTO', 'PDV IVA BULTO', 'PDV BULTO'],
    pvpSugeridoBulto: ['PVP Sugerido BULTO', 'PVP BULTO', 'PVP SUGERIDO BULTO'],
    pvpSugeridoUnidad: ['PVP Sugerido UNIDAD', 'PVP UNIDAD', 'PVP SUGERIDO UNIDAD']
};

// Opciones predefinidas
const MODALITY_OPTIONS = ['', 'Firme', 'Consignación'];

// ==========================================
// Inicialización
// ==========================================
document.addEventListener('DOMContentLoaded', () => initializeApp());

async function initializeApp() {
    const excelUpload = document.getElementById('excel-upload');
    const exportBtn = document.getElementById('export-btn');
    const clearBtn = document.getElementById('clear-btn');
    const addRowBtn = document.getElementById('add-row-btn');

    excelUpload.addEventListener('change', handleExcelUpload);
    exportBtn.addEventListener('click', exportToExcel);
    clearBtn.addEventListener('click', clearAllRows);
    addRowBtn.addEventListener('click', () => addNewRow());

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-dropdown') && !e.target.classList.contains('sku-input')) {
            hideAutocomplete();
        }
    });

    document.addEventListener('keydown', handleGlobalKeydown);

    // Detectar si hay servidor disponible
    await detectServerMode();

    // Cargar datos guardados
    loadSavedData();

    if (AppState.rows.length === 0) {
        addNewRow();
    }

    showToast('Bienvenido! Carga tu catálogo Excel para comenzar.', 'info');
}

// ==========================================
// Detección de modo (Server vs Static)
// ==========================================
async function detectServerMode() {
    try {
        const response = await fetch(`${API_BASE}/status`, { method: 'GET' });
        if (response.ok) {
            const data = await response.json();
            USE_SERVER = true;
            if (data.catalog?.loaded) {
                AppState.catalogLoaded = true;
                AppState.productCount = data.catalog.productCount;
                updateCatalogStatus(true, data.catalog.productCount, data.catalog.filename);
            }
            console.log('📡 Modo: Servidor Node.js');
        }
    } catch (error) {
        USE_SERVER = false;
        console.log('📦 Modo: Estático (sin servidor)');
        // Cargar catálogo guardado localmente
        loadSavedCatalog();
    }
}

// ==========================================
// Funciones de Catálogo (Híbrido)
// ==========================================
function handleExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (USE_SERVER) {
        uploadCatalogToServer(file);
    } else {
        uploadCatalogLocal(file);
    }
    event.target.value = '';
}

async function uploadCatalogToServer(file) {
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
        // Fallback a modo local
        USE_SERVER = false;
        uploadCatalogLocal(file);
    }
}

function uploadCatalogLocal(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

            if (jsonData.length === 0) {
                showToast('El archivo Excel está vacío', 'error');
                return;
            }

            AppState.catalog = processExcelData(jsonData);
            AppState.catalogLoaded = true;
            AppState.productCount = AppState.catalog.length;
            
            updateCatalogStatus(true, AppState.catalog.length, file.name);
            saveCatalogToStorage();
            showToast(`Catálogo cargado: ${AppState.catalog.length} productos`, 'success');
        } catch (error) {
            console.error('Error al leer Excel:', error);
            showToast('Error al leer el archivo Excel', 'error');
        }
    };

    reader.readAsArrayBuffer(file);
}

function processExcelData(jsonData) {
    const headers = Object.keys(jsonData[0]);
    
    const findCol = (possibleNames) => {
        for (const name of possibleNames) {
            const found = headers.find(h => 
                h.toUpperCase().trim().includes(name.toUpperCase().trim())
            );
            if (found) return found;
        }
        return null;
    };

    const cols = {
        sku: findCol(EXCEL_COLUMNS.sku),
        product: findCol(EXCEL_COLUMNS.product),
        costoIvaUnidad: findCol(EXCEL_COLUMNS.costoIvaUnidad),
        costoIvaBulto: findCol(EXCEL_COLUMNS.costoIvaBulto),
        distIvaUnidad: findCol(EXCEL_COLUMNS.distIvaUnidad),
        distIvaBulto: findCol(EXCEL_COLUMNS.distIvaBulto),
        pdvIvaUnidad: findCol(EXCEL_COLUMNS.pdvIvaUnidad),
        pdvIvaBulto: findCol(EXCEL_COLUMNS.pdvIvaBulto),
        pvpSugeridoBulto: findCol(EXCEL_COLUMNS.pvpSugeridoBulto),
        pvpSugeridoUnidad: findCol(EXCEL_COLUMNS.pvpSugeridoUnidad)
    };

    return jsonData.map(row => ({
        sku: String(row[cols.sku] || '').trim(),
        product: String(row[cols.product] || '').trim(),
        costoIvaUnidad: parsePrice(row[cols.costoIvaUnidad]),
        costoIvaBulto: parsePrice(row[cols.costoIvaBulto]),
        distIvaUnidad: parsePrice(row[cols.distIvaUnidad]),
        distIvaBulto: parsePrice(row[cols.distIvaBulto]),
        pdvIvaUnidad: parsePrice(row[cols.pdvIvaUnidad]),
        pdvIvaBulto: parsePrice(row[cols.pdvIvaBulto]),
        pvpSugeridoBulto: parsePrice(row[cols.pvpSugeridoBulto]),
        pvpSugeridoUnidad: parsePrice(row[cols.pvpSugeridoUnidad])
    })).filter(item => item.sku);
}

function parsePrice(value) {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    return parseFloat(String(value).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
}

// ==========================================
// Búsqueda de Productos (Híbrido)
// ==========================================
async function searchProducts(query) {
    if (!query || query.length < 1) return [];

    if (USE_SERVER) {
        try {
            const response = await fetch(`${API_BASE}/catalog/search?q=${encodeURIComponent(query)}`);
            const data = await response.json();
            return data.ok ? data.products : [];
        } catch (error) {
            USE_SERVER = false;
            return searchProductsLocal(query);
        }
    } else {
        return searchProductsLocal(query);
    }
}

function searchProductsLocal(query) {
    const q = query.toUpperCase();
    return AppState.catalog.filter(item =>
        item.sku.toUpperCase().includes(q) ||
        item.product.toUpperCase().includes(q)
    ).slice(0, 15);
}

async function getProductBySku(sku) {
    if (USE_SERVER) {
        try {
            const response = await fetch(`${API_BASE}/catalog/sku/${encodeURIComponent(sku)}`);
            const data = await response.json();
            return data.ok ? data.product : null;
        } catch (error) {
            USE_SERVER = false;
            return getProductBySkuLocal(sku);
        }
    } else {
        return getProductBySkuLocal(sku);
    }
}

function getProductBySkuLocal(sku) {
    return AppState.catalog.find(item => item.sku.toUpperCase() === sku.toUpperCase()) || null;
}

// ==========================================
// Exportar a Excel (Híbrido)
// ==========================================
async function exportToExcel() {
    const validRows = AppState.rows.filter(row => row.sku && row.product);
    
    if (validRows.length === 0) {
        showToast('No hay productos para exportar', 'error');
        return;
    }

    if (USE_SERVER) {
        await exportToServer(validRows);
    } else {
        exportToExcelLocal(validRows);
    }
}

async function exportToServer(rows) {
    try {
        const response = await fetch(`${API_BASE}/order/export`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows })
        });

        if (response.ok) {
            const blob = await response.blob();
            downloadBlob(blob, getExportFilename());
            showToast('Pedido exportado', 'success');
        } else {
            throw new Error('Server error');
        }
    } catch (error) {
        USE_SERVER = false;
        exportToExcelLocal(rows);
    }
}

function exportToExcelLocal(rows) {
    const exportData = rows.map(row => ({
        'SKU / CÓDIGO': row.sku,
        'PRODUCTO': row.product,
        'CANTIDAD': row.quantity,
        'MODALIDAD': row.modality,
        'OBSERVACIÓN': row.observation,
        'AGENTE': row.agent,
        'LOCALIDAD': row.location,
        'PDV': row.pdv,
        'COSTO C/IVA UNIDAD': row.costoIvaUnidad || 0,
        'COSTO C/IVA BULTO': row.costoIvaBulto || 0,
        'DIST. c/IVA UNIDAD': row.distIvaUnidad || 0,
        'DIST. c/IVA BULTO': row.distIvaBulto || 0,
        'PDV c/IVA UNIDAD': row.pdvIvaUnidad || 0,
        'PDV c/IVA BULTO': row.pdvIvaBulto || 0,
        'PVP Sugerido BULTO': row.pvpSugeridoBulto || 0,
        'PVP Sugerido UNIDAD': row.pvpSugeridoUnidad || 0,
        'SUBTOTAL': (row.pdvIvaUnidad || 0) * row.quantity
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pedido');

    XLSX.writeFile(wb, getExportFilename());
    showToast('Pedido exportado', 'success');
}

function getExportFilename() {
    const d = new Date();
    return `Pedido_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}.xlsx`;
}

function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
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
        <td><input type="text" class="sku-input" value="${escapeHtml(rowData.sku)}" placeholder="SKU..." data-field="sku" autocomplete="off"></td>
        <td><div class="readonly-cell product-cell">${escapeHtml(rowData.product) || '-'}</div></td>
        <td><input type="number" class="qty-input" value="${rowData.quantity}" min="1" data-field="quantity"></td>
        <td><select data-field="modality">${MODALITY_OPTIONS.map(opt => `<option value="${opt}" ${rowData.modality === opt ? 'selected' : ''}>${opt || 'Seleccionar...'}</option>`).join('')}</select></td>
        <td><input type="text" value="${escapeHtml(rowData.observation)}" placeholder="Obs..." data-field="observation"></td>
        <td><input type="text" value="${escapeHtml(rowData.agent)}" placeholder="Agente..." data-field="agent"></td>
        <td><input type="text" value="${escapeHtml(rowData.location)}" placeholder="Localidad..." data-field="location"></td>
        <td><input type="text" value="${escapeHtml(rowData.pdv)}" placeholder="PDV..." data-field="pdv"></td>
        <td><div class="readonly-cell price-costo">${rowData.costoIvaUnidad ? formatPrice(rowData.costoIvaUnidad) : '-'}</div></td>
        <td><div class="readonly-cell price-costo">${rowData.costoIvaBulto ? formatPrice(rowData.costoIvaBulto) : '-'}</div></td>
        <td><div class="readonly-cell price-dist">${rowData.distIvaUnidad ? formatPrice(rowData.distIvaUnidad) : '-'}</div></td>
        <td><div class="readonly-cell price-dist">${rowData.distIvaBulto ? formatPrice(rowData.distIvaBulto) : '-'}</div></td>
        <td><div class="readonly-cell price-pdv">${rowData.pdvIvaUnidad ? formatPrice(rowData.pdvIvaUnidad) : '-'}</div></td>
        <td><div class="readonly-cell price-pdv">${rowData.pdvIvaBulto ? formatPrice(rowData.pdvIvaBulto) : '-'}</div></td>
        <td><div class="readonly-cell price-pvp">${rowData.pvpSugeridoBulto ? formatPrice(rowData.pvpSugeridoBulto) : '-'}</div></td>
        <td><div class="readonly-cell price-pvp">${rowData.pvpSugeridoUnidad ? formatPrice(rowData.pvpSugeridoUnidad) : '-'}</div></td>
        <td><div class="readonly-cell subtotal-cell">${formatPrice(rowData.pdvIvaUnidad * rowData.quantity)}</div></td>
        <td><div class="action-cell"><button class="btn-duplicate-row" title="Duplicar">📋</button><button class="btn-delete-row" title="Eliminar">🗑️</button></div></td>
    `;

    const skuInput = tr.querySelector('.sku-input');
    skuInput.addEventListener('input', (e) => handleSkuInput(e, rowData.id));
    skuInput.addEventListener('focus', (e) => handleSkuFocus(e, rowData.id));
    skuInput.addEventListener('keydown', (e) => handleSkuKeydown(e, rowData.id));

    tr.querySelector('.qty-input').addEventListener('input', (e) => {
        updateRowField(rowData.id, 'quantity', parseInt(e.target.value) || 1);
    });

    tr.querySelectorAll('input:not(.sku-input):not(.qty-input), select').forEach(input => {
        input.addEventListener('change', (e) => updateRowField(rowData.id, e.target.dataset.field, e.target.value));
    });

    tr.querySelector('.btn-duplicate-row').addEventListener('click', () => duplicateRow(rowData.id));
    tr.querySelector('.btn-delete-row').addEventListener('click', () => deleteRow(rowData.id));

    tbody.appendChild(tr);
}

function duplicateRow(rowId) {
    const row = AppState.rows.find(r => r.id === rowId);
    if (!row) return;
    const { id, ...rowData } = row;
    addNewRow(rowData);
    showToast('Fila duplicada', 'success');
}

function updateRowField(rowId, field, value) {
    const row = AppState.rows.find(r => r.id === rowId);
    if (!row) return;
    row[field] = value;
    if (field === 'quantity') updateRowSubtotal(rowId);
    updateTotals();
    saveRowsToStorage();
}

function updateRowSubtotal(rowId) {
    const row = AppState.rows.find(r => r.id === rowId);
    const tr = document.querySelector(`[data-row-id="${rowId}"]`);
    if (!row || !tr) return;
    tr.querySelector('.subtotal-cell').textContent = formatPrice(row.pdvIvaUnidad * row.quantity);
}

function updateRowDisplay(rowId) {
    const row = AppState.rows.find(r => r.id === rowId);
    const tr = document.querySelector(`[data-row-id="${rowId}"]`);
    if (!row || !tr) return;

    tr.querySelector('.product-cell').textContent = row.product || '-';
    
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
    if (AppState.rows.length === 0) addNewRow();
}

function renumberRows() {
    document.querySelectorAll('#spreadsheet-body tr').forEach((tr, index) => {
        tr.querySelector('.row-num').textContent = index + 1;
    });
}

function clearAllRows() {
    if (!confirm('¿Limpiar todos los productos del pedido?')) return;
    AppState.rows = [];
    document.getElementById('spreadsheet-body').innerHTML = '';
    addNewRow();
    updateTotals();
    saveRowsToStorage();
    showToast('Pedido limpiado', 'info');
}

// ==========================================
// Autocompletado
// ==========================================
async function handleSkuInput(event, rowId) {
    const value = event.target.value.toUpperCase();
    AppState.activeSkuInput = { element: event.target, rowId };
    updateRowField(rowId, 'sku', value);

    if (AppState.searchTimeout) clearTimeout(AppState.searchTimeout);

    if (value.length >= 1 && AppState.catalogLoaded) {
        AppState.searchTimeout = setTimeout(async () => {
            const matches = await searchProducts(value);
            showAutocomplete(matches, event.target);
        }, 150);
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
            AppState.selectedAutocomplete = Math.min(AppState.selectedAutocomplete + 1, items.length - 1);
            updateAutocompleteSelection(items);
            break;
        case 'ArrowUp':
            event.preventDefault();
            AppState.selectedAutocomplete = Math.max(AppState.selectedAutocomplete - 1, 0);
            updateAutocompleteSelection(items);
            break;
        case 'Enter':
            event.preventDefault();
            if (AppState.selectedAutocomplete >= 0 && items[AppState.selectedAutocomplete]) {
                items[AppState.selectedAutocomplete].click();
            } else if (event.target.value) {
                const product = await getProductBySku(event.target.value);
                if (product) selectProduct(product, rowId);
            }
            break;
        case 'Escape':
        case 'Tab':
            hideAutocomplete();
            break;
    }
}

function handleGlobalKeydown(event) {}

function showAutocomplete(matches, inputElement) {
    const dropdown = document.getElementById('autocomplete-dropdown');
    
    if (!matches || matches.length === 0) {
        dropdown.innerHTML = '<div class="autocomplete-empty">No se encontraron productos</div>';
    } else {
        dropdown.innerHTML = matches.map((item, index) => `
            <div class="autocomplete-item" data-index="${index}">
                <span class="autocomplete-sku">${escapeHtml(item.sku)}</span>
                <span class="autocomplete-product">${escapeHtml(item.product)}</span>
                <div class="autocomplete-prices"><span>${formatPrice(item.pdvIvaUnidad)}</span></div>
            </div>
        `).join('');

        dropdown.querySelectorAll('.autocomplete-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                if (AppState.activeSkuInput) selectProduct(matches[index], AppState.activeSkuInput.rowId);
            });
            item.addEventListener('mouseenter', () => {
                AppState.selectedAutocomplete = index;
                updateAutocompleteSelection(dropdown.querySelectorAll('.autocomplete-item'));
            });
        });
    }

    const rect = inputElement.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${Math.max(rect.width, 400)}px`;
    dropdown.classList.add('visible');
    AppState.selectedAutocomplete = -1;
}

function hideAutocomplete() {
    document.getElementById('autocomplete-dropdown').classList.remove('visible');
    AppState.selectedAutocomplete = -1;
}

function updateAutocompleteSelection(items) {
    items.forEach((item, index) => item.classList.toggle('selected', index === AppState.selectedAutocomplete));
    if (items[AppState.selectedAutocomplete]) items[AppState.selectedAutocomplete].scrollIntoView({ block: 'nearest' });
}

function selectProduct(product, rowId) {
    const row = AppState.rows.find(r => r.id === rowId);
    if (!row) return;

    Object.assign(row, {
        sku: product.sku,
        product: product.product,
        costoIvaUnidad: product.costoIvaUnidad,
        costoIvaBulto: product.costoIvaBulto,
        distIvaUnidad: product.distIvaUnidad,
        distIvaBulto: product.distIvaBulto,
        pdvIvaUnidad: product.pdvIvaUnidad,
        pdvIvaBulto: product.pdvIvaBulto,
        pvpSugeridoBulto: product.pvpSugeridoBulto,
        pvpSugeridoUnidad: product.pvpSugeridoUnidad
    });

    const tr = document.querySelector(`[data-row-id="${rowId}"]`);
    if (tr) tr.querySelector('.sku-input').value = product.sku;

    updateRowDisplay(rowId);
    hideAutocomplete();
    updateTotals();
    saveRowsToStorage();

    if (tr) {
        tr.querySelector('.qty-input').focus();
        tr.querySelector('.qty-input').select();
    }
    showToast(`Producto agregado: ${product.product}`, 'success');
}

// ==========================================
// UI & Utils
// ==========================================
function formatPrice(value) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value || 0);
}

function updateCatalogStatus(loaded, count = 0, filename = '') {
    const dot = document.getElementById('catalog-dot');
    const text = document.getElementById('catalog-status-text');
    if (loaded) {
        dot.classList.add('active');
        text.textContent = `Catálogo: ${count} productos`;
        if (filename) text.title = `Archivo: ${filename}`;
    } else {
        dot.classList.remove('active');
        text.textContent = 'Sin catálogo cargado';
    }
}

function updateTotals() {
    const rowCount = AppState.rows.filter(r => r.sku && r.product).length;
    const total = AppState.rows.reduce((sum, row) => sum + ((row.pdvIvaUnidad || 0) * row.quantity), 0);
    document.getElementById('row-count').textContent = rowCount;
    document.getElementById('total-amount').textContent = formatPrice(total);
}

// ==========================================
// Storage
// ==========================================
function saveRowsToStorage() {
    try {
        localStorage.setItem('pedidomaslog_rows', JSON.stringify(AppState.rows));
        localStorage.setItem('pedidomaslog_rowIdCounter', AppState.rowIdCounter);
    } catch (e) {}
}

function saveCatalogToStorage() {
    try {
        localStorage.setItem('pedidomaslog_catalog', JSON.stringify(AppState.catalog));
    } catch (e) {}
}

function loadSavedData() {
    try {
        const rows = localStorage.getItem('pedidomaslog_rows');
        const counter = localStorage.getItem('pedidomaslog_rowIdCounter');
        if (rows) {
            AppState.rows = JSON.parse(rows);
            AppState.rows.forEach(row => renderRow(row));
        }
        if (counter) AppState.rowIdCounter = parseInt(counter);
        updateTotals();
    } catch (e) {}
}

function loadSavedCatalog() {
    try {
        const catalog = localStorage.getItem('pedidomaslog_catalog');
        if (catalog) {
            AppState.catalog = JSON.parse(catalog);
            AppState.catalogLoaded = true;
            AppState.productCount = AppState.catalog.length;
            updateCatalogStatus(true, AppState.catalog.length);
        }
    } catch (e) {}
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-message">${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastSlide 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// CSS Animation
const style = document.createElement('style');
style.textContent = `@keyframes fadeOut { to { opacity: 0; transform: translateX(-20px); } }`;
document.head.appendChild(style);
