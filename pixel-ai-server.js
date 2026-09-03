// ==========================================
// PIXEL AI - SERVIDOR SEGURO
// ==========================================

const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.OPENAI_API_KEY;

// ==========================================
// SEGURIDAD
// ==========================================

if (!API_KEY) {
  console.error("ERROR: Falta OPENAI_API_KEY");
  process.exit(1);
}

// Límite sencillo para evitar abusos
const requests = new Map();

function allowedRequest(ip) {
  const now = Date.now();
  const minute = 60 * 1000;

  const old = requests.get(ip) || [];

  const recent = old.filter(
    time => now - time < minute
  );

  if (recent.length >= 20) {
    requests.set(ip, recent);
    return false;
  }

  recent.push(now);
  requests.set(ip, recent);

  return true;
}

// ==========================================
// PETICIÓN A OPENAI
// ==========================================

function askOpenAI(message, history) {

  return new Promise((resolve, reject) => {

    const body = JSON.stringify({

      model: "gpt-5.6-luna",

      store: false,

      tools: [
        {
          type: "web_search"
        }
      ],

      instructions: `
Eres Pixel AI, la inteligencia artificial de Pixel Games.

Habla siempre en español.

Tu personalidad es amable, divertida y útil.

Puedes hablar sobre:
- Pixel Games
- videojuegos
- ideas para juegos
- programación
- tecnología
- información general

Cuando el usuario pregunte por información actual,
puedes utilizar la búsqueda web.

Si el usuario pide una idea para un videojuego,
explica la idea de forma clara y creativa.

No digas que tienes acceso a conversaciones privadas.

No inventes que has guardado algo si el servidor
no te lo ha enviado explícitamente.
      `,

      input: [
        ...(Array.isArray(history)
          ? history.slice(-12)
          : []),

        {
          role: "user",
          content: message
        }
      ]

    });

    const request = https.request(
      {
        hostname: "api.openai.com",

        path: "/v1/responses",

        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + API_KEY,
          "Content-Length":
            Buffer.byteLength(body)
        }
      },

      response => {

        let data = "";

        response.on(
          "data",
          chunk => {
            data += chunk;
          }
        );

        response.on(
          "end",
          () => {

            if (
              response.statusCode < 200 ||
              response.statusCode >= 300
            ) {

              console.error(
                "OpenAI:",
                response.statusCode,
                data
              );

              reject(
                new Error(
                  "Error de la inteligencia artificial."
                )
              );

              return;
            }

            try {

              const result =
                JSON.parse(data);

              resolve(
                result.output_text ||
                "No he podido generar una respuesta."
              );

            } catch {

              reject(
                new Error(
                  "Respuesta inválida de la IA."
                )
              );

            }

          }
        );

      }
    );

    request.on(
      "error",
      reject
    );

    request.write(body);

    request.end();

  });

}

// ==========================================
// SERVIDOR HTTP
// ==========================================

const server = http.createServer(
  async (req, res) => {

    // CORS
    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );

    res.setHeader(
      "Access-Control-Allow-Methods",
      "POST, OPTIONS"
    );

    // Preflight
    if (req.method === "OPTIONS") {

      res.writeHead(204);
      res.end();

      return;
    }

    // Estado del servidor
    if (
      req.method === "GET" &&
      req.url === "/"
    ) {

      res.writeHead(
        200,
        {
          "Content-Type":
            "application/json"
        }
      );

      res.end(
        JSON.stringify({
          service: "Pixel AI",
          status: "online"
        })
      );

      return;
    }

    // ======================================
    // PIXEL AI
    // ======================================

    if (
      req.method === "POST" &&
      req.url === "/api/pixel-ai"
    ) {

      const ip =
        req.socket.remoteAddress ||
        "unknown";

      if (!allowedRequest(ip)) {

        res.writeHead(
          429,
          {
            "Content-Type":
              "application/json"
          }
        );

        res.end(
          JSON.stringify({
            error:
              "Demasiadas peticiones. Espera un momento."
          })
        );

        return;
      }

      let body = "";

      req.on(
        "data",
        chunk => {

          body += chunk;

          // Máximo aproximado de 100 KB
          if (body.length > 100000) {
            req.destroy();
          }

        }
      );

      req.on(
        "end",
        async () => {

          try {

            const data =
              JSON.parse(body);

            const message =
              typeof data.message === "string"
                ? data.message.trim()
                : "";

            const history =
              Array.isArray(data.history)
                ? data.history
                : [];

            if (!message) {

              res.writeHead(
                400,
                {
                  "Content-Type":
                    "application/json"
                }
              );

              res.end(
                JSON.stringify({
                  error:
                    "El mensaje está vacío."
                })
              );

              return;
            }

            if (message.length > 4000) {

              res.writeHead(
                400,
                {
                  "Content-Type":
                    "application/json"
                }
              );

              res.end(
                JSON.stringify({
                  error:
                    "El mensaje es demasiado largo."
                })
              );

              return;
            }

            const answer =
              await askOpenAI(
                message,
                history
              );

            res.writeHead(
              200,
              {
                "Content-Type":
                  "application/json"
              }
            );

            res.end(
              JSON.stringify({
                answer
              })
            );

          } catch (error) {

            console.error(error);

            res.writeHead(
              500,
              {
                "Content-Type":
                  "application/json"
              }
            );

            res.end(
              JSON.stringify({
                error:
                  "Pixel AI no está disponible ahora."
              })
            );

          }

        }
      );

      return;
    }

    // ======================================
    // 404
    // ======================================

    res.writeHead(
      404,
      {
        "Content-Type":
          "application/json"
      }
    );

    res.end(
      JSON.stringify({
        error: "Ruta no encontrada."
      })
    );

  }
);

// ==========================================
// ARRANCAR
// ==========================================

server.listen(
  PORT,
  () => {

    console.log(
      `Pixel AI funcionando en el puerto ${PORT}`
    );

  }
);
