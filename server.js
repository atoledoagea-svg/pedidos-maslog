/**
 * PedidoMasLog - Servidor Node.js
 * ================================
 */

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// Configuración
// ==========================================

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Crear carpeta uploads si no existe
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuración de Multer para subida de archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'catalogo-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.xlsx', '.xls'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB máximo
    }
});

// ==========================================
// Estado Global (en producción usar DB)
// ==========================================
let catalogData = {
    products: [],
    loadedAt: null,
    filename: null
};

// Mapeo de columnas del Excel
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

// ==========================================
// Funciones Auxiliares
// ==========================================

function findColumn(headers, possibleNames) {
    for (const name of possibleNames) {
        const found = headers.find(h =>
            h.toUpperCase().trim() === name.toUpperCase().trim() ||
            h.toUpperCase().trim().includes(name.toUpperCase().trim())
        );
        if (found) return found;
    }
    for (const name of possibleNames) {
        const found = headers.find(h =>
            h.toUpperCase().includes(name.split(' ')[0].toUpperCase())
        );
        if (found) return found;
    }
    return null;
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
    
    const cleaned = String(value)
        .replace(/[^0-9.,]/g, '')
        .replace(',', '.');
    
    return parseFloat(cleaned) || 0;
}

function processExcelData(jsonData) {
    if (!jsonData || jsonData.length === 0) {
        return [];
    }

    const headers = Object.keys(jsonData[0]);
    
    const skuCol = findColumn(headers, EXCEL_COLUMNS.sku);
    const productCol = findColumn(headers, EXCEL_COLUMNS.product);
    const costoIvaUnidadCol = findColumn(headers, EXCEL_COLUMNS.costoIvaUnidad);
    const costoIvaBultoCol = findColumn(headers, EXCEL_COLUMNS.costoIvaBulto);
    const distIvaUnidadCol = findColumn(headers, EXCEL_COLUMNS.distIvaUnidad);
    const distIvaBultoCol = findColumn(headers, EXCEL_COLUMNS.distIvaBulto);
    const pdvIvaUnidadCol = findColumn(headers, EXCEL_COLUMNS.pdvIvaUnidad);
    const pdvIvaBultoCol = findColumn(headers, EXCEL_COLUMNS.pdvIvaBulto);
    const pvpSugeridoBultoCol = findColumn(headers, EXCEL_COLUMNS.pvpSugeridoBulto);
    const pvpSugeridoUnidadCol = findColumn(headers, EXCEL_COLUMNS.pvpSugeridoUnidad);

    console.log('📊 Columnas detectadas:', { 
        skuCol, productCol, 
        costoIvaUnidadCol, costoIvaBultoCol,
        distIvaUnidadCol, distIvaBultoCol,
        pdvIvaUnidadCol, pdvIvaBultoCol,
        pvpSugeridoBultoCol, pvpSugeridoUnidadCol
    });

    return jsonData.map(row => ({
        sku: normalizeValue(row[skuCol] || ''),
        product: normalizeValue(row[productCol] || ''),
        costoIvaUnidad: parsePrice(row[costoIvaUnidadCol]),
        costoIvaBulto: parsePrice(row[costoIvaBultoCol]),
        distIvaUnidad: parsePrice(row[distIvaUnidadCol]),
        distIvaBulto: parsePrice(row[distIvaBultoCol]),
        pdvIvaUnidad: parsePrice(row[pdvIvaUnidadCol]),
        pdvIvaBulto: parsePrice(row[pdvIvaBultoCol]),
        pvpSugeridoBulto: parsePrice(row[pvpSugeridoBultoCol]),
        pvpSugeridoUnidad: parsePrice(row[pvpSugeridoUnidadCol])
    })).filter(item => item.sku);
}

// ==========================================
// API Routes
// ==========================================

/**
 * GET /api/status
 * Estado del servidor y catálogo
 */
app.get('/api/status', (req, res) => {
    res.json({
        ok: true,
        catalog: {
            loaded: catalogData.products.length > 0,
            productCount: catalogData.products.length,
            loadedAt: catalogData.loadedAt,
            filename: catalogData.filename
        }
    });
});

/**
 * POST /api/catalog/upload
 * Subir archivo Excel de catálogo
 */
app.post('/api/catalog/upload', upload.single('catalog'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ ok: false, error: 'No se recibió ningún archivo' });
        }

        // Leer el archivo Excel
        const workbook = XLSX.readFile(req.file.path);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

        if (jsonData.length === 0) {
            return res.status(400).json({ ok: false, error: 'El archivo Excel está vacío' });
        }

        // Procesar datos
        catalogData.products = processExcelData(jsonData);
        catalogData.loadedAt = new Date().toISOString();
        catalogData.filename = req.file.originalname;

        console.log(`✅ Catálogo cargado: ${catalogData.products.length} productos`);

        // Opcional: eliminar el archivo después de procesarlo
        // fs.unlinkSync(req.file.path);

        res.json({
            ok: true,
            message: 'Catálogo cargado exitosamente',
            productCount: catalogData.products.length,
            filename: req.file.originalname
        });

    } catch (error) {
        console.error('❌ Error al procesar Excel:', error);
        res.status(500).json({ ok: false, error: 'Error al procesar el archivo Excel' });
    }
});

/**
 * GET /api/catalog/products
 * Obtener todos los productos del catálogo
 */
app.get('/api/catalog/products', (req, res) => {
    res.json({
        ok: true,
        products: catalogData.products
    });
});

/**
 * GET /api/catalog/search?q=texto
 * Buscar productos por SKU o nombre
 */
app.get('/api/catalog/search', (req, res) => {
    const query = (req.query.q || '').toUpperCase().trim();
    
    if (!query) {
        return res.json({ ok: true, products: [] });
    }

    const matches = catalogData.products.filter(item =>
        item.sku.toUpperCase().includes(query) ||
        item.product.toUpperCase().includes(query)
    ).slice(0, 15); // Limitar resultados

    res.json({
        ok: true,
        products: matches
    });
});

/**
 * GET /api/catalog/sku/:sku
 * Obtener producto por SKU exacto
 */
app.get('/api/catalog/sku/:sku', (req, res) => {
    const sku = req.params.sku.toUpperCase().trim();
    
    const product = catalogData.products.find(item =>
        item.sku.toUpperCase() === sku
    );

    if (product) {
        res.json({ ok: true, product });
    } else {
        res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    }
});

/**
 * POST /api/order/export
 * Exportar pedido a Excel
 */
app.post('/api/order/export', (req, res) => {
    try {
        const { rows } = req.body;

        if (!rows || rows.length === 0) {
            return res.status(400).json({ ok: false, error: 'No hay datos para exportar' });
        }

        // Preparar datos para el Excel
        const exportData = rows.map(row => ({
            'SKU / CÓDIGO': row.sku,
            'PRODUCTO': row.product,
            'COSTO C/IVA UNIDAD': row.costoIvaUnidad || 0,
            'COSTO C/IVA BULTO': row.costoIvaBulto || 0,
            'DIST. c/IVA UNIDAD': row.distIvaUnidad || 0,
            'DIST. c/IVA BULTO': row.distIvaBulto || 0,
            'PDV c/IVA UNIDAD': row.pdvIvaUnidad || 0,
            'PDV c/IVA BULTO': row.pdvIvaBulto || 0,
            'PVP Sugerido BULTO': row.pvpSugeridoBulto || 0,
            'PVP Sugerido UNIDAD': row.pvpSugeridoUnidad || 0,
            'CANTIDAD': row.quantity,
            'SUBTOTAL': (row.pdvIvaUnidad || 0) * row.quantity,
            'MODALIDAD': row.modality,
            'OBSERVACIÓN': row.observation,
            'AGENTE': row.agent || '',
            'LOCALIDAD': row.location || '',
            'PDV': row.pdv || ''
        }));

        // Crear workbook
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Pedido');

        // Ajustar anchos de columna
        ws['!cols'] = [
            { wch: 15 },  // SKU
            { wch: 35 },  // Producto
            { wch: 15 },  // Costo IVA Unidad
            { wch: 15 },  // Costo IVA Bulto
            { wch: 15 },  // Dist IVA Unidad
            { wch: 15 },  // Dist IVA Bulto
            { wch: 15 },  // PDV IVA Unidad
            { wch: 15 },  // PDV IVA Bulto
            { wch: 15 },  // PVP Sugerido Bulto
            { wch: 15 },  // PVP Sugerido Unidad
            { wch: 10 },  // Cantidad
            { wch: 12 },  // Subtotal
            { wch: 12 },  // Modalidad
            { wch: 20 },  // Observación
            { wch: 15 },  // Agente
            { wch: 15 },  // Localidad
            { wch: 20 }   // PDV
        ];

        // Generar buffer
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        // Enviar como descarga
        const date = new Date();
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const filename = `Pedido_${dateStr}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);

    } catch (error) {
        console.error('❌ Error al exportar:', error);
        res.status(500).json({ ok: false, error: 'Error al generar el archivo Excel' });
    }
});

/**
 * DELETE /api/catalog
 * Limpiar catálogo cargado
 */
app.delete('/api/catalog', (req, res) => {
    catalogData = {
        products: [],
        loadedAt: null,
        filename: null
    };
    
    console.log('🗑️ Catálogo limpiado');
    res.json({ ok: true, message: 'Catálogo limpiado' });
});

// ==========================================
// Manejo de errores de Multer
// ==========================================
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ ok: false, error: 'El archivo es demasiado grande (máx 10MB)' });
        }
    }
    if (error.message) {
        return res.status(400).json({ ok: false, error: error.message });
    }
    next(error);
});

// ==========================================
// Iniciar servidor (solo en desarrollo local)
// ==========================================
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════╗
║                                                ║
║   📦 PedidoMasLog Server                       ║
║                                                ║
║   🌐 Local:    http://localhost:${PORT}           ║
║                                                ║
║   API Endpoints:                               ║
║   • GET  /api/status                           ║
║   • POST /api/catalog/upload                   ║
║   • GET  /api/catalog/products                 ║
║   • GET  /api/catalog/search?q=texto           ║
║   • GET  /api/catalog/sku/:sku                 ║
║   • POST /api/order/export                     ║
║   • DELETE /api/catalog                        ║
║                                                ║
╚════════════════════════════════════════════════╝
        `);
    });
}

// Exportar para Vercel
module.exports = app;

