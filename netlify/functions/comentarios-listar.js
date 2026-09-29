// Devuelve, para un artículo dado, únicamente los comentarios ya aprobados.
// Función pública de solo lectura: no requiere sesión.

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const params = event.queryStringParameters || {};
  const articulo = (params.articulo || "").toString().trim().slice(0, 200);
  if (!articulo) {
    return { statusCode: 400, body: JSON.stringify({ error: "Falta el parámetro articulo" }) };
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const TABLA = "Comentarios";

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: "El sitio aún no está configurado del lado del servidor" }) };
  }

  try {
    const formula = `AND({Articulo}='${articulo.replace(/'/g, "\\'")}', {Estado}='Aprobado')`;
    const url =
      "https://api.airtable.com/v0/" +
      AIRTABLE_BASE_ID +
      "/" +
      encodeURIComponent(TABLA) +
      "?filterByFormula=" +
      encodeURIComponent(formula) +
      "&pageSize=100";
    const resp = await fetch(url, { headers: { Authorization: "Bearer " + AIRTABLE_TOKEN } });
    if (!resp.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: "No fue posible obtener los comentarios" }) };
    }
    const data = await resp.json();
    const lista = (data.records || [])
      .map(function (r) {
        return {
          nombre: (r.fields && r.fields.Nombre) || "Anónimo",
          comentario: (r.fields && r.fields.Comentario) || "",
          fecha: r.createdTime,
        };
      })
      .sort(function (a, b) {
        return new Date(b.fecha) - new Date(a.fecha);
      });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comentarios: lista }),
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "Error consultando los comentarios" }) };
  }
};
