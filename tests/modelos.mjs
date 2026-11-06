// Carga el núcleo físico de cada simulador directamente desde su HTML, sin navegador.
// Cada núcleo está entre dos marcas de comentario fijas; si alguien mueve una marca, la prueba falla.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const raiz = fileURLToPath(new URL('..', import.meta.url));

function bloque(archivo, desde, hasta) {
  const s = readFileSync(raiz + archivo, 'utf8');
  const i = s.indexOf(desde), j = s.indexOf(hasta, i + 1);
  if (i < 0 || j < 0) throw new Error(`No encuentro las marcas del núcleo físico en ${archivo}`);
  return s.slice(i, j);
}

function funcion(archivo, nombre) {
  const s = readFileSync(raiz + archivo, 'utf8');
  const m = s.match(new RegExp(`function ${nombre}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`));
  if (!m) throw new Error(`No encuentro la función ${nombre} en ${archivo}`);
  return m[0];
}

function cargar(codigo, exporta) {
  const ctx = { Math, console, Float64Array };
  vm.createContext(ctx);
  vm.runInContext(`"use strict";\n${codigo}\nthis.api={${exporta}};`, ctx);
  return ctx.api;
}

export const dron = () => cargar(
  bloque('drone_3d/cuadricoptero.html', '/* ═════════════ Parámetros físicos', '/* ═════════════ Escena 3D') +
  funcion('drone_3d/cuadricoptero.html', 'zetaEff'),
  `get X(){return X}, step, resetState, G, ENV, DEF_GAINS, zetaEff, TAU_M, DT, rp`);

export const robot = () => cargar(
  bloque('robot_balancin/robot.html', 'const g=9.81, DT=0.002', '/* ═════════════ Estado'),
  `makeParams, linearize, lqr, poles, ROB, LQ, accel`);

export const bombeo = () => cargar(
  bloque('bombeo_mecanico/bombeo.html', 'const g=9.81, BBL', '/* ═════════════ Estado de la simulación'),
  `makeModel, makeState, settle, stepModel, BBL`);

export const evaporador = () => cargar(
  bloque('evaporador_jugo/evaporador.html', 'const NE=5', 'const DT=0.5;'),
  `makePlant, makeState, energy, step, bpe, tsat, psat, PL, ST`);
