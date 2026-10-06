# P&R Flaco's · Carta digital

Menú digital de la pizzería P&R Flaco's, pensado para abrirse desde un código QR en el celular.

- `index.html`: la carta completa (precios, buscador, "Mi pedido" y visor 3D).
- `fotos/`: las 60 fotos de los platos. Cada plato tiene tres archivos: `<id>.webp` (alta resolución para el visor 3D), `<id>-m.webp` (tarjetas) y `<id>-d.webp` (mapa de profundidad para el efecto 3D).

Para cambiar precios, edita el bloque `MENU` dentro de `index.html`.

Para publicarla gratis: en GitHub ve a **Settings → Pages**, elige la rama `main` y la carpeta `/ (root)`. El enlace queda en `https://proyectosiabipa-stack.github.io/pizza-flaco/` y con ese enlace generas el QR.
