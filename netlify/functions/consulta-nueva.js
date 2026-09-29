// Recibe una pregunta/consulta pública y la guarda en Airtable con estado
// "Pendiente". Solo se publica (con su respuesta) cuando Edwin la responde
// y aprueba desde el panel administrativo.

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: "Solicitud inválida" }) };
  }

  if (payload.trampa) {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  const nombre = (payload.nombre || "").toString().trim().slice(0, 100) || "Anónimo";
  const pregunta = (payload.pregunta || "").toString().trim().slice(0, 2000);

  if (!pregunta || pregunta.length < 8) {
    return { statusCode: 400, body: JSON.stringify({ error: "Por favor escriba su pregunta con un poco más de detalle." }) };
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const TABLA = "Consultas";

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: "El sitio aún no está configurado del lado del servidor" }) };
  }

  try {
    const resp = await fetch(
      "https://api.airtable.com/v0/" + AIRTABLE_BASE_ID + "/" + encodeURIComponent(TABLA),
      {
        method: "POST",
        headers: { Authorization: "Bearer " + AIRTABLE_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: { Nombre: nombre, Pregunta: pregunta, Respuesta: "", Estado: "Pendiente" },
        }),
      }
    );
    if (!resp.ok) {
      const texto = await resp.text();
      return { statusCode: 502, body: JSON.stringify({ error: "No fue posible enviar su consulta", detalle: texto }) };
    }
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "Error enviando la consulta" }) };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, mensaje: "Su consulta fue recibida. Le responderemos y, tras la verificación, podrá quedar publicada aquí." }),
  };
};
