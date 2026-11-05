# Sucker-rod pumping unit C-320 · live dynamometer cards

[Versión en español](README.es.md)

3D simulator of a well on sucker-rod pumping: beam pumping unit, 1500 m rod string and downhole pump with its valves. The rod string is modelled as an elastic solid with the **damped wave equation**. The pump has a chamber with liquid and gas, and valves that open and close according to pressures. This yields the **surface and downhole dynamometer cards** in real time, like the ones a dynamometer measures in the field.

<p><img src="../assets/bombeo-1.jpg" width="49%" alt=""> <img src="../assets/bombeo-2.jpg" width="49%" alt=""></p>

## How to open it

Open `bombeo.html` in a browser with a double click. three.js and MathJax are bundled in `vendor/`, so it works offline.

- **"▶ Guided demo":** plays a guided sequence with captions.
- **"∑ Show the math":** opens the panel with the equations and their live values.
- **Camera views:** overview, pumping unit and downhole pump.

| Tab | What can be changed |
|---|---|
| **Operation** | Strokes per minute, well potential (AOF), counterbalance moment, plunger diameter |
| **Faults** | Free gas at the intake, travelling-valve leak, standing-valve leak, parted rod, pump tagging bottom, repair all |
| **Control** | Pump-off controller (POC) with a minimum accepted fillage |

What the 3D view shows:
- **Pumping unit:** the walking beam, the pitmans, the crank with its counterweights, the gearbox, the motor, the carrier bar, the polished rod and the flow in the line.
- **Well cross-section:** the rod string coloured by tension (blue = low, red = high) and the fluid level in the annulus. Depth is compressed; the pump, however, is at real scale.
- **Pump:** the plunger, the chamber with liquid and gas, and the balls of the standing and travelling valves, which light up green when open.

---

## 1. Pumping unit kinematics (four-bar linkage)

Coordinates in the plane of the unit: the centre bearing (beam pivot) is at $(0, H)$ and the crankshaft at $(I, 0)$. For each crank angle $\theta$, the beam angle $\beta$ follows from the pitman having a fixed length $P$:

$$
\big\lVert \mathbf E(\beta) - \mathbf C(\theta) \big\rVert = P,
\qquad
\mathbf E = \begin{bmatrix} C\cos\beta \\ H + C\sin\beta \end{bmatrix},
\qquad
\mathbf C = \begin{bmatrix} I + R\cos\theta \\ R\sin\theta \end{bmatrix}
$$

The equation is solved by bisection and tabulated at 720 points. The horsehead is an arc of radius $A$, so the polished rod moves vertically:

$$
y_{\text{pr}}(\theta) = -A\,\beta(\theta) - y_{\min},
\qquad \theta = \omega t, \quad \omega = \frac{2\pi N}{60}
$$

The **torque factor** is $TF(\theta) = dy_{\text{pr}}/d\theta$, in metres per radian.

| Dimension | Value | Description |
|---|---|---|
| $A$ | 3.0 m | pivot to horsehead |
| $C$ | 2.4 m | pivot to equalizer |
| $P$ | 3.3 m | pitman length |
| $R$ | 0.95 m | crank radius |
| $I$ | 2.4 m | horizontal distance pivot–crankshaft |
| $H$ | 3.3 m | pivot height above the crankshaft |

The resulting polished-rod stroke is 2.45 m.

## 2. Rod string: damped wave equation (Gibbs)

Let $u(x,t)$ be the axial displacement of the rod at depth $x$ (positive downward):

$$
\frac{\partial^2 u}{\partial t^2} = v^2\,\frac{\partial^2 u}{\partial x^2} - c\,\frac{\partial u}{\partial t} + g\left(1 - \frac{\rho_f}{\rho_s}\right),
\qquad v = \sqrt{\frac{E}{\rho_s}} \approx 5135\ \text{m/s}
$$

The last term is the weight of the rods immersed in fluid. Boundary conditions:

$$
u(0,t) = -y_{\text{pr}}(t)
\qquad\qquad
E A_r \left.\frac{\partial u}{\partial x}\right|_{x=L} = F_p(t)
$$

At the surface the unit's motion is imposed. At the bottom, the rod tension equals the pump load. The polished-rod load is

$$
\text{PRL}(t) = E A_r \left.\frac{\partial u}{\partial x}\right|_{x=0}
$$

### Discretization

Explicit centred finite differences, with $N = 50$ segments ($\Delta x$ = 30 m) and $\Delta t$ = 1 ms:

$$
u_i^{n+1} = \frac{2u_i^n - \left(1 - \tfrac{c\Delta t}{2}\right)u_i^{n-1} + r\left(u_{i+1}^n - 2u_i^n + u_{i-1}^n\right) + \Delta t^2\, g_{\text{ef}}}{1 + \tfrac{c\Delta t}{2}},
\qquad r = \left(\frac{v\,\Delta t}{\Delta x}\right)^2
$$

The Courant number is $v\Delta t/\Delta x \approx 0.17 < 1$, so the scheme is stable. A ghost node is used at the bottom: $u_{N+1} = u_{N-1} + 2\Delta x\,F_p/(EA_r)$. The PRL is computed with a second-order forward derivative.

Stress waves take $L/v \approx 0.29$ s to travel the string. That is why the surface card is a "filtered and delayed" version of the downhole card, with oscillations on top of the rod weight.

## 3. Downhole pump

The chamber between the standing valve and the plunger has a volume $V = A_p\,(y_p - y_0)$. It holds liquid $V_l$ (incompressible) and gas, with $p\,V_g = n_g$ constant (isothermal):

$$
p_{\text{ch}} = \frac{n_g}{V - V_l}
$$

Reference pressures:

$$
p_{\text{dis}} = \rho_f g L + p_{\text{line}} \approx 14.0\ \text{MPa},
\qquad
p_{\text{int}} = p_{\text{casing}} + \rho_f g\,h_f
$$

Valve logic, evaluated at every step:
- **Standing valve** (bottom): opens if $p_{\text{ch}} < p_{\text{int}}$. A mixture from the annulus enters, with fraction $1-\alpha$ liquid and $\alpha$ gas, until $p_{\text{int}}$ is reached. If the annulus level has dropped to the pump, only what the reservoir delivers can enter.
- **Travelling valve** (in the plunger): opens if $p_{\text{ch}} > p_{\text{dis}}$. Liquid leaves to the tubing first; if no liquid is left, gas leaves too.
- **Leaks:** $\dot V = k\,\Delta p$ through the closed valve. Pressure is bounded to the physical range $[p_{\text{int}}, p_{\text{dis}}]$ so the explicit step does not overshoot with the nearly incompressible liquid.

Load at the bottom of the string:

$$
F_p = (p_{\text{dis}} - p_{\text{ch}})\,A_p \pm F_{\text{fric}}
$$

When "tagging bottom" is on, a contact force is added if the plunger reaches the lower stop.

**Pump spacing:** at start-up the simulator runs two settling cycles, measures the lowest point the plunger reaches with the string stretched and places the pump stop 30 cm below it, as is done in the field.

## 4. Dynamometer cards

- **Surface:** $(y_{\text{pr}}, \text{PRL})$, what a dynamometer measures on the polished rod.
- **Downhole:** $(y_p, F_p)$, the plunger load and position. In the field it is computed from the surface card by solving the wave equation backward; here it comes straight from the simulation.

With a full pump, the downhole card is almost a rectangle of height $F_o = (p_{\text{dis}} - p_{\text{int}})A_p$ and width equal to the plunger stroke. Fillage is measured at the top of each stroke:

$$
\text{fillage} = \left.\frac{V_l}{V}\right|_{\text{top}}
$$

| Condition | Downhole card |
|---|---|
| Full pump | Rectangle |
| Fluid pound | Load holds for part of the downstroke and drops suddenly when the plunger hits the liquid: lower right corner cut off |
| Gas interference | Load drops gradually as the gas compresses: rounded unloading |
| Travelling-valve leak | Load is lost during the upstroke |
| Standing-valve leak | Load is slow to drop during unloading |
| Parted rod | No fluid load: the surface card stays at the weight of the upper string |

## 5. Gearbox torque and counterbalance

$$
T_{\text{net}}(\theta) = TF(\theta)\cdot\text{PRL}(\theta) - M\,\sin(\theta - \theta_0)
$$

$M$ is the maximum counterbalance moment, and $\theta_0$ is aligned with the torque-factor maximum. This is the API 11E form with structural unbalance $B$ equal to zero. The C-320 gearbox is rated at 320,000 lb·in, that is, 36.2 kN·m. With $M \approx$ 60 kN·m the peaks are similar: about 34 kN·m on the upstroke and 27 kN·m on the downstroke. With $M$ = 25 kN·m the peak exceeds 50 kN·m.

## 6. Production, fluid level and pump-off controller (POC)

The reservoir is modelled with a linear IPR:

$$
q_{\text{res}} = q_{\max}\left(1 - \frac{p_{\text{int}}}{p_r}\right), \qquad p_r = 9\ \text{MPa}
$$

The annulus level follows from the balance between inflow and what the pump removes:

$$
A_{\text{an}}\,\frac{dh_f}{dt} = q_{\text{res}} - q_{\text{pump}}
$$

$A_{\text{an}}$ is an effective area about 300 times smaller than the real one, so the level changes in seconds instead of hours. If the pump removes more than the well delivers, $h_f$ reaches 0 and fluid pound appears.

**POC:** at every top of stroke it compares fillage with the minimum accepted.

$$
\text{fillage} < \text{min} \Rightarrow N \leftarrow N - 0.75\ \text{SPM},
\qquad
\text{fillage} > 0.95 \Rightarrow N \leftarrow N + 0.25
$$

$N$ stays between 4 SPM and the operating value, and the variable-speed drive changes speed with a 0.8 SPM/s ramp.

## 7. Well data

| Parameter | Value |
|---|---|
| Pump depth $L$ | 1500 m |
| Rods | 7/8" steel ($A_r$ = 3.88 cm², $E$ = 207 GPa, $\rho_s$ = 7850 kg/m³) |
| Damping $c$ | 0.35 s⁻¹ |
| Plunger | 1.75" (44.5 mm), adjustable from 1.25" to 2.25" |
| Fluid | $\rho_f$ = 900 kg/m³ |
| Pressures | line 0.8 MPa, casing 0.3 MPa, reservoir 9 MPa |
| Plunger friction | 0.5 kN |
| Reference operation | 8 SPM, ≈ 250 bbl/d, PRL 73 / 26 kN |

## Files

- `bombeo.html`: the complete simulator.
- `vendor/`: three.js r128 (MIT) and MathJax 3.2.2 (Apache 2.0).
