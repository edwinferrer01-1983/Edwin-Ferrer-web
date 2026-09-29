// Panel administrativo de consultas públicas: solo Edwin (ADMIN_EMAIL) puede
// listar las consultas pendientes, responderlas (quedan publicadas junto con
// su respuesta) o rechazarlas (se eliminan sin publicarse).

exports.handler = async function (event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const user = context.clientContext && context.clientContext.user;
  const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase();

  if (!user || !user.email || !ADMIN_EMAIL || user.email.toLowerCase() !== ADMIN_EMAIL) {
    return { statusCode: 403, body: JSON.stringify({ error: "No autorizado" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: "Solicitud inválida" }) };
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const TABLA = "Consultas";

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: "El sitio aún no está configurado del lado del servidor" }) };
  }

  const baseUrl = "https://api.airtable.com/v0/" + AIRTABLE_BASE_ID + "/" + encodeURIComponent(TABLA);

  if (payload.accion === "pendientes") {
    try {
      const url = baseUrl + "?filterByFormula=" + encodeURIComponent("{Estado}='Pendiente'") + "&pageSize=100";
      const resp = await fetch(url, { headers: { Authorization: "Bearer " + AIRTABLE_TOKEN } });
      if (!resp.ok) return { statusCode: 502, body: JSON.stringify({ error: "No fue posible listar las consultas" }) };
      const data = await resp.json();
      const lista = (data.records || []).map(function (r) {
        return {
          id: r.id,
          nombre: r.fields && r.fields.Nombre,
          pregunta: r.fields && r.fields.Pregunta,
          fecha: r.createdTime,
        };
      });
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pendientes: lista }) };
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: "Error listando consultas" }) };
    }
  }

  if (payload.accion === "responder") {
    const id = (payload.id || "").toString();
    const respuesta = (payload.respuesta || "").toString().trim().slice(0, 4000);
    if (!id || !respuesta) return { statusCode: 400, body: JSON.stringify({ error: "Falta el id o la respuesta" }) };
    try {
      const resp = await fetch(baseUrl + "/" + id, {
        method: "PATCH",
        headers: { Authorization: "Bearer " + AIRTABLE_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { Respuesta: respuesta, Estado: "Publicada" } }),
      });
      if (!resp.ok) return { statusCode: 502, body: JSON.stringify({ error: "No fue posible publicar la respuesta" }) };
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: "Error publicando la respuesta" }) };
    }
  }

  if (payload.accion === "rechazar") {
    const id = (payload.id || "").toString();
    if (!id) return { statusCode: 400, body: JSON.stringify({ error: "Falta el id" }) };
    try {
      const resp = await fetch(baseUrl + "/" + id, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + AIRTABLE_TOKEN },
      });
      if (!resp.ok) return { statusCode: 502, body: JSON.stringify({ error: "No fue posible rechazar la consulta" }) };
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: "Error rechazando la consulta" }) };
    }
  }

  return { statusCode: 400, body: JSON.stringify({ error: "Acción no reconocida" }) };
};
