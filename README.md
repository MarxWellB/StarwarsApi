# SWAPI Relational Explorer

Buscador de personajes de Star Wars con **React + fetch**, **debounce**, **paginación**, **drawer de detalle**, **prefetch** y **cache** (memoria + localStorage).  
Datos: mirror **https://swapi.py4e.com/api/** (evita errores de certificado).

## Características
- Búsqueda con debounce (400 ms)
- Panel de detalle en **drawer** lateral (se abre al seleccionar)
- Relaciones: **homeworld**, **films** (ordenados), **starships**, **co-cast**
- Prefetch en hover y caché ligera con SWR-like
- Accesible (aria, foco, Esc para cerrar)

## Requisitos
- Node 18+

## Scripts
```bash
npm install
npm run dev    # desarrollo
npm run build  # producción
npm run preview
