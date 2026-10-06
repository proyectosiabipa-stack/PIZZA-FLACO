# P&R Flaco's · Carta digital

Menú digital de la pizzería P&R Flaco's, pensado para abrirse desde un código QR en el celular.

- `index.html`: la carta completa (precios, buscador, "Mi pedido" y visor 3D).
- `fotos/`: las 60 fotos de los platos en varias versiones: `<id>.webp` (alta resolución), `<id>-m.webp` y `<id>-s.webp` (tarjetas, según la pantalla), `<id>-d.webp` (mapa de profundidad). Las pizzas redondas tienen además `<id>-top.webp` (vista cenital) y `<id>-r.webp` (relieve), que forman su modelo 3D.
- `vendor/viewer3d.js`: visor 3D (Three.js empaquetado). Su código legible está en `vendor/viewer3d.src.js`.

**Visor 3D:** las 18 pizzas redondas son modelos 3D completos (masa, borde y tabla) que se pueden girar 360°, acercar y mover. El resto de platos se muestra en relieve 3D con giro limitado, porque de una sola foto no se puede reconstruir la parte de atrás.

Para cambiar precios, edita el bloque `MENU` dentro de `index.html`.

Para publicarla gratis: en GitHub ve a **Settings → Pages**, elige la rama `main` y la carpeta `/ (root)`. El enlace queda en `https://proyectosiabipa-stack.github.io/PIZZA-FLACO/` y con ese enlace generas el QR.
