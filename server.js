//Se importan los módulos necesarios para crear el servidor, habilitar peticiones y conectar la BD
const path = require('path'); 
const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

//Se crea la app de express y se define el puerto que escuchará las peticiones HTTP
const app = express();
const PORT = 3000;

//Habilita CORS
app.use(cors());

//URI de conexión(debe protegerse el usuario y contraseña en producción)
const uri = process.env.MONGO_URI;
const cliente = new MongoClient(uri);

//Nombre de la base de datos y colección tal como existe en la BD
const dbName = "cenicilla";
const collectionName = "sensores"; 

let coleccion;

//Funcion para conectarse a Mongo
async function conectarDB() {
  try {
    await cliente.connect(); //Conecta al cluster
    const db = cliente.db(dbName); //Accede a la BD
    coleccion = db.collection(collectionName); //Accede a la colección
    console.log("Conectado a MongoDB");
  } catch (error) {
    console.error("Error conectando a MongoDB:", error);
  }
}

//ruta principal de la API
app.get("/api/estadisticas", async (req, res) => {
  try {
    const registros = await coleccion.find().sort({ timestamp: -1 }).toArray(); //COnsulta todos los datos de la coleccion 

    //extrae los valores necesarios de cada registro
    const datos = registros.map(doc => ({
      tiempo: doc.timestamp,
      humedad: doc.sensores?.humidity ?? null,
      temperatura: doc.sensores?.temperature ?? null,
      suelo: doc.sensores?.humiditysuelo ?? null
    }));

    res.json(datos.reverse()); 
  } catch (err) {
    console.error("Error al obtener datos:", err);
    res.status(500).json({ error: "Error al obtener datos" });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

//inicia el servidor
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  conectarDB(); //conecta a Mongo al iniciar el servidor
});

