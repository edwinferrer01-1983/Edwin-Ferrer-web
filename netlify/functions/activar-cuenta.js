// Función pública: permite que un cliente active su propio acceso al portal
// usando su número de cédula, SIN que el abogado tenga que invitarlo antes.
//
// Solo funciona si esa cédula ya existe en la columna "Cedula" de la tabla
// "Casos" en Airtable (es decir, si el abogado ya cargó su caso). Así nadie
// ajeno puede crear una cuenta.
//
// Por dentro, se crea un usuario de Netlify Identity con un correo interno
// invisible del tipo "<cedula>@clientes.edwinferrerabogado.com", usando la
// contraseña que el cliente elige. El cliente nunca ve ni necesita ese
// correo interno.

const CEDULA_DOMAIN = "@clientes.edwinferrerabogado.com";

exports.handler = async function (event, context) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: "Solicitud inválida" }) };
  }

  const cedulaOriginal = (payload.cedula || "").toString().trim();
  const cedula = cedulaOriginal.replace(/[^0-9A-Za-z]/g, "");
  const password = (payload.password || "").toString();

  if (!cedula) {
    return { statusCode: 400, body: JSON.stringify({ error: "Ingrese su número de cédula" }) };
  }
  if (!/^[0-9]{6}$/.test(password)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "La clave debe ser de 6 números" }),
    };
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || "Casos";
  const identity = context.clientContext && context.clientContext.identity;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !identity || !identity.url || !identity.token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "El portal aún no está configurado del lado del servidor" }),
    };
  }

  // 1) Verificar que la cédula corresponda a un caso ya cargado.
  const formula = `{Cedula}='${cedula.replace(/'/g, "\\'")}'`;
  const airtableUrl =
    "https://api.airtable.com/v0/" +
    AIRTABLE_BASE_ID +
    "/" +
    encodeURIComponent(AIRTABLE_TABLE_NAME) +
    "?filterByFormula=" +
    encodeURIComponent(formula) +
    "&maxRecords=1";

  let registro;
  try {
    const resp = await fetch(airtableUrl, {
      headers: { Authorization: "Bearer " + AIRTABLE_TOKEN },
    });
    if (!resp.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: "No fue posible verificar la cédula" }) };
    }
    const data = await resp.json();
    registro = (data.records || [])[0];
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "Error verificando la cédula" }) };
  }

  if (!registro) {
    return {
      statusCode: 404,
      body: JSON.stringify({
        error: "No encontramos ningún caso asociado a esa cédula. Comuníquese con la oficina.",
      }),
    };
  }

  const emailInterno = cedula + CEDULA_DOMAIN;
  const identityBase = identity.url.replace(/\/$/, "");

  // 2) Verificar que no exista ya una cuenta con esta cédula.
  try {
    const existeResp = await fetch(
      identityBase + "/admin/users?email=" + encodeURIComponent(emailInterno),
      { headers: { Authorization: "Bearer " + identity.token } }
    );
    if (existeResp.ok) {
      const existeData = await existeResp.json();
      const yaExiste = (existeData.users || existeData || []).some(
        (u) => u.email && u.email.toLowerCase() === emailInterno
      );
      if (yaExiste) {
        return {
          statusCode: 409,
          body: JSON.stringify({
            error: "Ya existe una cuenta activada con esta cédula. Use 'Ingresar', o restablezca su contraseña.",
          }),
        };
      }
    }
  } catch (err) {
    // Si esta verificación falla, seguimos e intentamos crear; si ya existe,
    // el paso de creación fallará igualmente con un error claro.
  }

  // 3) Crear el usuario en Netlify Identity.
  try {
    const crearResp = await fetch(identityBase + "/admin/users", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + identity.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: emailInterno,
        password: password,
        confirm: true,
        email_confirm: true,
        user_metadata: { cedula: cedula, nombre_caso: registro.fields && registro.fields["Caso"] },
      }),
    });

    if (!crearResp.ok) {
      const texto = await crearResp.text();
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "No fue posible activar la cuenta", detalle: texto }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: "Error activando la cuenta" }) };
  }
};
