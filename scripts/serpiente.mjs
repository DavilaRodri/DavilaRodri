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
// cada nivel, celda a celda, rodeando los que aún no le toca comer y sin pisarse.
const celda = (x, y) => celdas.find(c => c.x === x && c.y === y);
const comido = new Set();
let cab = { x: -1, y: 0 };
const pasos = [cab];                          // posiciones de la cabeza, una celda por paso
const comidas = [];                           // { c, paso } en orden
const pasoDe = new Map();
const dentro = (x, y) => x >= -1 && x <= cols && y >= 0 && y <= 6;
const clave = (x, y) => x + ',' + y;
// Cuánto tarda en quedar libre cada celda del cuerpo (la cola se libera en el siguiente paso)
const ocupadas = () => {
  const largo = Math.min(MAX, comidas.length), m = new Map();
  for (let j = 1; j <= largo && pasos.length - 1 - j >= 0; j++) {
    const p = pasos[pasos.length - 1 - j];
    m.set(clave(p.x, p.y), Math.max(m.get(clave(p.x, p.y)) || 0, largo - j + 1));
  }
  return m;
};
// BFS por tiempo: solo entra en una celda del cuerpo cuando ya habrá pasado la cola
const camino = (desde, objetivo, nivel, cuerpo, vetadas) => {   // null si no hay camino
  const prev = new Map([[clave(desde.x, desde.y), null]]);
  const cola = [{ ...desde, t: 0 }];
  while (cola.length) {
    const p = cola.shift();
    if (p.t > 0 && objetivo(p)) {
      const r = [];
      for (let q = p; q; q = prev.get(clave(q.x, q.y))) r.unshift({ x: q.x, y: q.y });
      return r.slice(1);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx, y = p.y + dy, k = clave(x, y);
      if (!dentro(x, y) || prev.has(k)) continue;
      if (cuerpo && (cuerpo.get(k) || 0) > p.t + 1) continue;
      if (vetadas && vetadas.has(k) && !objetivo({ x, y })) continue;
      const c = celda(x, y);
      // No pisa días más oscuros que aún no le tocan
      if (nivel && c && c.n > nivel && !comido.has(c)) continue;
      prev.set(k, p);
      cola.push({ x, y, t: p.t + 1 });
    }
  }
  return null;
};
// Si no hay camino directo, busca uno más largo (dando vueltas) que tampoco pise el cuerpo:
// BFS en el tiempo, comprobando que no cruza su propio rastro reciente
const caminoLargo = (desde, objetivo, nivel, cuerpo, vetadas) => {
  const largo = Math.min(MAX, comidas.length), vistos = new Set();
  const cola = [{ x: desde.x, y: desde.y, t: 0, prev: null }];
  for (let i = 0; i < cola.length; i++) {
    const p = cola[i];
    if (p.t > 0 && objetivo(p)) {
      const r = [];
      for (let q = p; q.prev; q = q.prev) r.unshift({ x: q.x, y: q.y });
      return r;
    }
    if (p.t >= 160) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx, y = p.y + dy, k = clave(x, y), v = k + ',' + (p.t + 1);
      if (!dentro(x, y) || vistos.has(v)) continue;
      if ((cuerpo.get(k) || 0) > p.t + 1) continue;
      if (vetadas && vetadas.has(k) && !objetivo({ x, y })) continue;
      const c = celda(x, y);
      if (nivel && c && c.n > nivel && !comido.has(c)) continue;
      let pisa = false;
      for (let q = p, j = 0; q && j < largo; q = q.prev, j++) if (q.x === x && q.y === y) { pisa = true; break; }
      if (pisa) continue;
      vistos.add(v);
      cola.push({ x, y, t: p.t + 1, prev: p });
    }
  }
  return null;
};
// Prueba primero lo más estricto y va relajando si no hay salida
const ir = (objetivo, nivel, vetadas) => {
  const cuerpo = ocupadas();
  return camino(cab, objetivo, nivel, cuerpo, vetadas) || caminoLargo(cab, objetivo, nivel, cuerpo, vetadas)
    || caminoLargo(cab, objetivo, 0, cuerpo, vetadas) || caminoLargo(cab, objetivo, 0, cuerpo)
    || camino(cab, objetivo, 0) || [];
};

for (let nivel = 1; nivel <= 4; nivel++) {
  for (;;) {
    if (!celdas.some(c => c.n === nivel && !comido.has(c))) break;
    // Elige el más cercano, salvo que comérselo la deje encerrada en su propio cuerpo
    const descartadas = new Set(), cab0 = cab, n0 = pasos.length;
    let primera = null;
    for (let intento = 0; intento < 10; intento++) {
      const r = ir(p => { const c = celda(p.x, p.y); return c && c.n === nivel && !comido.has(c) && !descartadas.has(c); }, nivel);
      if (!r.length) break;
      const c = celda(r[r.length - 1].x, r[r.length - 1].y);
      primera ||= r;
      pasos.push(...r);
      cab = pasos[pasos.length - 1];
      comidas.push({ c, paso: pasos.length - 1 });
      if (caminoLargo(cab, p => p.t >= Math.min(MAX, comidas.length), 0, ocupadas())) { comidas.pop(); break; }
      comidas.pop();
      pasos.length = n0;
      cab = cab0;
      descartadas.add(c);
    }
    if (pasos.length === n0) { pasos.push(...primera); cab = pasos[pasos.length - 1]; }
    const c = celda(cab.x, cab.y);
    comido.add(c);
    comidas.push({ c, paso: pasos.length - 1 });
    pasoDe.set(c, pasos.length - 1);
  }
}
const segmentos = Math.min(MAX, comidas.length) + 1;   // cabeza + uno por comida

// Final: con todo comido, la serpiente escribe "RD" en el centro y se queda posando.
// Trazo continuo celda a celda (x, y relativos a la letra), sin repetir celdas.
const R = [[0,6],[0,5],[0,4],[0,3],[0,2],[0,1],[0,0],[1,0],[2,0],[3,0],[4,0],[4,1],[4,2],[4,3],
  [3,3],[2,3],[1,3],[1,4],[2,4],[2,5],[3,5],[3,6],[4,6]];
const D = [[7,6],[7,5],[7,4],[7,3],[7,2],[7,1],[7,0],[8,0],[9,0],[10,0],[10,1],[11,1],[11,2],
  [11,3],[11,4],[11,5],[10,5],[10,6],[9,6],[8,6]];
// Cuenta las veces que la cabeza entra en una celda ocupada por el cuerpo desde el paso i0
const pisadasDesde = (lista, i0) => lista.filter((p, i) => i > i0 && lista.slice(Math.max(0, i - Math.min(MAX, comidas.filter(c => c.paso < i).length)), i - 1).some(q => q.x === p.x && q.y === p.y)).length;
// Prueba a escribirlas en varias posiciones, del centro hacia fuera, y se queda con la que no se pisa
const centro = Math.floor((cols - 12) / 2), base = pasos.length - 1;
let mejor = null;
for (const x0 of [...Array(Math.max(1, cols - 13)).keys()].map(i => i + 1).sort((a, b) => Math.abs(a - centro) - Math.abs(b - centro))) {
  const trazo = [...R, [5, 6], [6, 6], ...D].map(([x, y]) => ({ x: x0 + x, y }));
  const vetadas = new Set(trazo.map(t => clave(t.x, t.y)));
  const llegada = ir(p => p.x === trazo[0].x && p.y === trazo[0].y, 0, vetadas);
  const prueba = [...pasos, ...llegada, ...trazo.slice(1)];
  const n = pisadasDesde(prueba, base);
  if (!mejor || n < mejor.n) mejor = { n, x0, trazo, llegada };
  if (n === 0) break;
}
const { x0, trazo } = mejor;
const enLetra = new Set([...R, ...D].map(([x, y]) => clave(x0 + x, y)));
pasos.push(...mejor.llegada);
const empiezaLetras = pasos.length - 1;
pasos.push(...trazo.slice(1));
const L = pasos.length - 1;                   // en celdas

const puntos = pasos.map(p => pos(p.x, p.y));
const d = 'M' + puntos.map(p => p.join(' ')).join(' L');
const POSE = 3.5, FUNDIDO = 0.6;
const total = L * PASO + POSE + FUNDIDO;
const fr = s => Math.min(1, (s * PASO) / total).toFixed(4);   // fracción del ciclo
const frT = t => Math.min(1, t / total).toFixed(4);
const dur = `dur="${total.toFixed(2)}s" repeatCount="indefinite"`;

// Animación SMIL (no CSS): funciona en todos los navegadores y en la app de GitHub,
// y no la apaga la opción de "reducir movimiento" del sistema.
let cuerpo = '';
for (let k = 0; k < segmentos; k++) {
  // El segmento k va k celdas por detrás de la cabeza, aparece al comer la comida k
  // y se para donde acaba (la cola que no cabe en las letras se recoge al llegar)
  const aparece = k === 0 ? 0 : comidas[k - 1].paso;
  const fin = (L - k) / L;
  const mov = `<animateMotion ${dur} calcMode="linear" keyPoints="0;0;${fin.toFixed(4)};${fin.toFixed(4)}" keyTimes="0;${fr(k)};${fr(L)};1"><mpath href="#r"/></animateMotion>`;
  const p = pasos[L - k], sobra = !enLetra.has(clave(p.x, p.y)) && k > 0;
  const vis = k === 0 ? '' : sobra
    ? `<animate attributeName="opacity" values="0;1;0" keyTimes="0;${fr(aparece)};${fr(Math.max(aparece + 1, L - k))}" calcMode="discrete" ${dur}/>`
    : `<animate attributeName="opacity" values="0;1" keyTimes="0;${fr(aparece)}" calcMode="discrete" ${dur}/>`;
  const tam = k === 0 ? 12 : Math.max(6, 11 - k * 0.08);
  const color = k === 0 ? '#22e4ff' : `hsl(${320 - Math.min(k, 40) * 1.5},100%,${62 - Math.min(k, 40) * 0.3}%)`;
  cuerpo = `<rect x="${-tam / 2}" y="${-tam / 2}" width="${tam}" height="${tam}" rx="3" fill="${color}" opacity="${k ? 0 : 1}">${mov}${vis}</rect>` + cuerpo;
}
// Las letras se quedan pintadas por donde pasa la cabeza (por si la serpiente es corta)
let letras = '';
trazo.forEach((t, i) => {
  if (!enLetra.has(clave(t.x, t.y))) return;
  const [cx, cy] = pos(t.x, t.y);
  letras += `<rect x="${cx - T / 2}" y="${cy - T / 2}" width="${T}" height="${T}" rx="2" fill="#7a2bff" opacity="0"><animate attributeName="opacity" values="0;1" keyTimes="0;${fr(empiezaLetras + i)}" calcMode="discrete" ${dur}/></rect>`;
});
// Las celdas verdes se apagan cuando la cabeza pasa por encima y vuelven al reiniciar
let rejilla = '';
celdas.forEach(c => {
  const [cx, cy] = pos(c.x, c.y);
  const base = `x="${cx - T / 2}" y="${cy - T / 2}" width="${T}" height="${T}" rx="2"`;
  if (!c.n) { rejilla += `<rect ${base} fill="${VERDES[0]}"/>`; return; }
  const i = pasoDe.get(c);
  rejilla += `<rect ${base} fill="${VERDES[c.n]}"><animate attributeName="fill" values="${VERDES[c.n]};${VERDES[0]}" keyTimes="0;${fr(i + 0.2)}" calcMode="discrete" ${dur}/></rect>`;
});
// Tras la pose, la serpiente y las letras se desvanecen y todo vuelve a empezar
const fundido = `<animate attributeName="opacity" values="1;1;0;0" keyTimes="0;${frT(L * PASO + POSE)};${frT(total - 0.05)};1" ${dur}/>`;

const W = M * 2 + cols * C, H = M * 2 + 7 * C;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><path id="r" d="${d}"/></defs>${rejilla}<g>${letras}${cuerpo}${fundido}</g></svg>`;
mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, svg);
const pisadas = pisadasDesde(pasos, 0);
console.log(`pisadas: ${pisadas}`);
console.log(`ok: ${comidas.length} comidas, ${segmentos} segmentos, ${total.toFixed(1)}s, ${svg.length} bytes`);
