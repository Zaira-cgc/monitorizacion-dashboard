const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { authAdmin } = require('../middleware/auth');

// 🔧 Ruta para obtener todos los device_id únicos
router.get('/device_ids', authAdmin, async (req, res) => {
  try {
    const coleccion = req.app.locals.coleccion;
    const deviceIds = await coleccion.distinct('device_id');
    res.json(deviceIds);
  } catch (err) {
    console.error('Error en /device_ids:', err);
    res.status(500).json({ error: 'Error al obtener los sensores' });
  }
});

// 🔧 Ruta para obtener los últimos 10 registros de un sensor
router.get('/device/:id/datos', authAdmin, async (req, res) => {
  try {
    const coleccion = req.app.locals.coleccion;
    const datos = await coleccion
      .find({ device_id: req.params.id })
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();
    res.json(datos);
  } catch (err) {
    console.error('Error en /device/:id/datos:', err);
    res.status(500).json({ error: 'Error al obtener datos del sensor' });
  }
});

// 🔧 Ruta para obtener las ubicaciones desde geo.json
router.get('/geo', authAdmin, (req, res) => {
  try {
    const geoPath = path.join(__dirname, '../geo.json');
    const geoData = JSON.parse(fs.readFileSync(geoPath, 'utf8'));
    res.json(geoData);
  } catch (err) {
    console.error('Error leyendo geo.json:', err);
    res.status(500).json({ error: 'No se pudo leer geo.json' });
  }
});

// 🔧 Ruta para guardar/editar ubicación de un sensor
router.post('/geo', authAdmin, express.json(), (req, res) => {
  try {
    const geoPath = path.join(__dirname, '../geo.json');
    let geoData = JSON.parse(fs.readFileSync(geoPath, 'utf8'));
    const { device_id, lat, lng, descripcion } = req.body;

    const idx = geoData.findIndex(g => g.device_id === device_id);
    if (idx >= 0) {
      geoData[idx] = { device_id, lat, lng, descripcion };
    } else {
      geoData.push({ device_id, lat, lng, descripcion });
    }

    fs.writeFileSync(geoPath, JSON.stringify(geoData, null, 2));
    res.json({ ok: true, message: 'Ubicación guardada' });
  } catch (err) {
    console.error('Error escribiendo geo.json:', err);
    res.status(500).json({ error: 'No se pudo guardar ubicación' });
  }
});

module.exports = router;
