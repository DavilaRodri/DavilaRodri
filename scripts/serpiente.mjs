// Serpiente neón que recorre el gráfico de contribuciones y crece con cada día que se come.
// Uso: node scripts/serpiente.mjs datos.json salida.svg
// datos.json = respuesta de la API GraphQL de GitHub con contributionCalendar.weeks[].contributionDays[]
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const [, , entrada, salida] = process.argv;
const json = JSON.parse(readFileSync(entrada, 'utf8'));
const semanas = json.data.user.contributionsCollection.contributionCalendar.weeks;

const C = 14, T = 11, M = 16;                 // paso de celda, tamaño de celda, margen
const PASO = 0.07;                            // segundos por celda
const MAX = 60;                               // largo máximo de la serpiente
const NIVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const VERDES = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];

// Rejilla: columna = semana, fila = día de la semana
const celdas = [];
semanas.forEach((s, x) => s.contributionDays.forEach(d => celdas.push({ x, y: d.weekday, n: NIVEL[d.contributionLevel] ?? 0 })));
const cols = semanas.length;
const pos = (x, y) => [M + x * C + T / 2, M + y * C + T / 2];

// Recorrido como la serpiente clásica: primero se come los días con pocas contribuciones
// (verde claro) y acaba con los de muchas (verde oscuro). Va siempre al más cercano de
// cada nivel, celda a celda, rodeando los que aún no le toca comer.
const celda = (x, y) => celdas.find(c => c.x === x && c.y === y);
const comido = new Set();
let cab = { x: -1, y: 0 };
const pasos = [cab];                          // posiciones de la cabeza, una celda por paso
const comidas = [];                           // { c, paso } en orden
const pasoDe = new Map();
const dentro = (x, y) => x >= -1 && x <= cols && y >= 0 && y <= 6;
const camino = (desde, objetivo, nivel) => {   // BFS; null si no hay camino
  const clave = (x, y) => x + ',' + y, prev = new Map([[clave(desde.x, desde.y), null]]);
  const cola = [desde];
  while (cola.length) {
    const p = cola.shift();
    if (objetivo(p)) {
      const r = [];
      for (let q = p; q; q = prev.get(clave(q.x, q.y))) r.unshift(q);
      return r.slice(1);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx, y = p.y + dy, k = clave(x, y);
      if (!dentro(x, y) || prev.has(k)) continue;
      const c = celda(x, y);
      // No pisa días más oscuros que aún no le tocan (salvo que no haya otra)
      if (nivel && c && c.n > nivel && !comido.has(c)) continue;
      prev.set(k, p);
      cola.push({ x, y });
    }
  }
  return null;
};
for (let nivel = 1; nivel <= 4; nivel++) {
  for (;;) {
    const quedan = celdas.filter(c => c.n === nivel && !comido.has(c));
    if (!quedan.length) break;
    const esObjetivo = p => { const c = celda(p.x, p.y); return c && c.n === nivel && !comido.has(c); };
    const r = camino(cab, esObjetivo, nivel) || camino(cab, esObjetivo, 0);
    pasos.push(...r);
    cab = r[r.length - 1];
    const c = celda(cab.x, cab.y);
    comido.add(c);
    comidas.push({ c, paso: pasos.length - 1 });
    pasoDe.set(c, pasos.length - 1);
  }
}
// Sale por la derecha y sigue recto hasta que entra toda la cola
const fuera = camino(cab, p => p.x === cols, 0) || [];
pasos.push(...fuera);
cab = pasos[pasos.length - 1];
for (let k = 1; k <= MAX + 2; k++) pasos.push({ x: cab.x + k, y: cab.y });
const puntos = pasos.map(p => pos(p.x, p.y));
const d = 'M' + puntos.map(p => p.join(' ')).join(' L');
const largoRuta = puntos.length - 1;          // en celdas

const segmentos = Math.min(MAX, comidas.length) + 1;   // cabeza + uno por comida
const total = (largoRuta + segmentos) * PASO + 1;      // + pausa al final
const fr = s => Math.min(1, (s * PASO) / total).toFixed(4);   // fracción del ciclo
const dur = `dur="${total.toFixed(2)}s" repeatCount="indefinite"`;

// Animación SMIL (no CSS): funciona en todos los navegadores y en la app de GitHub,
// y no la apaga la opción de "reducir movimiento" del sistema.
let cuerpo = '';
for (let k = 0; k < segmentos; k++) {
  // El segmento k va k celdas por detrás de la cabeza y aparece al comer la comida k
  const ini = k, fin = k + largoRuta, aparece = k === 0 ? 0 : comidas[k - 1].paso;
  const mov = `<animateMotion ${dur} calcMode="linear" keyPoints="0;0;1;1" keyTimes="0;${fr(ini)};${fr(fin)};1"><mpath href="#r"/></animateMotion>`;
  const vis = k === 0
    ? `<animate attributeName="opacity" values="1;0" keyTimes="0;${fr(fin + 0.01)}" calcMode="discrete" ${dur}/>`
    : `<animate attributeName="opacity" values="0;1;0" keyTimes="0;${fr(aparece)};${fr(fin + 0.01)}" calcMode="discrete" ${dur}/>`;
  const tam = k === 0 ? 12 : Math.max(6, 11 - k * 0.08);
  const color = k === 0 ? '#22e4ff' : `hsl(${320 - Math.min(k, 40) * 1.5},100%,${62 - Math.min(k, 40) * 0.3}%)`;
  cuerpo = `<rect x="${-tam / 2}" y="${-tam / 2}" width="${tam}" height="${tam}" rx="3" fill="${color}" opacity="0">${mov}${vis}</rect>` + cuerpo;
}
// Las celdas verdes se apagan cuando la cabeza pasa por encima y vuelven al reiniciar
let rejilla = '';
celdas.forEach(c => {
  const [cx, cy] = pos(c.x, c.y);
  const base = `x="${cx - T / 2}" y="${cy - T / 2}" width="${T}" height="${T}" rx="2"`;
  if (!c.n) { rejilla += `<rect ${base} fill="${VERDES[0]}"/>`; return; }
  const i = pasoDe.get(c);
  rejilla += `<rect ${base} fill="${VERDES[c.n]}"><animate attributeName="fill" values="${VERDES[c.n]};${VERDES[0]}" keyTimes="0;${fr(i + 0.2)}" calcMode="discrete" ${dur}/></rect>`;
});

const W = M * 2 + cols * C, H = M * 2 + 7 * C;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><path id="r" d="${d}"/></defs>${rejilla}<g>${cuerpo}</g></svg>`;
mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, svg);
console.log(`ok: ${comidas.length} comidas, ${segmentos} segmentos, ${total.toFixed(1)}s, ${svg.length} bytes`);
