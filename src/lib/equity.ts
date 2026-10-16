import { Capacity, CAPACITY_META, Category, Flexibility, RoleKey } from "@/lib/domain";
import { formatMinutes, gini } from "@/lib/workload";

export type PreferenceLevel = "prefer" | "neutral" | "with_support" | "avoid";

export type CandidateProfile = {
  userId: string;
  name: string;
  color: string;
  roleKey: RoleKey;
  capacity: Capacity;
  loadMinutes: number;
  openCount: number;
  preference: PreferenceLevel;
  hasConflict: boolean;
  conflictReason?: string;
  recentAssignments: number;
  wasLastInRotation: boolean;
  needsCompany: boolean;
  availableInWindow: boolean;
};

export type AssignmentRequest = {
  title: string;
  category: Category;
  durationMinutes: number;
  start: Date | null;
  flexibility: Flexibility;
  rotates: boolean;
  minNoticeMinutes?: number;
  candidates: CandidateProfile[];
};

export type EquityOption = {
  userId: string;
  name: string;
  color: string;
  capacity: Capacity;
  score: number;
  eligible: boolean;
  blockers: string[];
  reasons: string[];
  tradeoffs: string[];
};

export type AssignmentAnalysis = {
  options: EquityOption[];
  recommended: EquityOption | null;
  unassigned: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// Il motore non usa genere, parentela o ruolo sociale come scorciatoia: solo vincoli, carico e disponibilità.
export function analyseAssignment(request: AssignmentRequest): AssignmentAnalysis {
  const loads = request.candidates.map((candidate) => candidate.loadMinutes);
  const average = loads.length ? loads.reduce((sum, value) => sum + value, 0) / loads.length : 0;

  const options: EquityOption[] = request.candidates.map((candidate) => {
    const reasons: string[] = [];
    const tradeoffs: string[] = [];
    const blockers: string[] = [];
    let score = 60;

    const capacity = CAPACITY_META[candidate.capacity];
    if (candidate.capacity === Capacity.UNAVAILABLE) {
      blockers.push(`${candidate.name} ha indicato di non essere disponibile in questo periodo.`);
    } else {
      score += capacity.factor * 20 - 10;
      if (candidate.capacity === Capacity.REDUCED || candidate.capacity === Capacity.PROTECTED) {
        tradeoffs.push(`Capacità ${capacity.label.toLowerCase()}: meglio ridurre nuove assegnazioni.`);
      }
    }

    if (candidate.hasConflict) {
      blockers.push(candidate.conflictReason ?? `${candidate.name} ha già un impegno sovrapposto.`);
    }

    if (!candidate.availableInWindow) {
      blockers.push(`${candidate.name} non è nella propria fascia di disponibilità per questo orario.`);
    }

    if (candidate.needsCompany) {
      tradeoffs.push(`${candidate.name} può svolgere questa attività solo con un'altra persona presente.`);
      score -= 6;
    }

    const delta = average > 0 ? (average - candidate.loadMinutes) / Math.max(60, average) : 0;
    const loadBonus = clamp(delta * 30, -30, 30);
    score += loadBonus;
    if (loadBonus > 6) {
      reasons.push(`Porta meno carico della media in questa settimana (${formatMinutes(candidate.loadMinutes)}).`);
    } else if (loadBonus < -6) {
      tradeoffs.push(`Ha già ${formatMinutes(candidate.loadMinutes)} di carico: assegnare ora concentrerebbe il lavoro.`);
    }

    if (candidate.preference === "prefer") {
      score += 12;
      reasons.push(`${candidate.name} ha indicato di preferire questo tipo di attività.`);
    } else if (candidate.preference === "with_support") {
      score -= 6;
      tradeoffs.push(`Disponibile solo con supporto su questo tipo di attività.`);
    } else if (candidate.preference === "avoid") {
      score -= 22;
      tradeoffs.push(`${candidate.name} preferirebbe non svolgere questo tipo di attività.`);
    }

    if (candidate.recentAssignments > 0) {
      score -= Math.min(16, candidate.recentAssignments * 4);
      if (candidate.recentAssignments >= 2) {
        tradeoffs.push(`Ha già coperto ${candidate.recentAssignments} attività simili negli ultimi giorni.`);
      }
    }

    if (request.rotates && candidate.wasLastInRotation) {
      score -= 12;
      tradeoffs.push("È stata la persona che ha coperto l'ultimo turno di questa rotazione.");
    }

    if (request.start) {
      const hour = request.start.getHours();
      if (hour < 7 || hour >= 21) {
        score -= 6;
        tradeoffs.push("La fascia oraria è fuori dagli orari abituali.");
      }
      const noticeMinutes = request.minNoticeMinutes ?? 0;
      if (noticeMinutes > 0) {
        const notice = request.start.getTime() - Date.now();
        if (notice < noticeMinutes * 60000) {
          blockers.push(`Meno di ${Math.round(noticeMinutes / 60)}h di preavviso rispetto a quanto richiesto.`);
        }
      }
    }

    if (request.flexibility !== Flexibility.FIXED) {
      reasons.push("L'orario è flessibile: può essere spostato se serve più tempo.");
    }

    if (!blockers.length) {
      reasons.unshift(`Il carico di ${candidate.name} questa settimana è ${formatMinutes(candidate.loadMinutes)}.`);
      if (candidate.capacity === Capacity.HIGH || candidate.capacity === Capacity.NORMAL) {
        reasons.push("Ha capacità dichiarata compatibile con l'attività.");
      }
    }

    return {
      userId: candidate.userId,
      name: candidate.name,
      color: candidate.color,
      capacity: candidate.capacity,
      score: Math.round(clamp(score, 0, 100)),
      eligible: blockers.length === 0,
      blockers,
      reasons: reasons.slice(0, 3),
      tradeoffs: tradeoffs.slice(0, 3),
    };
  });

  const sorted = options.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
  return { options: sorted, recommended: sorted.find((option) => option.eligible) ?? null, unassigned: !sorted.some((option) => option.eligible) };
}

export type ImpactSummary = {
  before: number;
  after: number;
  deltaConcentration: number;
  becomesLessBalanced: boolean;
  narrative: string;
};

// Simula l'effetto dell'assegnazione sulla distribuzione settimanale.
export function simulateImpact(loads: { userId: string; name: string; minutes: number }[], assignTo: string, addMinutes: number): ImpactSummary {
  const before = gini(loads.map((entry) => entry.minutes));
  const afterLoads = loads.map((entry) => ({ ...entry, minutes: entry.minutes + (entry.userId === assignTo ? addMinutes : 0) }));
  const after = gini(afterLoads.map((entry) => entry.minutes));
  const person = loads.find((entry) => entry.userId === assignTo);
  const total = afterLoads.reduce((sum, entry) => sum + entry.minutes, 0);
  const share = person && total > 0 ? Math.round(((person.minutes + addMinutes) / total) * 100) : 0;
  const becomesLessBalanced = after > before + 0.02;

  return {
    before: Math.round(before * 100),
    after: Math.round(after * 100),
    deltaConcentration: Math.round((after - before) * 100),
    becomesLessBalanced,
    narrative: becomesLessBalanced
      ? `Questa attività richiede circa ${formatMinutes(addMinutes)}. Se assegnata a ${person?.name ?? "questa persona"}, la sua quota settimanale salirebbe al ${share}% e la distribuzione diventerebbe meno equilibrata.`
      : `Questa attività richiede circa ${formatMinutes(addMinutes)}. Assegnata a ${person?.name ?? "questa persona"}, la distribuzione resta sostenibile.`,
  };
}

export type AlternativeKind = "assign" | "rotate" | "support" | "move" | "split" | "confirm";

export type Alternative = {
  kind: AlternativeKind;
  title: string;
  detail: string;
};

// Le cinque mosse del blueprint: assegnare, ruotare, chiedere supporto, spostare, dividere.
export function buildAlternatives(request: AssignmentRequest, analysis: AssignmentAnalysis): Alternative[] {
  const recommended = analysis.recommended;
  const alternatives: Alternative[] = [];

  alternatives.push({
    kind: "assign",
    title: recommended ? `Assegna a ${recommended.name}` : "Assegna manualmente",
    detail: recommended
      ? recommended.reasons[0] ?? "È la soluzione con il miglior equilibrio tra carico e disponibilità."
      : "Nessuna persona è pienamente disponibile: serve una decisione del nucleo.",
  });

  if (analysis.options.length > 1) {
    const others = analysis.options.filter((option) => option.eligible && option.userId !== recommended?.userId).slice(0, 2);
    if (others.length) {
      alternatives.push({
        kind: "rotate",
        title: "Proponi una rotazione",
        detail: `Alterna tra ${[recommended, ...others].filter(Boolean).map((option) => option!.name).join(", ")} così il lavoro non ricade sempre sulla stessa persona.`,
      });
    }
  }

  alternatives.push({
    kind: "support",
    title: "Chiedi supporto",
    detail: "Trasforma il bisogno in una richiesta chiara: il nucleo può accettare, rifiutare o proporre un'alternativa.",
  });

  if (request.flexibility !== Flexibility.FIXED) {
    alternatives.push({
      kind: "move",
      title: "Sposta l'orario",
      detail: "L'impegno è flessibile: spostarlo può liberare una fascia compatibile con più persone.",
    });
    alternatives.push({
      kind: "split",
      title: "Dividi l'attività in fasi",
      detail: "Separare preparazione, spostamento e svolgimento permette di distribuire meglio il carico.",
    });
  }

  alternatives.push({
    kind: "confirm",
    title: "Conferma comunque",
    detail: "La decisione resta sempre alle persone. Parenthesys rende visibili le conseguenze, non decide.",
  });

  return alternatives;
}
