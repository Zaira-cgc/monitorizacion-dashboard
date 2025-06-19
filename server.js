// 1. CARGAR CONFIG Y MÓDULOS
require('dotenv').config();              // ➜ carga MONGO_URI, JWT_SECRET…
const express    = require('express');
const cors       = require('cors');
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const { MongoClient } = require('mongodb');


// 2. INICIALIZAR APP Y MIDDLEWARES
const app = express();
app.use(cors());                         // ➜ habilita CORS PARA TODAS las rutas
app.use(express.json());                 // ➜ parsea JSON en req.body


// 3. DEFINIR VARIABLES DE CONEXIÓN
const PORT        = process.env.PORT || 3000;
const uri         = process.env.MONGO_URI;
const cliente     = new MongoClient(uri);
const dbName      = 'cenicilla';
const collectionName = 'sensores';
let coleccion, coleccionUsuarios;        // referencias a colecciones


// 4. FUNCIÓN PARA CONECTAR A MONGO
async function conectarDB() {
  try {
    await cliente.connect();
    const db = cliente.db(dbName);

    // 4.1. tu colección de sensores (ya existe)
    coleccion = db.collection(collectionName);

    // 4.2. referencia a 'usuarios' (si no existe, se creará al primer insert)
    coleccionUsuarios = db.collection('usuarios');

    console.log('✅ Conectado a MongoDB');
  } catch (err) {
    console.error('❌ Error conectando a MongoDB:', err);
  }
}


// 5. MIDDLEWARE DE AUTENTICACIÓN
function verificarToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Token faltante' });
  const [, token] = header.split(' ');
  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}


// 6. RUTA DE REGISTRO (solo admin puede usarla)
app.post('/api/register', verificarToken, async (req, res) => {
  const { email, password, rol = 'usuario' } = req.body;
  try {
    // Validar que el usuario que hace la petición sea admin
    const admin = await coleccionUsuarios.findOne({ email: req.usuario.email });
    if (!admin || admin.rol !== 'admin') {
      return res.status(403).json({ error: 'No autorizado para registrar usuarios' });
    }

    const existe = await coleccionUsuarios.findOne({ email });
    if (existe) return res.status(400).json({ error: 'El correo ya está registrado' });

    const hash = await bcrypt.hash(password, 10);
    await coleccionUsuarios.insertOne({
      email,
      password: hash,
      rol,
      fechaCreacion: new Date()
    });
    res.json({ message: 'Usuario registrado' });
  } catch {
    res.status(500).json({ error: 'No se pudo crear el usuario' });
  }
});


// 7. RUTA DE LOGIN
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await coleccionUsuarios.findOne({ email });
  if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
  const valido = await bcrypt.compare(password, user.password);
  if (!valido) return res.status(401).json({ error: 'Contraseña incorrecta' });

  const token = jwt.sign(
    { userId: user._id, email: user.email, rol: user.rol },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
  res.json({ token });
});


// 8. RUTA PROTEGIDA DE ESTADÍSTICAS
app.get('/api/estadisticas', verificarToken, async (req, res) => {
  try {
    const registros = await coleccion.find().sort({ timestamp: -1 }).toArray();
    const datos = registros.map(doc => ({
      tiempo: doc.timestamp,
      humedad: doc.sensores?.humidity ?? null,
      temperatura: doc.sensores?.temperature ?? null,
      suelo: doc.sensores?.humiditysuelo ?? null
    }));
    res.json(datos.reverse());
  } catch {
    res.status(500).json({ error: 'Error al obtener datos' });
  }
});


// 9. NUEVA RUTA PARA OBTENER ROL DEL USUARIO
app.get('/api/usuario', verificarToken, async (req, res) => {
  try {
    const usuario = await coleccionUsuarios.findOne({ email: req.usuario.email });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({ email: usuario.email, rol: usuario.rol });
  } catch {
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});


// 10. INICIAR CONEXIÓN Y SERVIDOR
conectarDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
  });
});