// Devuelve únicamente las consultas ya respondidas y publicadas.
// Función pública de solo lectura.

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const TABLA = "Consultas";

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: "El sitio aún no está configurado del lado del servidor" }) };
  }

  try {
    const url =
      "https://api.airtable.com/v0/" +
      AIRTABLE_BASE_ID +
      "/" +
      encodeURIComponent(TABLA) +
      "?filterByFormula=" +
      encodeURIComponent("{Estado}='Publicada'") +
      "&pageSize=100";
    const resp = await fetch(url, { headers: { Authorization: "Bearer " + AIRTABLE_TOKEN } });
    if (!resp.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: "No fue posible obtener las consultas" }) };
    }
    const data = await resp.json();
    const lista = (data.records || [])
      .map(function (r) {
        return {
          nombre: (r.fields && r.fields.Nombre) || "Consulta anónima",
          pregunta: (r.fields && r.fields.Pregunta) || "",
          respuesta: (r.fields && r.fields.Respuesta) || "",
          fecha: r.createdTime,
        };
      })
      .sort(function (a, b) {
        return new Date(b.fecha) - new Date(a.fecha);
      });

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consultas: lista }) };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "Error consultando las preguntas publicadas" }) };
  }
};
