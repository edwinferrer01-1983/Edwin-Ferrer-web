// Recibe un comentario de un visitante sobre un artículo y lo guarda en Airtable
// con estado "Pendiente". No se publica automáticamente: solo aparece en el
// sitio cuando el administrador lo aprueba desde el panel (admin.html).

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

  // Campo trampa (honeypot): si viene lleno, es un bot. Respondemos "ok" sin guardar nada.
  if (payload.trampa) {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  const articulo = (payload.articulo || "").toString().trim().slice(0, 200);
  const nombre = (payload.nombre || "").toString().trim().slice(0, 100) || "Anónimo";
  const comentario = (payload.comentario || "").toString().trim().slice(0, 2000);

  if (!articulo || !comentario) {
    return { statusCode: 400, body: JSON.stringify({ error: "Falta el comentario." }) };
  }
  if (comentario.length < 3) {
    return { statusCode: 400, body: JSON.stringify({ error: "El comentario es demasiado corto." }) };
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const TABLA = "Comentarios";

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: "El sitio aún no está configurado del lado del servidor" }) };
  }

  try {
    const resp = await fetch(
      "https://api.airtable.com/v0/" + AIRTABLE_BASE_ID + "/" + encodeURIComponent(TABLA),
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + AIRTABLE_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            Articulo: articulo,
            Nombre: nombre,
            Comentario: comentario,
            Estado: "Pendiente",
          },
        }),
      }
    );
    if (!resp.ok) {
      const texto = await resp.text();
      return { statusCode: 502, body: JSON.stringify({ error: "No fue posible guardar el comentario", detalle: texto }) };
    }
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "Error guardando el comentario" }) };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, mensaje: "Su comentario fue recibido y se publicará una vez sea verificado." }),
  };
};
