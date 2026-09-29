// Panel administrativo de comentarios: solo Edwin (ADMIN_EMAIL) puede listar
// los comentarios pendientes, aprobarlos (quedan visibles en el artículo) o
// rechazarlos (se eliminan sin publicarse).

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
  const TABLA = "Comentarios";

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: "El sitio aún no está configurado del lado del servidor" }) };
  }

  const baseUrl = "https://api.airtable.com/v0/" + AIRTABLE_BASE_ID + "/" + encodeURIComponent(TABLA);

  if (payload.accion === "pendientes") {
    try {
      const url = baseUrl + "?filterByFormula=" + encodeURIComponent("{Estado}='Pendiente'") + "&pageSize=100";
      const resp = await fetch(url, { headers: { Authorization: "Bearer " + AIRTABLE_TOKEN } });
      if (!resp.ok) return { statusCode: 502, body: JSON.stringify({ error: "No fue posible listar los comentarios" }) };
      const data = await resp.json();
      const lista = (data.records || []).map(function (r) {
        return {
          id: r.id,
          articulo: r.fields && r.fields.Articulo,
          nombre: r.fields && r.fields.Nombre,
          comentario: r.fields && r.fields.Comentario,
          fecha: r.createdTime,
        };
      });
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pendientes: lista }) };
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: "Error listando comentarios" }) };
    }
  }

  if (payload.accion === "aprobar") {
    const id = (payload.id || "").toString();
    if (!id) return { statusCode: 400, body: JSON.stringify({ error: "Falta el id" }) };
    try {
      const resp = await fetch(baseUrl + "/" + id, {
        method: "PATCH",
        headers: { Authorization: "Bearer " + AIRTABLE_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { Estado: "Aprobado" } }),
      });
      if (!resp.ok) return { statusCode: 502, body: JSON.stringify({ error: "No fue posible aprobar el comentario" }) };
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: "Error aprobando el comentario" }) };
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
      if (!resp.ok) return { statusCode: 502, body: JSON.stringify({ error: "No fue posible rechazar el comentario" }) };
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: "Error rechazando el comentario" }) };
    }
  }

  return { statusCode: 400, body: JSON.stringify({ error: "Acción no reconocida" }) };
};
