//Se importan los módulos necesarios para crear el servidor, habilitar peticiones y conectar la BD
require('dotenv').config();              
const express    = require('express');
const cors       = require('cors');
const bcrypt     = require('bcrypt');
const jwt        = require('jsonwebtoken');
const { MongoClient } = require('mongodb');
const path = require('path'); // 

const app = express();
app.use(cors());                         
app.use(express.json());                
app.use(express.static(path.join(__dirname, 'public')));


//Variables de conexion 
const PORT        = process.env.PORT || 3000;
const uri         = process.env.MONGO_URI;
const cliente     = new MongoClient(uri);
const dbName      = 'cenicilla';
const collectionName = 'sensores';
let coleccion, coleccionUsuarios;        


//Conexion a mongo
async function conectarDB() {
  try {
    await cliente.connect();
    const db = cliente.db(dbName);
    coleccion = db.collection(collectionName);
    coleccionUsuarios = db.collection('usuarios');
    app.locals.coleccion = coleccion;
    console.log('Conectado a MongoDB');
  } catch (err) {
    console.error('Error conectando a MongoDB:', err);
  }
}

//Middleware de autenticación 
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


//ruta de registro solo para admin 
app.post('/api/register', verificarToken, async (req, res) => {
  const { email, password, rol = 'usuario' } = req.body;
  try {
    //validar que el usuario que hace la petición sea admin
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


//ruta de login
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


//ruta a estadisticas 
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


//ruta para obtener rol del usuario
app.get('/api/usuario', verificarToken, async (req, res) => {
  try {
    const usuario = await coleccionUsuarios.findOne({ email: req.usuario.email });
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({ email: usuario.email, rol: usuario.rol });
  } catch {
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

// Ruta mejorada: Últimas 24 horas con fallback
app.get('/api/ultimas24horas', verificarToken, async (req, res) => {
  try {
    const hace24Horas = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 1️⃣ Intenta buscar registros de las últimas 24 horas reales
    let registros = await coleccion
      .find({ timestamp: { $gte: hace24Horas } })
      .sort({ timestamp: 1 })
      .toArray();

    // 2️⃣ Si no hay datos, trae últimos registros para armar 24 horas registradas
    if (registros.length === 0) {
      registros = await coleccion
        .find({})
        .sort({ timestamp: -1 })
        .limit(500) // un rango amplio
        .toArray();

      registros.reverse(); // para orden ascendente
    }

    // 3️⃣ Agrupa por hora y toma el último de cada hora
    const porHora = {};

    for (const doc of registros) {
      const fecha = new Date(doc.timestamp);
      const horaClave = fecha.toISOString().slice(0, 13); // yyyy-mm-ddTHH

      porHora[horaClave] = {
        humedad: doc.sensores?.humidity ?? porHora[horaClave]?.humedad,
        temperatura: doc.sensores?.temperature ?? porHora[horaClave]?.temperatura,
        suelo: doc.sensores?.humiditysuelo ?? porHora[horaClave]?.suelo,
        fechaCompleta: fecha.toISOString()
      };
    }

    const resultado = Object.entries(porHora)
      .sort(([h1], [h2]) => h1.localeCompare(h2))
      .slice(-24)
      .map(([hora, valores]) => ({
        hora,
        ...valores
      }));

    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener datos de las últimas 24 horas' });
  }
});

app.get('/api/historico-semanal', verificarToken, async (req, res) => {
  try {
    const { inicio, fin } = req.query;

    let fechaFin = fin ? new Date(fin) : new Date();
    let fechaInicio = inicio ? new Date(inicio) : new Date(fechaFin.getTime() - 7 * 24 * 60 * 60 * 1000);

    if (inicio) fechaInicio.setHours(0, 0, 0, 0);
    if (fin) fechaFin.setHours(23, 59, 59, 999);  

    const sinRango = !inicio && !fin;

    let registros = await coleccion
      .find({ timestamp: { $gte: fechaInicio, $lte: fechaFin } })
      .sort({ timestamp: 1 })
      .toArray();

    if (registros.length === 0 && sinRango) {
      registros = await coleccion
        .find({})
        .sort({ timestamp: -1 })
        .limit(1000)
        .toArray();
      registros.reverse();
    }

    const porDia = {};

    for (const doc of registros) {
      const fecha = new Date(doc.timestamp);
      const diaClave = fecha.getFullYear() + "-" +
        String(fecha.getMonth() + 1).padStart(2, '0') + "-" +
        String(fecha.getDate()).padStart(2, '0');

      if (!porDia[diaClave]) {
        porDia[diaClave] = { humedad: [], temperatura: [], suelo: [] };
      }

      if (doc.sensores?.humidity != null) porDia[diaClave].humedad.push(doc.sensores.humidity);
      if (doc.sensores?.temperature != null) porDia[diaClave].temperatura.push(doc.sensores.temperature);
      if (doc.sensores?.humiditysuelo != null) porDia[diaClave].suelo.push(doc.sensores.humiditysuelo);
    }

    let primerDia, ultimoDia;

    if (sinRango) {
      if (registros.length) {
        primerDia = new Date(registros[0].timestamp);
        ultimoDia = new Date(registros[registros.length - 1].timestamp);
      } else {
        primerDia = fechaInicio;
        ultimoDia = fechaFin;
      }
    } else {
      primerDia = new Date(fechaInicio);
      ultimoDia = new Date(fechaFin);
    }

    const diasContinuos = [];
    let cursor = new Date(primerDia.getFullYear(), primerDia.getMonth(), primerDia.getDate());

    while (cursor <= ultimoDia) {
      const clave = cursor.getFullYear() + "-" +
        String(cursor.getMonth() + 1).padStart(2, '0') + "-" +
        String(cursor.getDate()).padStart(2, '0');
      diasContinuos.push(clave);
      cursor.setDate(cursor.getDate() + 1);
    }

    const resultado = diasContinuos.map(dia => {
      const valores = porDia[dia];
      return {
        dia,
        humedad: {
          min: valores?.humedad?.length ? Math.min(...valores.humedad) : null,
          max: valores?.humedad?.length ? Math.max(...valores.humedad) : null
        },
        temperatura: {
          min: valores?.temperatura?.length ? Math.min(...valores.temperatura) : null,
          max: valores?.temperatura?.length ? Math.max(...valores.temperatura) : null
        },
        suelo: {
          min: valores?.suelo?.length ? Math.min(...valores.suelo) : null,
          max: valores?.suelo?.length ? Math.max(...valores.suelo) : null
        }
      };
    });

    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener histórico semanal' });
  }
});

// 👇 Importa tu archivo de rutas admin
const adminRoutes = require('./routes/admin');

// 👇 Usa la ruta y protege con verificarToken (ya tienes este middleware)
app.use('/api/admin', verificarToken, adminRoutes);

//Ruta para la raíz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

//Conexion y levantar servidor
conectarDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
  });
});