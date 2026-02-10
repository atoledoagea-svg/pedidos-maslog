import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import * as XLSX from 'xlsx'

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
}

const MODALITY_OPTIONS = ['', 'Firme', 'Consignación']

// Utils
function parsePrice(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  return parseFloat(String(value).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0
}

function formatPrice(value) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value || 0)
}

function processExcelData(jsonData) {
  const headers = Object.keys(jsonData[0])
  
  const findCol = (possibleNames) => {
    for (const name of possibleNames) {
      const found = headers.find(h => 
        h.toUpperCase().trim().includes(name.toUpperCase().trim())
      )
      if (found) return found
    }
    return null
  }

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
  }

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
  })).filter(item => item.sku)
}

// Toast Component
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  const icons = { success: '✅', error: '❌', info: 'ℹ️' }
  
  return (
    <div className={`toast ${type}`}>
      <span className="toast-icon">{icons[type]}</span>
      <span className="toast-message">{message}</span>
    </div>
  )
}

// Autocomplete Item
function AutocompleteItem({ item, isSelected, onClick, onMouseEnter }) {
  return (
    <div 
      className={`autocomplete-item ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <span className="autocomplete-sku">{item.sku}</span>
      <span className="autocomplete-product">{item.product}</span>
      <div className="autocomplete-prices">
        <span>{formatPrice(item.pdvIvaUnidad)}</span>
      </div>
    </div>
  )
}

// Row Component
function SpreadsheetRow({ row, index, onUpdate, onDelete, onDuplicate, onSkuSearch, catalog }) {
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [isAnimating, setIsAnimating] = useState(false)
  const inputRef = useRef(null)
  const searchTimeoutRef = useRef(null)

  const handleSkuChange = (value) => {
    const upperValue = value.toUpperCase()
    onUpdate(row.id, 'sku', upperValue)
    
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    
    if (upperValue.length >= 1 && catalog.length > 0) {
      searchTimeoutRef.current = setTimeout(() => {
        const results = catalog.filter(item =>
          item.sku.toUpperCase().includes(upperValue) ||
          item.product.toUpperCase().includes(upperValue)
        ).slice(0, 15)
        setSearchResults(results)
        setShowAutocomplete(true)
        setSelectedIndex(-1)
      }, 150)
    } else {
      setShowAutocomplete(false)
    }
  }

  const selectProduct = (product) => {
    onUpdate(row.id, 'all', {
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
    })
    setShowAutocomplete(false)
    setIsAnimating(true)
    setTimeout(() => setIsAnimating(false), 600)
  }

  const handleKeyDown = (e) => {
    if (!showAutocomplete) return
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && searchResults[selectedIndex]) {
          selectProduct(searchResults[selectedIndex])
        }
        break
      case 'Escape':
      case 'Tab':
        setShowAutocomplete(false)
        break
    }
  }

  return (
    <tr className={isAnimating ? 'row-found' : ''}>
      <td className="row-num">{index + 1}</td>
      <td style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="text"
          className="sku-input"
          value={row.sku}
          onChange={(e) => handleSkuChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
          placeholder="SKU..."
          autoComplete="off"
        />
        {showAutocomplete && (
          <div className="autocomplete-dropdown visible" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 1000 }}>
            {searchResults.length === 0 ? (
              <div className="autocomplete-empty">No se encontraron productos</div>
            ) : (
              searchResults.map((item, idx) => (
                <AutocompleteItem
                  key={item.sku}
                  item={item}
                  isSelected={idx === selectedIndex}
                  onClick={() => selectProduct(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                />
              ))
            )}
          </div>
        )}
      </td>
      <td><div className="readonly-cell product-cell">{row.product || '-'}</div></td>
      <td>
        <input
          type="number"
          className="qty-input"
          value={row.quantity}
          onChange={(e) => onUpdate(row.id, 'quantity', parseInt(e.target.value) || 1)}
          min="1"
        />
      </td>
      <td>
        <select value={row.modality} onChange={(e) => onUpdate(row.id, 'modality', e.target.value)}>
          {MODALITY_OPTIONS.map(opt => (
            <option key={opt} value={opt}>{opt || 'Seleccionar...'}</option>
          ))}
        </select>
      </td>
      <td>
        <input
          type="text"
          value={row.observation}
          onChange={(e) => onUpdate(row.id, 'observation', e.target.value)}
          placeholder="Obs..."
        />
      </td>
      <td>
        <input
          type="text"
          value={row.agent}
          onChange={(e) => onUpdate(row.id, 'agent', e.target.value)}
          placeholder="Agente..."
        />
      </td>
      <td>
        <input
          type="text"
          value={row.location}
          onChange={(e) => onUpdate(row.id, 'location', e.target.value)}
          placeholder="Localidad..."
        />
      </td>
      <td>
        <input
          type="text"
          value={row.pdv}
          onChange={(e) => onUpdate(row.id, 'pdv', e.target.value)}
          placeholder="PDV..."
        />
      </td>
      <td><div className="readonly-cell price-costo">{row.costoIvaUnidad ? formatPrice(row.costoIvaUnidad) : '-'}</div></td>
      <td><div className="readonly-cell price-costo">{row.costoIvaBulto ? formatPrice(row.costoIvaBulto) : '-'}</div></td>
      <td><div className="readonly-cell price-dist">{row.distIvaUnidad ? formatPrice(row.distIvaUnidad) : '-'}</div></td>
      <td><div className="readonly-cell price-dist">{row.distIvaBulto ? formatPrice(row.distIvaBulto) : '-'}</div></td>
      <td><div className="readonly-cell price-pdv">{row.pdvIvaUnidad ? formatPrice(row.pdvIvaUnidad) : '-'}</div></td>
      <td><div className="readonly-cell price-pdv">{row.pdvIvaBulto ? formatPrice(row.pdvIvaBulto) : '-'}</div></td>
      <td><div className="readonly-cell price-pvp">{row.pvpSugeridoBulto ? formatPrice(row.pvpSugeridoBulto) : '-'}</div></td>
      <td><div className="readonly-cell price-pvp">{row.pvpSugeridoUnidad ? formatPrice(row.pvpSugeridoUnidad) : '-'}</div></td>
      <td><div className="readonly-cell subtotal-cell">{formatPrice((row.pdvIvaUnidad || 0) * row.quantity)}</div></td>
      <td>
        <div className="action-cell">
          <button className="btn-duplicate-row" title="Duplicar" onClick={() => onDuplicate(row.id)}>📋</button>
          <button className="btn-delete-row" title="Eliminar" onClick={() => onDelete(row.id)}>🗑️</button>
        </div>
      </td>
    </tr>
  )
}

// Main Component
export default function Home() {
  const [catalog, setCatalog] = useState([])
  const [rows, setRows] = useState([])
  const [rowIdCounter, setRowIdCounter] = useState(0)
  const [toasts, setToasts] = useState([])
  const fileInputRef = useRef(null)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const savedCatalog = localStorage.getItem('pedidomaslog_catalog')
      const savedRows = localStorage.getItem('pedidomaslog_rows')
      const savedCounter = localStorage.getItem('pedidomaslog_rowIdCounter')
      
      if (savedCatalog) {
        setCatalog(JSON.parse(savedCatalog))
      }
      if (savedRows) {
        setRows(JSON.parse(savedRows))
      }
      if (savedCounter) {
        setRowIdCounter(parseInt(savedCounter))
      }
      
      // Add initial row if no rows
      if (!savedRows || JSON.parse(savedRows).length === 0) {
        addNewRow()
      }
    } catch (e) {
      addNewRow()
    }
    
    showToast('¡Bienvenido! Carga tu catálogo Excel para comenzar.', 'info')
  }, [])

  // Save rows to localStorage
  useEffect(() => {
    if (rows.length > 0) {
      localStorage.setItem('pedidomaslog_rows', JSON.stringify(rows))
      localStorage.setItem('pedidomaslog_rowIdCounter', rowIdCounter.toString())
    }
  }, [rows, rowIdCounter])

  // Save catalog to localStorage
  useEffect(() => {
    if (catalog.length > 0) {
      localStorage.setItem('pedidomaslog_catalog', JSON.stringify(catalog))
    }
  }, [catalog])

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addNewRow = (data = {}) => {
    setRowIdCounter(prev => {
      const newId = prev + 1
      const newRow = {
        id: newId,
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
      }
      setRows(prev => [...prev, newRow])
      return newId
    })
  }

  const updateRow = (id, field, value) => {
    setRows(prev => prev.map(row => {
      if (row.id !== id) return row
      if (field === 'all') {
        return { ...row, ...value }
      }
      return { ...row, [field]: value }
    }))
  }

  const deleteRow = (id) => {
    setRows(prev => {
      const filtered = prev.filter(row => row.id !== id)
      if (filtered.length === 0) {
        setTimeout(() => addNewRow(), 0)
      }
      return filtered
    })
  }

  const duplicateRow = (id) => {
    const row = rows.find(r => r.id === id)
    if (row) {
      const { id: _, ...rowData } = row
      addNewRow(rowData)
      showToast('Fila duplicada', 'success')
    }
  }

  const clearAllRows = () => {
    if (confirm('¿Limpiar todos los productos del pedido?')) {
      setRows([])
      localStorage.removeItem('pedidomaslog_rows')
      addNewRow()
      showToast('Pedido limpiado', 'info')
    }
  }

  const handleExcelUpload = (event) => {
    const file = event.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: '' })

        if (jsonData.length === 0) {
          showToast('El archivo Excel está vacío', 'error')
          return
        }

        const processedCatalog = processExcelData(jsonData)
        setCatalog(processedCatalog)
        showToast(`Catálogo cargado: ${processedCatalog.length} productos`, 'success')
      } catch (error) {
        console.error('Error al leer Excel:', error)
        showToast('Error al leer el archivo Excel', 'error')
      }
    }
    reader.readAsArrayBuffer(file)
    event.target.value = ''
  }

  const exportToExcel = () => {
    const validRows = rows.filter(row => row.sku && row.product)
    
    if (validRows.length === 0) {
      showToast('No hay productos para exportar', 'error')
      return
    }

    const exportData = validRows.map(row => ({
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
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pedido')

    const d = new Date()
    const filename = `Pedido_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}.xlsx`
    XLSX.writeFile(wb, filename)
    showToast('Pedido exportado', 'success')
  }

  // Calculate totals
  const rowCount = rows.filter(r => r.sku && r.product).length
  const totalAmount = rows.reduce((sum, row) => sum + ((row.pdvIvaUnidad || 0) * row.quantity), 0)

  return (
    <>
      <Head>
        <title>Pedido MasLog - Gestión de Pedidos</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="app-container">
        {/* Header */}
        <header className="app-header">
          <div className="logo">
            <span className="logo-icon">📦</span>
            <h1>PedidoMasLog</h1>
          </div>
          <div className="header-actions">
            <label className="file-upload-btn" htmlFor="excel-upload">
              <span className="btn-icon">📂</span>
              Cargar Catálogo
            </label>
            <input 
              ref={fileInputRef}
              type="file" 
              id="excel-upload" 
              accept=".xlsx,.xls" 
              hidden 
              onChange={handleExcelUpload}
            />
            <button className="btn-export" onClick={exportToExcel}>
              <span className="btn-icon">💾</span>
              Exportar Pedido
            </button>
            <button className="btn-clear" onClick={clearAllRows}>
              <span className="btn-icon">🗑️</span>
              Limpiar
            </button>
          </div>
        </header>

        {/* Status Bar */}
        <div className="status-bar">
          <div className="status-item catalog-status">
            <span className={`status-dot ${catalog.length > 0 ? 'active' : ''}`}></span>
            <span>{catalog.length > 0 ? `Catálogo: ${catalog.length} productos` : 'Sin catálogo cargado'}</span>
          </div>
          <div className="status-item">
            <span>Productos en pedido: </span>
            <strong>{rowCount}</strong>
          </div>
          <div className="status-item">
            <span>Total estimado: </span>
            <strong>{formatPrice(totalAmount)}</strong>
          </div>
        </div>

        {/* Main Content */}
        <main className="main-content">
          <div className="spreadsheet-container">
            <table className="spreadsheet">
              <thead>
                <tr>
                  <th className="col-num">#</th>
                  <th className="col-sku">SKU / CÓDIGO</th>
                  <th className="col-product">PRODUCTO</th>
                  <th className="col-qty">CANTIDAD</th>
                  <th className="col-modality">MODALIDAD</th>
                  <th className="col-obs">OBSERVACIÓN</th>
                  <th className="col-agent">AGENTE</th>
                  <th className="col-location">LOCALIDAD</th>
                  <th className="col-pdv-name">PDV</th>
                  <th className="col-price">COSTO c/IVA UNIDAD</th>
                  <th className="col-price">COSTO c/IVA BULTO</th>
                  <th className="col-price">DIST. c/IVA UNIDAD</th>
                  <th className="col-price">DIST. c/IVA BULTO</th>
                  <th className="col-price">PDV c/IVA UNIDAD</th>
                  <th className="col-price">PDV c/IVA BULTO</th>
                  <th className="col-price">PVP Sug. BULTO</th>
                  <th className="col-price">PVP Sug. UNIDAD</th>
                  <th className="col-subtotal">SUBTOTAL</th>
                  <th className="col-actions">ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <SpreadsheetRow
                    key={row.id}
                    row={row}
                    index={index}
                    onUpdate={updateRow}
                    onDelete={deleteRow}
                    onDuplicate={duplicateRow}
                    catalog={catalog}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <button className="add-row-btn" onClick={() => addNewRow()}>
            <span>+</span> Agregar Fila
          </button>
        </main>

        {/* Toast Notifications */}
        <div className="toast-container">
          {toasts.map(toast => (
            <Toast
              key={toast.id}
              message={toast.message}
              type={toast.type}
              onClose={() => removeToast(toast.id)}
            />
          ))}
        </div>
      </div>
    </>
  )
}

