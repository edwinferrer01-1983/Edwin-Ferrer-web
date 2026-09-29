// Función administrativa: permite a Edwin (y solo a Edwin) buscar un cliente
// por cédula y restablecerle la clave de acceso al portal, para los casos en
// que un cliente con cuenta por cédula olvide su clave (esas cuentas no
// tienen un correo real detrás, así que no pueden usar la recuperación
// automática de contraseña de Netlify Identity).
//
// Seguridad: quien llama debe estar autenticado con Netlify Identity Y su
// correo debe coincidir con la variable de entorno ADMIN_EMAIL. Nadie más
// puede usar esta función, sin importar que conozca la URL.

const CEDULA_DOMAIN = "@clientes.edwinferrerabogado.com";

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

  const accion = payload.accion;
  const cedula = (payload.cedula || "").toString().trim().replace(/[^0-9A-Za-z]/g, "");

  if (!cedula) {
    return { statusCode: 400, body: JSON.stringify({ error: "Ingrese un número de cédula" }) };
  }

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || "Casos";
  const identity = context.clientContext && context.clientContext.identity;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !identity || !identity.url || !identity.token) {
    return { statusCode: 500, body: JSON.stringify({ error: "El portal aún no está configurado del lado del servidor" }) };
  }

  const identityBase = identity.url.replace(/\/$/, "");
  const emailInterno = cedula + CEDULA_DOMAIN;

  // ---------- Buscar cliente ----------
  if (accion === "buscar") {
    let caso = null;
    try {
      const formula = `{Cedula}='${cedula.replace(/'/g, "\\'")}'`;
      const airtableUrl =
        "https://api.airtable.com/v0/" +
        AIRTABLE_BASE_ID +
        "/" +
        encodeURIComponent(AIRTABLE_TABLE_NAME) +
        "?filterByFormula=" +
        encodeURIComponent(formula) +
        "&maxRecords=1";
      const resp = await fetch(airtableUrl, { headers: { Authorization: "Bearer " + AIRTABLE_TOKEN } });
      if (resp.ok) {
        const data = await resp.json();
        const registro = (data.records || [])[0];
        if (registro) caso = registro.fields && registro.fields["Caso"];
      }
    } catch (err) {
      // Si Airtable falla, seguimos: igual reportamos si existe la cuenta.
    }

    let existeCuenta = false;
    try {
      const existeResp = await fetch(
        identityBase + "/admin/users?email=" + encodeURIComponent(emailInterno),
        { headers: { Authorization: "Bearer " + identity.token } }
      );
      if (existeResp.ok) {
        const existeData = await existeResp.json();
        existeCuenta = (existeData.users || existeData || []).some(
          (u) => u.email && u.email.toLowerCase() === emailInterno
        );
      }
    } catch (err) {
      // No pudimos verificar; lo reportamos como desconocido.
    }

    if (!caso && !existeCuenta) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "No se encontró ningún caso ni cuenta asociada a esa cédula." }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caso: caso || null, existeCuenta: existeCuenta }),
    };
  }

  // ---------- Restablecer clave ----------
  if (accion === "resetear") {
    const nuevaClave = (payload.nuevaClave || "").toString();
    if (!/^[0-9]{6}$/.test(nuevaClave)) {
      return { statusCode: 400, body: JSON.stringify({ error: "La nueva clave debe ser de 6 números" }) };
    }

    let idUsuario = null;
    try {
      const buscarResp = await fetch(
        identityBase + "/admin/users?email=" + encodeURIComponent(emailInterno),
        { headers: { Authorization: "Bearer " + identity.token } }
      );
      if (buscarResp.ok) {
        const buscarData = await buscarResp.json();
        const encontrado = (buscarData.users || buscarData || []).find(
          (u) => u.email && u.email.toLowerCase() === emailInterno
        );
        if (encontrado) idUsuario = encontrado.id;
      }
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: "Error buscando la cuenta del cliente" }) };
    }

    if (!idUsuario) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Ese cliente todavía no ha activado su cuenta; no hay clave que restablecer." }),
      };
    }

    try {
      const putResp = await fetch(identityBase + "/admin/users/" + idUsuario, {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + identity.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: nuevaClave }),
      });
      if (!putResp.ok) {
        const texto = await putResp.text();
        return { statusCode: 502, body: JSON.stringify({ error: "No fue posible restablecer la clave", detalle: texto }) };
      }
    } catch (err) {
      return { statusCode: 502, body: JSON.stringify({ error: "Error restableciendo la clave" }) };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  }

  return { statusCode: 400, body: JSON.stringify({ error: "Acción no reconocida" }) };
};
