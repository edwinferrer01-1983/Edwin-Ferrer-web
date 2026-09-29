// Función privada: consulta el estado del caso del cliente autenticado.
// Netlify decodifica el token de Netlify Identity que llega en el header
// Authorization y, si es válido, lo entrega aquí como context.clientContext.user.
// Nadie que no tenga sesión válida llega a este punto con un usuario.

exports.handler = async function (event, context) {
  const user = context.clientContext && context.clientContext.user;

  if (!user || !user.email) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: "No autenticado" }),
    };
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || "Casos";

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "El portal aún no está configurado del lado del servidor" }),
    };
  }

  // Los clientes que se activaron con cédula (sin correo real) tienen un
  // correo interno del tipo "<cedula>@clientes.edwinferrerabogado.com".
  // En ese caso buscamos por la columna Cédula en vez de Email.
  const CEDULA_DOMAIN = "@clientes.edwinferrerabogado.com";
  const email = user.email.toLowerCase().replace(/'/g, "\\'");
  let formula;
  if (email.endsWith(CEDULA_DOMAIN)) {
    const cedula = email.slice(0, -CEDULA_DOMAIN.length);
    formula = `{Cedula}='${cedula}'`;
  } else {
    formula = `LOWER({Email})='${email}'`;
  }
  const url =
    "https://api.airtable.com/v0/" +
    AIRTABLE_BASE_ID +
    "/" +
    encodeURIComponent(AIRTABLE_TABLE_NAME) +
    "?filterByFormula=" +
    encodeURIComponent(formula);

  try {
    const resp = await fetch(url, {
      headers: { Authorization: "Bearer " + AIRTABLE_TOKEN },
    });

    if (!resp.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "No fue posible consultar la información" }),
      };
    }

    const data = await resp.json();
    const casos = (data.records || []).map(function (r) {
      const f = r.fields || {};
      return {
        caso: f["Caso"] || "",
        estado: f["Estado"] || "",
        proximaActuacion: f["ProximaActuacion"] || "",
        notas: f["Notas"] || "",
        actualizado: f["Actualizado"] || "",
      };
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ casos: casos }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: "Error consultando la información" }),
    };
  }
};
