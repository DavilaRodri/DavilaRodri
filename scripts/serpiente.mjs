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

// Recorrido en zigzag por columnas, pasando por todas las celdas existentes
const porCol = {};
celdas.forEach(c => (porCol[c.x] ||= []).push(c));
// (las semanas a medias se rellenan con huecos para que no haya saltos)
const ruta = [];
for (let x = 0; x < cols; x++) {
  const filas = [0, 1, 2, 3, 4, 5, 6];
  if (x % 2) filas.reverse();
  filas.forEach(y => ruta.push((porCol[x] || []).find(c => c.y === y) || { x, y, n: 0, hueco: true }));
}
// Entra por la izquierda y sale por la derecha
// (todos los tramos miden una celda, así el avance es uniforme)
const ultima = ruta[ruta.length - 1], salidaPts = [];
for (let k = 1; k <= MAX + 2; k++) salidaPts.push(pos(ultima.x + k, ultima.y));
const puntos = [pos(-1, ruta[0].y), ...ruta.map(c => pos(c.x, c.y)), ...salidaPts];
const d = 'M' + puntos.map(p => p.join(' ')).join(' L');
const largoRuta = puntos.length - 1;          // en celdas

// Momento en que la cabeza llega a cada celda (en pasos)
const comidas = [];
ruta.forEach((c, i) => { if (c.n > 0) comidas.push({ c, paso: i + 1 }); });
const segmentos = Math.min(MAX, comidas.length) + 1;   // cabeza + uno por comida
const total = (largoRuta + segmentos) * PASO + 1;      // + pausa al final
const pct = s => (Math.min(100, (s * PASO / total) * 100)).toFixed(3) + '%';

let css = `.s{offset-path:path('${d}');offset-rotate:0deg;animation-duration:${total.toFixed(2)}s;animation-iteration-count:infinite;animation-timing-function:linear}`;
let cuerpo = '';
for (let k = 0; k < segmentos; k++) {
  // El segmento k va k celdas por detrás de la cabeza y aparece al comer la comida k
  const ini = k, fin = k + largoRuta, aparece = k === 0 ? 0 : comidas[k - 1].paso;
  css += `@keyframes s${k}{0%{offset-distance:0%;opacity:0}${pct(ini)}{offset-distance:0%;opacity:${k ? 0 : 1}}${k ? `${pct(aparece)}{opacity:0}${pct(aparece + 0.01)}{opacity:1}` : ''}${pct(fin)}{offset-distance:100%;opacity:1}${pct(fin + 0.01)}{opacity:0}100%{offset-distance:100%;opacity:0}}`;
  css += `.s${k}{animation-name:s${k}}`;
  const tam = k === 0 ? 12 : Math.max(6, 11 - k * 0.08);
  const color = k === 0 ? '#22e4ff' : `hsl(${320 - Math.min(k, 40) * 1.5},100%,${62 - Math.min(k, 40) * 0.3}%)`;
  cuerpo = `<rect class="s s${k}" x="${-tam / 2}" y="${-tam / 2}" width="${tam}" height="${tam}" rx="3" fill="${color}"/>` + cuerpo;
}
// Las celdas verdes se apagan cuando la cabeza pasa por encima y vuelven al reiniciar
let rejilla = '';
celdas.forEach(c => {
  const [cx, cy] = pos(c.x, c.y);
  const base = `x="${cx - T / 2}" y="${cy - T / 2}" width="${T}" height="${T}" rx="2"`;
  if (!c.n) { rejilla += `<rect ${base} fill="${VERDES[0]}"/>`; return; }
  const i = ruta.indexOf(c) + 1, id = `c${c.x}_${c.y}`;
  css += `@keyframes ${id}{0%,${pct(i)}{fill:${VERDES[c.n]}}${pct(i + 0.2)},99.9%{fill:${VERDES[0]}}}.${id}{animation:${id} ${total.toFixed(2)}s linear infinite}`;
  rejilla += `<rect class="${id}" ${base} fill="${VERDES[c.n]}"/>`;
});
css += `@media (prefers-reduced-motion:reduce){*{animation:none!important}.s{opacity:0}}`;

const W = M * 2 + cols * C, H = M * 2 + 7 * C;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><style>${css}</style>${rejilla}<g>${cuerpo}</g></svg>`;
mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, svg);
console.log(`ok: ${comidas.length} comidas, ${segmentos} segmentos, ${total.toFixed(1)}s, ${svg.length} bytes`);
