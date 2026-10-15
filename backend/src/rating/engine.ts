/**
 * The rating model: a Bayesian Bradley–Terry fit over the whole history.
 *
 * Every player has a hidden strength θ; a pair's strength is the sum of its two
 * players'. The probability that pair A beats pair B is σ(θA1 + θA2 − θB1 − θB2).
 * Each finished set is one observation, weighted by how much it says (margin,
 * set length, age); a decided match adds one more, lighter one. The strengths
 * are the maximum a posteriori estimate under a Gaussian prior N(0, τ²), found
 * with Newton's method, and recomputed from scratch on every write.
 *
 * Why this rather than Elo, Glicko or TrueSkill — see docs/ranking.md. In short:
 * the fit is order-independent, it credits a win to the partner who carried it
 * through everyone else's results rather than through one update at a time, and
 * the prior only pulls a sparse record toward the average — it never rewards
 * games played, which is what TrueSkill's "μ − 3σ" leaderboard does.
 */

export interface Observation {
  /** The two players of each side. */
  a: readonly [string, string];
  b: readonly [string, string];
  /** 1 if side A won, 0 if side B did. */
  y: 0 | 1;
  weight: number;
}

export interface Strength {
  /** Posterior mode, in logit units of pair-vs-pair odds. */
  theta: number;
  /** Posterior standard deviation (Laplace approximation). */
  sd: number;
}

export interface FitOptions {
  /** Prior standard deviation of a player's strength. */
  priorSd: number;
  /** Starting point, e.g. the previous fit; players missing from it start at 0. */
  warmStart?: ReadonlyMap<string, number>;
  maxIterations?: number;
  tolerance?: number;
}

export const DEFAULT_PRIOR_SD = 0.35;

function sigmoid(x: number): number {
  return x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
}

/** log σ(x), stable for large |x|. */
function logSigmoid(x: number): number {
  return x >= 0 ? -Math.log1p(Math.exp(-x)) : x - Math.log1p(Math.exp(x));
}

/**
 * In-place Cholesky of a symmetric positive-definite matrix (row-major, n×n),
 * leaving L in the lower triangle. Returns false if the matrix is not SPD.
 */
function cholesky(m: Float64Array, n: number): boolean {
  for (let j = 0; j < n; j++) {
    let d = m[j * n + j]!;
    for (let k = 0; k < j; k++) d -= m[j * n + k]! ** 2;
    if (d <= 0) return false;
    const l = Math.sqrt(d);
    m[j * n + j] = l;
    for (let i = j + 1; i < n; i++) {
      let s = m[i * n + j]!;
      for (let k = 0; k < j; k++) s -= m[i * n + k]! * m[j * n + k]!;
      m[i * n + j] = s / l;
    }
  }
  return true;
}

/** Solves L Lᵀ x = b given the factor from {@link cholesky}. */
function choleskySolve(l: Float64Array, n: number, b: Float64Array): Float64Array {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= l[i * n + k]! * y[k]!;
    y[i] = s / l[i * n + i]!;
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k++) s -= l[k * n + i]! * x[k]!;
    x[i] = s / l[i * n + i]!;
  }
  return x;
}

interface IndexedObs {
  /** Player indices: two on side A (+1), two on side B (−1). */
  idx: [number, number, number, number];
  y: number;
  w: number;
}

const SIGNS = [1, 1, -1, -1] as const;

function margin(o: IndexedObs, theta: Float64Array): number {
  return theta[o.idx[0]]! + theta[o.idx[1]]! - theta[o.idx[2]]! - theta[o.idx[3]]!;
}

function logPosterior(obs: IndexedObs[], theta: Float64Array, invVar: number): number {
  let f = 0;
  for (const o of obs) {
    const d = margin(o, theta);
    f += o.w * (o.y * logSigmoid(d) + (1 - o.y) * logSigmoid(-d));
  }
  for (const t of theta) f -= 0.5 * invVar * t * t;
  return f;
}

/** Fits every player who appears in at least one observation. */
export function fitStrengths(
  observations: readonly Observation[],
  options: FitOptions,
): Map<string, Strength> {
  const ids: string[] = [];
  const index = new Map<string, number>();
  const indexOf = (id: string): number => {
    let i = index.get(id);
    if (i === undefined) {
      i = ids.length;
      ids.push(id);
      index.set(id, i);
    }
    return i;
  };

  const obs: IndexedObs[] = [];
  for (const o of observations) {
    if (!(o.weight > 0)) continue;
    obs.push({
      idx: [indexOf(o.a[0]), indexOf(o.a[1]), indexOf(o.b[0]), indexOf(o.b[1])],
      y: o.y,
      w: o.weight,
    });
  }

  const n = ids.length;
  const result = new Map<string, Strength>();
  if (n === 0) return result;

  const invVar = 1 / options.priorSd ** 2;
  const maxIterations = options.maxIterations ?? 50;
  const tolerance = options.tolerance ?? 1e-9;

  const theta = new Float64Array(n);
  for (let i = 0; i < n; i++) theta[i] = options.warmStart?.get(ids[i]!) ?? 0;

  // Negative Hessian of the log posterior: Σ w p(1−p) x xᵀ + I/τ². Symmetric
  // positive definite thanks to the prior, so the objective is strictly concave
  // and Newton converges to the one maximum.
  const negHessian = (out: Float64Array, grad: Float64Array | null): void => {
    out.fill(0);
    grad?.fill(0);
    for (let i = 0; i < n; i++) {
      out[i * n + i] = invVar;
      if (grad) grad[i] = -invVar * theta[i]!;
    }
    for (const o of obs) {
      const p = sigmoid(margin(o, theta));
      const curv = o.w * p * (1 - p);
      const resid = o.w * (o.y - p);
      for (let r = 0; r < 4; r++) {
        const ir = o.idx[r]!;
        if (grad) grad[ir] = grad[ir]! + SIGNS[r]! * resid;
        for (let c = 0; c < 4; c++) {
          const ic = o.idx[c]!;
          out[ir * n + ic] = out[ir * n + ic]! + SIGNS[r]! * SIGNS[c]! * curv;
        }
      }
    }
  };

  const h = new Float64Array(n * n);
  const g = new Float64Array(n);
  let f = logPosterior(obs, theta, invVar);

  for (let iter = 0; iter < maxIterations; iter++) {
    negHessian(h, g);
    if (!cholesky(h, n)) break;
    const step = choleskySolve(h, n, g);

    // Damped step: halve until the posterior does not decrease. A full Newton
    // step almost always succeeds here; the guard is for pathological inputs.
    let scale = 1;
    const candidate = new Float64Array(n);
    let fNew = f;
    for (let tries = 0; tries < 30; tries++) {
      for (let i = 0; i < n; i++) candidate[i] = theta[i]! + scale * step[i]!;
      fNew = logPosterior(obs, candidate, invVar);
      if (fNew >= f - 1e-12) break;
      scale /= 2;
    }
    theta.set(candidate);
    f = fNew;

    let maxStep = 0;
    for (const s of step) maxStep = Math.max(maxStep, Math.abs(s * scale));
    if (maxStep < tolerance) break;
  }

  // Laplace approximation: posterior covariance ≈ (−H)⁻¹ at the mode. Only the
  // diagonal is needed, one solve per player.
  negHessian(h, null);
  const factored = cholesky(h, n);
  const e = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sd = options.priorSd;
    if (factored) {
      e.fill(0);
      e[i] = 1;
      sd = Math.sqrt(choleskySolve(h, n, e)[i]!);
    }
    result.set(ids[i]!, { theta: theta[i]!, sd });
  }
  return result;
}
