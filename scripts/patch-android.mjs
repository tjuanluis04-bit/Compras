// Conecta el proyecto Android generado por Capacitor con Firebase:
// copia google-services.json (si ya lo añadiste al repo) y aplica el plugin
// de Gradle necesario para que el login con Google funcione de forma nativa.
// android/ se regenera en cada build de CI, así que este parche se re-aplica
// siempre después de "cap add android".
import fs from "fs";
import path from "path";

const root = process.cwd();
const googleServicesSrc = path.join(root, "google-services.json");
const googleServicesDest = path.join(root, "android", "app", "google-services.json");
const projectGradle = path.join(root, "android", "build.gradle");
const appGradle = path.join(root, "android", "app", "build.gradle");

if (!fs.existsSync(googleServicesSrc)) {
  console.log("⚠️  No se encontró google-services.json en la raíz del proyecto.");
  console.log("    El APK se compilará igual, pero el inicio de sesión con Google no funcionará");
  console.log("    hasta que añadas ese archivo (revisa el README, sección Firebase).");
  process.exit(0);
}

fs.copyFileSync(googleServicesSrc, googleServicesDest);
console.log("✔ google-services.json copiado a android/app/");

let projectGradleText = fs.readFileSync(projectGradle, "utf8");
if (!projectGradleText.includes("com.google.gms:google-services")) {
  projectGradleText = projectGradleText.replace(
    /dependencies\s*{/,
    "dependencies {\n        classpath 'com.google.gms:google-services:4.4.2'"
  );
  fs.writeFileSync(projectGradle, projectGradleText);
  console.log("✔ Plugin de Google Services añadido a android/build.gradle");
}

let appGradleText = fs.readFileSync(appGradle, "utf8");
if (!appGradleText.includes("com.google.gms.google-services")) {
  appGradleText += "\napply plugin: 'com.google.gms.google-services'\n";
  fs.writeFileSync(appGradle, appGradleText);
  console.log("✔ Plugin de Google Services aplicado en android/app/build.gradle");
}
