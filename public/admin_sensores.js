async function cargarSensores() {
  const token = localStorage.getItem('token');
  const contenedor = document.getElementById('contenedorSensores');
  contenedor.innerHTML = 'Cargando sensores...';

  try {
    const resIds = await fetch('/api/admin/device_ids', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const deviceIds = await resIds.json();

    const resGeo = await fetch('/api/admin/geo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const geoData = await resGeo.json();

    contenedor.innerHTML = '';

    for (const id of deviceIds) {
      const datosRes = await fetch(`/api/admin/device/${id}/datos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const datos = await datosRes.json();

      const ultima = datos[0];
      const temp = ultima?.sensores?.temperature ?? 'N/A';
      const alerta = temp > 27 ? `<span class="alerta">ALERTA: ${temp}°C</span>` : `${temp}°C`;
      const humedad = ultima?.sensores?.humidity ?? 'N/A';
      const suelo = ultima?.sensores?.humiditysuelo ?? 'N/A';
      
      const ubicacion = geoData.find(g => g.device_id === id);
      const desc = ubicacion?.descripcion ?? 'Sin ubicación';
      const lat = ubicacion?.lat ?? '';
      const lng = ubicacion?.lng ?? '';

      const div = document.createElement('div');
      div.className = 'sensor';
      div.innerHTML = `
        <h3>🔌 Sensor: ${id}</h3>
        <p>🌍 Ubicación: ${desc}</p>
        <p>🌡️ Última temperatura: ${alerta}</p>
        <p>💧 Última humedad aire: ${humedad}%</p>
        <p>🌱 Última humedad suelo: ${suelo}%</p>
        <button onclick='abrirModal(${JSON.stringify({ device_id: id, lat, lng, descripcion: desc })})'>Editar ubicación</button>
      `;

      contenedor.appendChild(div);
    }
  } catch (err) {
    contenedor.innerHTML = 'Error al cargar sensores';
    console.error(err);
  }
}

function abrirModal(sensor) {
  document.getElementById('sensorModal').style.display = 'flex';

  document.getElementById('form_device_id').value = sensor?.device_id ?? '';
  document.getElementById('form_lat').value = sensor?.lat ?? '';
  document.getElementById('form_lng').value = sensor?.lng ?? '';
  document.getElementById('form_desc').value = sensor?.descripcion ?? '';
  document.getElementById('modalTitulo').textContent = sensor ? 'Editar Sensor' : 'Agregar Nuevo Sensor';

  if (!sensor) document.getElementById('form_device_id').removeAttribute('readonly');
  else document.getElementById('form_device_id').setAttribute('readonly', 'readonly');
}

function cerrarModal() {
  document.getElementById('sensorModal').style.display = 'none';
}

document.getElementById('sensorForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const device_id = document.getElementById('form_device_id').value.trim();
  const lat = parseFloat(document.getElementById('form_lat').value);
  const lng = parseFloat(document.getElementById('form_lng').value);
  const descripcion = document.getElementById('form_desc').value.trim();

  const token = localStorage.getItem('token');

  try {
    const res = await fetch('/api/admin/geo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ device_id, lat, lng, descripcion })
    });

    const data = await res.json();
    alert(data.message);
    cerrarModal();
    cargarSensores();
  } catch (err) {
    alert('Error al guardar sensor');
    console.error(err);
  }
});

cargarSensores();
