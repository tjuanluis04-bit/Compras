# Mis Compras

App para guardar futuras compras (Amazon, Shein, AliExpress, etc.) organizadas por categorías propias (p. ej. "Ropa deportiva"), con la tienda de cada producto, precio en pesos mexicanos, fotos (a mano o detectadas automáticamente desde el enlace), inicio de sesión con Google y sincronización en la nube. Funciona sin internet en todo momento: lo que crees o edites sin conexión se sube solo en cuanto vuelve a haber internet.

## Funcionalidad

- **Categorías = tus propias etiquetas.** Tú decides ("Ropa deportiva", "Regalos", "Tecnología"...) y dentro de cada una guardas productos de cualquier tienda.
- **Tienda por producto** (Amazon, Shein, AliExpress, Otros o las que tú añadas) — se muestra en la tarjeta y puedes filtrar por ella dentro de cada categoría con la segunda fila de pestañas.
- Precios en **pesos mexicanos (MXN)**.
- Fotos: puedes subirlas a mano, o pulsar "Obtener fotos del enlace" para intentar detectarlas automáticamente a partir de la página del producto (ver limitaciones más abajo). Carrusel grande y deslizable al abrir el detalle de una compra.
- Total pendiente calculado automáticamente, marcar como comprado, editar y eliminar.
- **Inicio de sesión con Google** y guardado en la nube (Firestore): tus compras quedan ligadas a tu cuenta y disponibles en cualquier dispositivo donde inicies sesión.
- **Funciona sin internet**: con o sin sesión iniciada puedes abrir la app, crear, editar y marcar compras sin conexión. Si has iniciado sesión, en cuanto vuelva la conexión todo se sincroniza solo con la nube (no hace falta hacer nada).
- Si usas la app sin cuenta, todo se guarda solo en este dispositivo (como antes). Si luego inicias sesión y ya tenías compras guardadas localmente, la app te ofrece subirlas a tu cuenta con un botón.

## Antes de compilar: configurar Firebase (una sola vez)

El bloque de configuración de Firebase que diste ya está integrado en el código (`src/firebase.js`). Para que el inicio de sesión con Google funcione de verdad dentro del APK (no solo en un navegador normal), hacen falta unos pasos en la consola de Firebase que **solo tú puedes hacer** porque requieren acceso a tu proyecto:

1. Entra a la [consola de Firebase](https://console.firebase.google.com/) → proyecto **glosa-34df0**.
2. **Authentication → Sign-in method** → habilita el proveedor **Google**.
3. **Firestore Database** → créala (si no existe) → pestaña **Reglas** → pega exactamente la regla que ya nos diste:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```
4. **Configuración del proyecto (⚙️) → tus apps → Añadir app → Android**:
   - Nombre del paquete: `com.miscompras.app`
   - Huella SHA-1: `59:6A:0B:55:54:FF:E2:13:3B:E7:07:74:16:83:E4:40:72:F3:A6:E7`
     (es la huella de un keystore de depuración fijo que ya está incluido en este repo en `keystore/debug.keystore`, para que la huella no cambie entre builds de GitHub Actions).
   - Al terminar, Firebase te deja **descargar `google-services.json`**.
5. Coloca ese `google-services.json` en la **raíz del repositorio** (al lado de `package.json`) y súbelo a GitHub. El workflow lo copia solo al lugar correcto en cada build.

Si te saltas estos pasos, el APK se compila igual y todo lo demás funciona — solo el botón "Iniciar sesión" no podrá completarse hasta que los hagas.

## Cómo subirlo a GitHub y generar el APK

1. Sube esta carpeta completa a un repositorio nuevo (incluyendo `.github/workflows/`, `keystore/` y, cuando lo tengas, `google-services.json` en la raíz).
2. Pestaña **Actions** → el workflow "Build APK" corre solo con cada push a `main`, o lo lanzas a mano con "Run workflow".
3. Descarga el artefacto `mis-compras-apk` al terminar → dentro está `app-debug.apk`.
4. Instálalo en tu Android (permite "orígenes desconocidos" la primera vez).

## Limitaciones a tener en cuenta

- **Fotos automáticas**: se intentan obtener leyendo las etiquetas `og:image` de la página del producto a través de un proxy público (`allorigins.win`). Muchas tiendas bloquean este tipo de peticiones o cargan las fotos con JavaScript, así que no siempre encontrará algo — en ese caso simplemente añade las fotos a mano, como antes. No depende de ningún servidor propio, así que si ese proxy público cae o cambia, esta función concreta puede dejar de funcionar sin afectar al resto de la app.
- **Firestore y tamaño de fotos**: cada compra se guarda como un documento de Firestore (límite de 1&nbsp;MB por documento). Las fotos que subes a mano se comprimen automáticamente, pero evita añadir muchísimas fotos de alta resolución a una sola compra.
- **Google Sign-In nativo**: usa el plugin `@capacitor-firebase/authentication`, que inicia sesión con el SDK nativo de Google (necesario porque Google bloquea el login dentro de un WebView embebido) y después conecta esa sesión con el SDK web de Firebase para que Firestore funcione. Si tras compilar el login da algún error, revisa primero que los 4 pasos de la sección Firebase estén hechos correctamente — son la causa más común.
- El APK es una build "debug": se instala y usa sin problema, pero no está firmada para publicarse en Google Play.

## Desarrollo local (opcional)

```bash
npm install
npm run build          # genera www/app.bundle.js con esbuild
npx cap add android
npx capacitor-assets generate --android
node scripts/patch-android.mjs   # solo si ya tienes google-services.json
npx cap sync android
npx cap open android
```

El icono se genera a partir de `resources/icon.png`, `resources/icon-foreground.png` y `resources/icon-background.png`. Si quieres cambiar el diseño, sustituye esos tres archivos (1024x1024) y vuelve a ejecutar `npx capacitor-assets generate --android`, o simplemente haz push a GitHub, que lo regenera solo en cada build.
