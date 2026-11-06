// Pruebas de fenomenología: cada simulador tiene que reproducir los resultados que describe su README.
// Se corren con:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { dron, robot, bombeo, evaporador } from './modelos.mjs';

const deg = r => r * 180 / Math.PI;
const cerca = (v, ref, tol, msg) => assert.ok(Math.abs(v - ref) <= tol, `${msg}: ${v} (esperado ${ref} ± ${tol})`);

/* ───────────── Cuadricóptero ───────────── */
function volar(D, s) { const n = Math.round(s / D.DT); for (let i = 0; i < n; i++) D.step(D.DT); }

test('dron: vuelo estacionario estable a 2,5 m', () => {
  const D = dron(); D.resetState(2.5); volar(D, 5);
  cerca(D.X.p[2], 2.5, 0.01, 'altura');
  assert.ok(Math.abs(deg(D.X.eta[0])) < 0.5 && Math.abs(deg(D.X.eta[1])) < 0.5, 'queda nivelado');
});

test('dron: el integral de altura compensa una carga desconocida', () => {
  const D = dron(); D.resetState(2.5); D.ENV.payload = 0.8; volar(D, 25);
  cerca(D.X.p[2], 2.5, 0.05, 'altura con 0,8 kg');
});

test('dron: límite de estabilidad por el retardo del motor (K_d > τ_m·K_p)', () => {
  const D = dron();
  cerca(D.zetaEff(180, 22), 0.40, 0.02, 'ζ efectivo de fábrica');
  cerca(D.zetaEff(180, 11), 0.15, 0.02, 'ζ efectivo de la demo');
  assert.ok(D.zetaEff(180, 6) < 0, 'K_d = 6 queda del lado inestable');
});

test('dron: con K_d = 11 se recupera de un empujón', () => {
  const D = dron(); D.resetState(2.5); D.G.kda = 11; D.X.w[0] += 3; D.X.w[2] += 1; volar(D, 4);
  assert.ok(!D.X.crashed, 'no choca');
  assert.ok(Math.abs(deg(D.X.eta[0])) < 2 && Math.abs(deg(D.X.eta[1])) < 2, 'vuelve a nivelarse');
});

test('dron: inestable, choca y desarma los motores (no gira en el piso)', () => {
  const D = dron(); D.resetState(2.5); D.G.kda = 4; D.X.w[0] += 3; volar(D, 6);
  assert.ok(D.X.crashed, 'detecta el choque');
  assert.ok(Math.max(...D.X.Om) < 50, 'motores casi detenidos');
  assert.equal(D.X.p[2], 0, 'queda en el piso'); assert.ok(D.X.w.every(v => v === 0), 'no gira');
});

/* ───────────── Robot balancín ───────────── */
function polosLazoAbierto(R, h) { return Math.max(...R.poles(R.linearize(R.makeParams(h, 3, 1.2)).A).map(p => p.re)); }

test('robot: más alto, el polo inestable se acerca al origen', () => {
  const R = robot();
  const p = [0.15, 0.25, 0.40].map(h => polosLazoAbierto(R, h));
  assert.ok(p[0] > p[1] && p[1] > p[2] && p[2] > 0, `polos ${p}`);
});

test('robot: el LQR estabiliza el lazo cerrado', () => {
  const R = robot(); const P = R.makeParams(0.25, 3, 1.2), L = R.linearize(P), C = R.lqr(L.A, L.B, R.LQ.Q, R.LQ.R);
  const Acl = L.A.map((r, i) => r.map((v, j) => v - L.B[i] * C.K[j]));
  assert.ok(R.poles(Acl).every(p => p.re < 0), 'todos los polos en el semiplano izquierdo');
});

function robotSim(R, { tmax = 1.2, ref = 0, kick = 0, t = 8 }) {
  const P = R.makeParams(0.25, 3, tmax), L = R.linearize(P), K = R.lqr(L.A, L.B, R.LQ.Q, R.LQ.R).K;
  const S = [0, 0, 0, kick], dt = 0.002; let xmin = 0, thmax = 0;
  for (let i = 0; i < t / dt; i++) {
    const e = [Math.max(-1, Math.min(1, S[0] - ref)), S[1], S[2], S[3]];
    let tau = -K.reduce((s, k, j) => s + k * e[j], 0); tau = Math.max(-2 * tmax, Math.min(2 * tmax, tau));
    const [xa, tha] = R.accel(P, S, tau); S[1] += xa * dt; S[0] += S[1] * dt; S[3] += tha * dt; S[2] += S[3] * dt;
    xmin = Math.min(xmin, S[0]); thmax = Math.max(thmax, Math.abs(S[2])); if (thmax > 1.15) break;
  }
  return { S, xmin, thmax };
}

test('robot: fase no mínima, retrocede unos 3 cm antes de avanzar', () => {
  const r = robotSim(robot(), { ref: 1.5 });
  assert.ok(r.xmin < -0.02 && r.xmin > -0.045, `retroceso ${(r.xmin * 100).toFixed(1)} cm`);
  cerca(r.S[0], 1.5, 0.03, 'llega a 1,5 m');
});

test('robot: con 1,2 N·m el empujón fuerte lo tira; con 3 N·m se recupera', () => {
  const R = robot();
  assert.ok(robotSim(R, { tmax: 1.2, kick: 8, t: 4 }).thmax > 1.15, 'se cae con 1,2 N·m');
  assert.ok(robotSim(R, { tmax: 3, kick: 8, t: 4 }).thmax < 1.15, 'se recupera con 3 N·m');
});

/* ───────────── Bombeo mecánico ───────────── */
function pozo(B, o = {}, ciclos = 4) {
  const M = B.makeModel(Object.assign({ Mcb: 60000 }, o)), S = B.makeState(M); B.settle(M, S);
  const T = 60 / M.spm; let tmax = -1e9, pmax = -1e9, p0 = 0, t0 = 0;
  while (S.t < ciclos * T) {
    B.stepModel(M, S, 0.001);
    if (S.t > 2 * T) { if (!t0) { t0 = S.t; p0 = S.produced; } tmax = Math.max(tmax, S.torque); pmax = Math.max(pmax, S.PRL); }
  }
  return { M, S, tmax, pmax, bpd: (S.produced - p0) / (S.t - t0) * 86400 / B.BBL };
}

test('bombeo: carga de fluido, producción y carga máxima coherentes', () => {
  const B = bombeo(); const r = pozo(B);
  const Fo = (r.M.Pdis - (r.M.Pcas + r.M.rhoF * 9.81 * r.M.hf0)) * r.M.Ap;
  cerca(Fo / 1000, 17.9, 0.2, 'F_o [kN]');
  assert.ok(r.bpd > 220 && r.bpd < 280, `producción ${r.bpd.toFixed(0)} bbl/d`);
  assert.ok(r.pmax > 60000 && r.pmax < 85000, `PPRL ${(r.pmax / 1000).toFixed(1)} kN`);
});

test('bombeo: el contrapeso define si el reductor C-320 queda dentro de su capacidad', () => {
  const B = bombeo();
  assert.ok(pozo(B, { Mcb: 60000 }).tmax < 36200, 'balanceado: dentro de 36,2 kN·m');
  assert.ok(pozo(B, { Mcb: 25000 }).tmax > 36200, 'desbalanceado: pasa la capacidad');
});

test('bombeo: una fuga en la válvula viajera reduce la producción', () => {
  const B = bombeo(); const base = pozo(B).bpd, fuga = pozo(B, { leakTV: 2 }).bpd;
  assert.ok(fuga < 0.92 * base, `con fuga ${fuga.toFixed(0)} vs ${base.toFixed(0)} bbl/d`);
});

test('bombeo: con la varilla cortada no hay producción', () => {
  const B = bombeo(); assert.ok(Math.abs(pozo(B, { parted: true }).bpd) < 5);
});

/* ───────────── Evaporador ───────────── */
function planta(E, o = {}, horas = 0.5) {
  const P = E.makePlant(o), S = E.makeState(P); S.Fbias = P.F;
  for (let i = 0; i < 3600; i++) E.step(P, S, 0.5);
  if (o.cambio) { o.cambio(P, S); for (let i = 0; i < horas * 7200; i++) E.step(P, S, 0.5); }
  E.energy(P, S); return { P, S };
}

test('evaporador: estado estacionario, balance de sólidos y economía de vapor', () => {
  const E = evaporador(); const { P, S } = planta(E);
  cerca(S.x[4] * 100, 70, 0.5, '°Brix del concentrado');
  cerca(S.L[4] * S.x[4], S.F * P.Bf / 100, 1e-3 * S.F, 'sólidos que salen = sólidos que entran');
  const econ = S.V.reduce((a, b) => a + b, 0) / S.steam;
  assert.ok(econ > 3.8 && econ < 4.3, `economía ${econ.toFixed(2)}`);
  for (let i = 1; i < 5; i++) { assert.ok(S.T[i] < S.T[i - 1], 'la temperatura baja efecto a efecto'); assert.ok(S.x[i] > S.x[i - 1], 'el °Brix sube efecto a efecto'); }
});

test('evaporador: propiedades físicas de referencia', () => {
  const E = evaporador();
  cerca(E.tsat(101.325), 100, 0.1, 'T_sat a 1 atm');
  cerca(E.bpe(70), 5.83, 0.01, 'EPE a 70 °Brix');
  cerca(E.bpe(12), 0.34, 0.01, 'EPE a 12 °Brix');
});

test('evaporador (manual): más alimentación baja el °Brix y más vapor lo sube', () => {
  const E = evaporador();
  const base = planta(E, { auto: false }).S.x[4];
  const masF = planta(E, { auto: false, cambio: (P, S) => { P.F = S.F * 1.1; } }).S.x[4];
  const masV = planta(E, { auto: false, cambio: (P, S) => { P.F = S.F; P.Ts += 3; } }).S.x[4];
  assert.ok(masF < base, `+10 % alimentación: ${(masF * 100).toFixed(1)} < ${(base * 100).toFixed(1)}`);
  assert.ok(masV > base, `+3 °C de vapor: ${(masV * 100).toFixed(1)} > ${(base * 100).toFixed(1)}`);
});

test('evaporador: el HMF crece con la temperatura del vapor (Arrhenius)', () => {
  const E = evaporador();
  const frio = planta(E, { Ts: 102 }).S.hProd, caliente = planta(E, { Ts: 108 }).S.hProd;
  assert.ok(caliente > frio, `HMF ${caliente.toFixed(1)} > ${frio.toFixed(1)}`);
});
