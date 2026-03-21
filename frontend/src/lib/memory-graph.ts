/**
 * AGI-1 Memory + Knowledge Graph
 *
 * Expands beyond flat chat history into structured memory:
 * - User profile (preferences, routines, relationships)
 * - Task memory (execution history, learned workflows)
 * - Consent history
 * - Knowledge entities (contacts, events, projects)
 *
 * Storage: runtime/memory_graph.json (upgradeable to vector DB)
 */

import fs from 'fs';
import path from 'path';

// ============================================================
// Memory Types
// ============================================================

export interface UserProfile {
  display_name?: string;
  timezone?: string;
  language?: string;
  preferences: Record<string, string>;
  routines: RoutineEntry[];
  relationships: RelationshipEntry[];
}

export interface RoutineEntry {
  id: string;
  label: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
  time_hint?: string; // e.g., "morning", "9:00 AM"
  last_triggered?: string;
  details: string;
}

export interface RelationshipEntry {
  name: string;
  role: string; // e.g., "colleague", "partner", "client", "doctor"
  context: string;
  last_mentioned?: string;
}

export interface TaskMemory {
  id: string;
  task_type: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
  agent: string;
  result_summary?: string;
  workflow_type?: string;
}

export interface LearnedWorkflow {
  id: string;
  trigger_pattern: string;
  workflow_steps: string[];
  success_rate: number;
  times_used: number;
  last_used: string;
}

export interface KnowledgeEntity {
  id: string;
  type: 'contact' | 'event' | 'project' | 'preference' | 'fact';
  label: string;
  data: Record<string, unknown>;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface MemoryGraph {
  user_id: string;
  profile: UserProfile;
  task_history: TaskMemory[];
  learned_workflows: LearnedWorkflow[];
  knowledge: KnowledgeEntity[];
  updated_at: string;
}

// ============================================================
// Storage
// ============================================================

function runtimeRoot(): string {
  const root = process.env.AGI1_WORKSPACE_RUNTIME_DIR || path.join(process.cwd(), 'runtime');
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function graphPath(): string {
  return path.join(runtimeRoot(), 'memory_graph.json');
}

function readAllGraphs(): Record<string, MemoryGraph> {
  const target = graphPath();
  if (!fs.existsSync(target)) return {};
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    return {};
  }
}

function writeAllGraphs(graphs: Record<string, MemoryGraph>): void {
  fs.writeFileSync(graphPath(), JSON.stringify(graphs, null, 2), 'utf8');
}

function ensureGraph(userId: string): MemoryGraph {
  const graphs = readAllGraphs();
  if (!graphs[userId]) {
    graphs[userId] = {
      user_id: userId,
      profile: {
        preferences: {},
        routines: [],
        relationships: [],
      },
      task_history: [],
      learned_workflows: [],
      knowledge: [],
      updated_at: new Date().toISOString(),
    };
    writeAllGraphs(graphs);
  }
  return graphs[userId];
}

// ============================================================
// Public API
// ============================================================

export function getMemoryGraph(userId: string): MemoryGraph {
  return ensureGraph(userId);
}

// --- Profile ---

export function updateProfile(userId: string, updates: Partial<UserProfile>): void {
  const graphs = readAllGraphs();
  const graph = ensureGraph(userId);

  if (updates.display_name !== undefined) graph.profile.display_name = updates.display_name;
  if (updates.timezone !== undefined) graph.profile.timezone = updates.timezone;
  if (updates.language !== undefined) graph.profile.language = updates.language;
  if (updates.preferences) {
    graph.profile.preferences = { ...graph.profile.preferences, ...updates.preferences };
  }

  graph.updated_at = new Date().toISOString();
  graphs[userId] = graph;
  writeAllGraphs(graphs);
}

export function addRoutine(userId: string, routine: Omit<RoutineEntry, 'id'>): string {
  const graphs = readAllGraphs();
  const graph = ensureGraph(userId);
  const id = `routine-${Date.now()}`;
  graph.profile.routines.push({ ...routine, id });
  graph.updated_at = new Date().toISOString();
  graphs[userId] = graph;
  writeAllGraphs(graphs);
  return id;
}

export function addRelationship(userId: string, rel: RelationshipEntry): void {
  const graphs = readAllGraphs();
  const graph = ensureGraph(userId);
  const existing = graph.profile.relationships.findIndex((r) => r.name === rel.name);
  if (existing >= 0) {
    graph.profile.relationships[existing] = { ...graph.profile.relationships[existing], ...rel };
  } else {
    graph.profile.relationships.push(rel);
  }
  graph.updated_at = new Date().toISOString();
  graphs[userId] = graph;
  writeAllGraphs(graphs);
}

// --- Task Memory ---

export function recordTask(userId: string, task: Omit<TaskMemory, 'id'>): string {
  const graphs = readAllGraphs();
  const graph = ensureGraph(userId);
  const id = `task-${Date.now()}`;
  graph.task_history.push({ ...task, id });
  // Keep last 100 tasks
  if (graph.task_history.length > 100) {
    graph.task_history = graph.task_history.slice(-100);
  }
  graph.updated_at = new Date().toISOString();
  graphs[userId] = graph;
  writeAllGraphs(graphs);
  return id;
}

export function updateTaskStatus(
  userId: string,
  taskId: string,
  status: TaskMemory['status'],
  resultSummary?: string,
): void {
  const graphs = readAllGraphs();
  const graph = ensureGraph(userId);
  const task = graph.task_history.find((t) => t.id === taskId);
  if (task) {
    task.status = status;
    if (resultSummary) task.result_summary = resultSummary;
    if (status === 'completed' || status === 'failed') {
      task.completed_at = new Date().toISOString();
    }
  }
  graph.updated_at = new Date().toISOString();
  graphs[userId] = graph;
  writeAllGraphs(graphs);
}

// --- Knowledge Graph ---

export function addKnowledge(userId: string, entity: Omit<KnowledgeEntity, 'id' | 'created_at' | 'updated_at'>): string {
  const graphs = readAllGraphs();
  const graph = ensureGraph(userId);
  const id = `entity-${Date.now()}`;
  const now = new Date().toISOString();
  graph.knowledge.push({ ...entity, id, created_at: now, updated_at: now });
  // Keep last 500 entities
  if (graph.knowledge.length > 500) {
    graph.knowledge = graph.knowledge.slice(-500);
  }
  graph.updated_at = now;
  graphs[userId] = graph;
  writeAllGraphs(graphs);
  return id;
}

export function searchKnowledge(userId: string, query: string, type?: KnowledgeEntity['type']): KnowledgeEntity[] {
  const graph = getMemoryGraph(userId);
  const lower = query.toLowerCase();
  return graph.knowledge.filter((e) => {
    if (type && e.type !== type) return false;
    return (
      e.label.toLowerCase().includes(lower) ||
      JSON.stringify(e.data).toLowerCase().includes(lower)
    );
  });
}

// --- Learned Workflows ---

export function recordLearnedWorkflow(userId: string, wf: Omit<LearnedWorkflow, 'id' | 'times_used' | 'last_used'>): string {
  const graphs = readAllGraphs();
  const graph = ensureGraph(userId);
  const id = `workflow-${Date.now()}`;
  graph.learned_workflows.push({
    ...wf,
    id,
    times_used: 1,
    last_used: new Date().toISOString(),
  });
  graph.updated_at = new Date().toISOString();
  graphs[userId] = graph;
  writeAllGraphs(graphs);
  return id;
}

/**
 * Build an LLM-injectable context string from the user's memory graph.
 * Used to inject into system prompts so Jack/Julia can reference user context.
 */
export function buildMemoryContext(userId: string): string {
  const graph = getMemoryGraph(userId);
  const parts: string[] = [];

  if (graph.profile.display_name) {
    parts.push(`User name: ${graph.profile.display_name}`);
  }
  if (graph.profile.timezone) {
    parts.push(`Timezone: ${graph.profile.timezone}`);
  }

  const prefs = Object.entries(graph.profile.preferences);
  if (prefs.length > 0) {
    parts.push(`Preferences: ${prefs.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }

  if (graph.profile.relationships.length > 0) {
    const rels = graph.profile.relationships.slice(0, 10).map((r) => `${r.name} (${r.role})`);
    parts.push(`Known people: ${rels.join(', ')}`);
  }

  if (graph.profile.routines.length > 0) {
    const routines = graph.profile.routines.slice(0, 5).map((r) => `${r.label} (${r.frequency})`);
    parts.push(`Routines: ${routines.join(', ')}`);
  }

  const recentTasks = graph.task_history.slice(-5);
  if (recentTasks.length > 0) {
    const tasks = recentTasks.map((t) => `${t.description} [${t.status}]`);
    parts.push(`Recent tasks: ${tasks.join('; ')}`);
  }

  return parts.length > 0 ? `[Memory context] ${parts.join('. ')}` : '';
}
