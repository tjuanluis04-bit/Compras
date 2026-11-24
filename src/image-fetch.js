// Intenta obtener las fotos de un producto a partir de su enlace, leyendo las
// etiquetas og:image / twitter:image de la página. Es "mejor esfuerzo": muchas
// tiendas bloquean estas peticiones o requieren JavaScript para cargar las
// imágenes, así que no siempre va a funcionar — por eso es opcional y el
// usuario siempre puede seguir subiendo fotos a mano.

var PROXY = "https://api.allorigins.win/raw?url=";

export async function fetchProductImages(link) {
  if (!link) return [];
  var res = await fetch(PROXY + encodeURIComponent(link), { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo abrir el enlace (" + res.status + ")");
  var html = await res.text();

  var doc = new DOMParser().parseFromString(html, "text/html");
  var urls = [];

  function addMeta(selector) {
    doc.querySelectorAll(selector).forEach(function (el) {
      var content = el.getAttribute("content");
      if (content) urls.push(content);
    });
  }

  addMeta('meta[property="og:image"]');
  addMeta('meta[property="og:image:secure_url"]');
  addMeta('meta[name="twitter:image"]');

  // dedupe y límite razonable
  var seen = {};
  var unique = [];
  urls.forEach(function (u) {
    var abs = toAbsoluteUrl(u, link);
    if (abs && !seen[abs]) {
      seen[abs] = true;
      unique.push(abs);
    }
  });

  return unique.slice(0, 6);
}

function toAbsoluteUrl(url, base) {
  try {
    return new URL(url, base).toString();
  } catch (e) {
    return null;
  }
}
