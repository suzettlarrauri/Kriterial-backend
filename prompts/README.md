# Registro de prompts

Fuente única de los prompts de Kriterial. Ningún prompt se escribe dentro del código.

- `manifest.json` lista cada prompt (`id@versión`), su archivo, su **SHA-256** y su procedencia,
  y define qué prompts componen cada etapa (`prefix` estable + `module` de la etapa).
- La aplicación verifica los hashes al arrancar. **Un prompt versionado es inmutable**: para
  cambiarlo se crea una versión nueva (p. ej. `b1/v2.3/...`) con su entrada en el manifiesto.
- Cada ejecución registra el `bundleHash` de la combinación usada (tabla `prompt_bundles`).

Para añadir una versión nueva: crear el archivo, añadir la entrada con `"sha256": ""` y ejecutar
`npm run prompts:hash`, que solo rellena hashes vacíos (nunca reescribe los existentes).

Los prompts B1 v2.2 provienen de `Kriterial_B1_Contexto_v2_2_DESCARGA.docx` y deben cambiar
solo con aprobación de la responsable metodológica.
