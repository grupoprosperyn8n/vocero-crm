export type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

export type DashboardFilters = {
  from?: string;
  to?: string;
  office?: string;
  product?: string;
  employee?: string;
  channel?: string;
  company?: string;
  search?: string;

  /*
   * Interno: fuerza un refresco de la caché de datos (lo usa el
   * warm cron con ?refresh=1). No es un filtro de UI.
   */
  refresh?: boolean;
};

export type HistoricCompact = {
  id: string;
  clientId?: string;

  name?: string;
  dni?: string;
  phone?: string;
  email?: string;

  date?: string;
  office?: string;
  reason?: string;
  product?: string;
  employee?: string;
  channel?: string;
  payment?: string;
  amount: number;
};

export type PolicyCompact = {
  id: string;
  clientIds: string[];

  number?: string;

  statuses: string[];

  product?: string;
  company?: string;
  employee?: string;
  office?: string;
  payment?: string;

  startDate?: string;
  expiryDate?: string;
  cancellationDate?: string;

  premium: number;
  activePremium: number;

  createdTime?: string;
};

export type ClientCompact = {
  id: string;

  uniqueId?: string;

  name: string;
  dni?: string;
  phone?: string;
  email?: string;

  createdTime?: string;
};

export type DashboardResponse = {
  generatedAt: string;

  migration: {
    clients: number;
    historicOperations: number;
    matchedClients: number;
    matchedOperations: number;
    clientMatchRate: number;
    operationMatchRate: number;
    unmatchedOperations: number;

    loadedPolicies: number;
    policiesWithoutClient: number;
    policiesWithoutProduct: number;
    policiesWithoutCompany: number;
    policiesWithoutExpiry: number;
  };

  historic: {
    altas: number;
    anulaciones: number;
    net: number;
    ratio: number;
    cotizaciones: number;
    siniestros: number;
  };

  current: {
    loadedPolicies: number;
    activePolicies: number;
    activeClients: number;
    activePremium: number;
    expires7: number;
    expires30: number;
    onePolicyClients: number;
    multiPolicyClients: number;
  };

  opportunity: {
    reactivationCandidates: number;
    activeWithOnePolicy: number;
    retentionWatch: number;
    historicalWithoutCurrentPolicy: number;
  };

  monthly: {
    month: string;
    altas: number;
    anulaciones: number;
    net: number;
    siniestros: number;
  }[];

  historicProducts: {
    name: string;
    value: number;
  }[];

  currentProducts: {
    name: string;
    value: number;
  }[];

  channels: {
    name: string;
    value: number;
  }[];

  offices: {
    name: string;
    altas: number;
    anulaciones: number;
    net: number;
  }[];

  companies: {
    name: string;
    policies: number;
    activePremium: number;
  }[];

  crossSell: {
    opportunity: string;
    customers: number;
  }[];

  filters: {
    offices: string[];
    products: string[];
    employees: string[];
    channels: string[];
    companies: string[];
  };

  customers: {
    id: string;
    name: string;
    dni?: string;
    phone?: string;

    activePolicies: number;
    historicalOperations: number;
    historicalAltas: number;
    historicalAnulaciones: number;
    historicalSiniestros: number;

    activePremium: number;

    score: number;
    recommendation: string;

    recommendationWhy: string;
    recommendationSteps: string[];

    backendUrl: string;
  }[];

  customerStats?: {
    total: number;
    matched: number;
  };

  crm: CrmAnalytics;

  /*
   * Listas dinamicas: el "por dentro" de cada numero del tablero.
   * Cada lista trae los registros reales (clientes / polizas /
   * gestiones) detras de una metrica, con su link a la ficha en el
   * backoffice. Clave = modulo del tablero.
   */
  lists: Record<string, DrillList[]>;
};

/*
 * LISTAS DINAMICAS
 */

export type DrillLink = {
  label: string;
  url: string;
};

export type DrillItem = {
  name: string;
  dni?: string;
  detail?: string;
  extra?: string;
  /*
   * 039 — Valores crudos de campos de selección de Airtable (estado de la
   * póliza, forma de pago…). El CRM los pinta como chips con el mismo color
   * de la opción en el backoffice (airtable-colors.ts). Opcional: si la
   * lista no los trae, no se muestra ningún chip.
   */
  tags?: string[];
  links: DrillLink[];
};

export type DrillList = {
  id: string;
  title: string;
  total: number;
  shown: number;
  items: DrillItem[];
};

/*
 * CRM Vocero (3ª fuente): el snapshot viene de scripts/sync-crm.mjs
 * (SELECT de solo lectura sobre Postgres del CRM, sin datos de prueba).
 */

export type CrmContact = {
  id: string;
  name?: string | null;
  phone?: string | null;
  channel?: string | null;
  source?: string | null;
  isTest?: boolean;
  externalRef?: string | null;
  createdAt?: string;
};

export type CrmConversation = {
  id: string;
  contactId: string;
  channel?: string | null;
  isTest?: boolean;
  topic?: string | null;
  assigneeId?: string | null;
  createdAt?: string;
  lastMessageAt?: string | null;
  lastInboundAt?: string | null;
  closedAt?: string | null;
};

export type CrmMessageStat = {
  conversationId: string;
  total?: number | string | null;
  inbound?: number | string | null;
  outbound?: number | string | null;
  ai?: number | string | null;
};

export type CrmDailyRow = {
  day: string;
  isTest?: boolean;
  total?: number | string | null;
  inbound?: number | string | null;
  outbound?: number | string | null;
  ai?: number | string | null;
};

export type CrmLead = {
  id: string;
  contactId: string;
  stage?: string;
  stageKind?: string | null;
  amountCents?: number | string | null;
  priority?: string | null;
  createdAt?: string;
  lastActivityAt?: string | null;
  contactName?: string | null;
  isTest?: boolean;
};

export type CrmStage = {
  name: string;
  kind?: string | null;
  position?: number | string | null;
};

export type CrmSnapshot = {
  generatedAt?: string;
  contacts: CrmContact[];
  conversations: CrmConversation[];
  messageStats: CrmMessageStat[];
  dailyMessages: CrmDailyRow[];
  dailyConversations?: CrmDailyRow[];
  leads: CrmLead[];
  stages: CrmStage[];
  usersCount?: number | string | null;
  source?: {
    host?: string;
    db?: string;
    container?: string;
  };
};

export type CrmMatchRow = {
  contactId: string;
  name: string;
  channel: string;

  messages: number;
  conversations: number;
  lastActivity?: string;

  link: string;
  clientId?: string;
  clientName?: string;

  activePolicies: number;
  activePremium: number;
  expiring30: number;
  historicalOperations: number;
};

export type CrmAnalytics = {
  available: boolean;
  generatedAt?: string;

  kpis: {
    contacts: number;
    conversations: number;
    messages: number;
    inbound: number;
    outbound: number;
    ai: number;
    openConversations: number;
    closedConversations: number;
    users: number;
    leads: number;
    converted: number;
    conversionRate: number;
    pipelineAmount: number;
    leadsLinked: number;
    linkedAmount: number;
    matchedContacts: number;
    matchRate: number;
    matchedPremium: number;
    matchedWithActive: number;
    expiring30: number;
  };

  channels: {
    name: string;
    value: number;
  }[];

  pipeline: {
    name: string;
    kind: string;
    leads: number;
    amount: number;
    avgAmount: number;
  }[];

  daily: {
    day: string;
    total: number;
    inbound: number;
    outbound: number;
    ai: number;
  }[];

  rows: CrmMatchRow[];
};

/*
 * Capa de IA del cockpit (Cliente 360°): "próxima mejor acción" generada
 * server-side con DeepSeek — el mismo proveedor que usa el CRM.
 * Modos del motor: "dual" (algoritmo + IA), "ia" (solo IA), "algoritmo".
 */

export type InsightMode = "dual" | "ia" | "algoritmo";

export type ClientInsightContext = {
  name: string;
  activePolicies: number;
  historicalOperations: number;
  historicalAltas: number;
  historicalAnulaciones: number;
  historicalSiniestros: number;
  activePremium: number;
  score: number;
  recommendation: string;
  recommendationWhy: string;
  recommendationSteps: string[];
};

export type ClientInsight = {
  accion: string;
  porQue: string;
  pasos: string[];
  mensajeWhatsapp: string;
  model: string;
  generatedAt: string;
  cached: boolean;
};

/*
 * Capa IA de MÓDULOS del tablero (Pulso, Cartera, Retención, Reactivación,
 * Venta cruzada, Migración y CRM): cada módulo puede generar un análisis
 * sobre sus datos reales (resumen + focos + acciones), en modo dual o solo IA.
 */

export const MODULE_AI_IDS = [
  "pulso",
  "cartera",
  "retencion",
  "reactivacion",
  "cross",
  "migracion",
  "crm",
] as const;

export type ModuleAiId = (typeof MODULE_AI_IDS)[number];

export type ModuleInsight = {
  resumen: string;
  focos: string[];
  acciones: string[];
  mensaje: string;
  model: string;
  generatedAt: string;
  cached: boolean;
};
