export const SCENE_UPDATE_SCHEDULER_VERSION = 1;

export const SCENE_UPDATE_PHASES = Object.freeze([
  'input',
  'character',
  'environment',
  'lighting',
  'shadows',
  'simulation',
  'visibility',
  'render-passes',
  'diagnostics',
]);

const PHASE_INDEX = new Map(SCENE_UPDATE_PHASES.map((phase, index) => [phase, index]));

function defaultClock() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function taskError(error, task) {
  return Object.freeze({
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : 'Error',
    phase: task.phase,
    taskId: task.id,
  });
}

function freezeFrame(frame) {
  return Object.freeze({
    ...frame,
    completedTaskIds: Object.freeze([...frame.completedTaskIds]),
    errors: Object.freeze([...frame.errors]),
    orderedTaskIds: Object.freeze([...frame.orderedTaskIds]),
    taskTimings: Object.freeze(frame.taskTimings.map((timing) => Object.freeze({ ...timing }))),
  });
}

function compareTasks(left, right) {
  return PHASE_INDEX.get(left.phase) - PHASE_INDEX.get(right.phase)
    || left.priority - right.priority
    || left.order - right.order;
}

function assertTask(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('A scene update task must be an object.');
  }
  const id = String(input.id ?? '').trim();
  if (!id) throw new TypeError('A scene update task needs a stable id.');
  const phase = input.phase ?? 'simulation';
  if (!PHASE_INDEX.has(phase)) {
    throw new TypeError(`Unknown scene update phase "${phase}".`);
  }
  if (typeof input.update !== 'function') {
    throw new TypeError(`Scene update task "${id}" needs an update function.`);
  }
  const priority = Number(input.priority ?? 0);
  if (!Number.isFinite(priority)) {
    throw new TypeError(`Scene update task "${id}" priority must be finite.`);
  }
  return { id, phase, priority, update: input.update };
}

export class SceneUpdateSchedulerError extends Error {
  constructor(task, cause, frame) {
    super(`Scene update task "${task.id}" failed in phase "${task.phase}": ${cause?.message ?? cause}`);
    this.name = 'SceneUpdateSchedulerError';
    this.cause = cause;
    this.frame = frame;
    this.phase = task.phase;
    this.taskId = task.id;
  }
}

export function createSceneUpdateScheduler({
  clock = defaultClock,
  errorMode = 'throw',
  maxFrameMs = Number.POSITIVE_INFINITY,
} = {}) {
  if (typeof clock !== 'function') throw new TypeError('Scene update scheduler clock must be a function.');
  if (!['continue', 'throw'].includes(errorMode)) {
    throw new TypeError('Scene update scheduler errorMode must be "continue" or "throw".');
  }
  let frameBudgetMs = Number(maxFrameMs);
  if (!(frameBudgetMs > 0)) {
    throw new TypeError('Scene update scheduler maxFrameMs must be greater than zero.');
  }

  const tasks = new Map();
  let disposed = false;
  let frameIndex = 0;
  let nextOrder = 0;
  let lastFrame = null;

  function assertActive(action) {
    if (disposed) throw new Error(`Cannot ${action} with a disposed scene update scheduler.`);
  }

  const api = {
    register(input) {
      assertActive('register a task');
      const validated = assertTask(input);
      if (tasks.has(validated.id)) {
        throw new Error(`Scene update task id "${validated.id}" is already registered.`);
      }
      const task = { ...validated, order: nextOrder };
      nextOrder += 1;
      tasks.set(task.id, task);
      let registrationDisposed = false;
      return Object.freeze({
        id: task.id,
        dispose() {
          if (registrationDisposed) return false;
          registrationDisposed = true;
          return tasks.delete(task.id);
        },
      });
    },

    update(context = {}) {
      assertActive('update');
      const frameStart = clock();
      const snapshot = [...tasks.values()].sort(compareTasks);
      const frame = {
        budgetMs: frameBudgetMs,
        completedTaskIds: [],
        durationMs: 0,
        errors: [],
        frameIndex,
        orderedTaskIds: snapshot.map((task) => task.id),
        overBudget: false,
        taskTimings: [],
      };
      frameIndex += 1;

      for (const task of snapshot) {
        const taskStart = clock();
        try {
          const result = task.update(Object.freeze({
            ...context,
            phase: task.phase,
            scheduler: api,
            taskId: task.id,
          }));
          if (result && typeof result.then === 'function') {
            throw new TypeError('Scene update tasks must be synchronous.');
          }
          frame.completedTaskIds.push(task.id);
        } catch (error) {
          frame.errors.push(taskError(error, task));
          const taskEnd = clock();
          frame.taskTimings.push({
            durationMs: Math.max(0, taskEnd - taskStart),
            phase: task.phase,
            taskId: task.id,
          });
          frame.durationMs = Math.max(0, taskEnd - frameStart);
          frame.overBudget = frame.durationMs > frameBudgetMs;
          if (errorMode === 'throw') {
            lastFrame = freezeFrame(frame);
            throw new SceneUpdateSchedulerError(task, error, lastFrame);
          }
          continue;
        }
        const taskEnd = clock();
        frame.taskTimings.push({
          durationMs: Math.max(0, taskEnd - taskStart),
          phase: task.phase,
          taskId: task.id,
        });
      }

      frame.durationMs = Math.max(0, clock() - frameStart);
      frame.overBudget = frame.durationMs > frameBudgetMs;
      lastFrame = freezeFrame(frame);
      return lastFrame;
    },

    dispose() {
      if (disposed) return false;
      disposed = true;
      tasks.clear();
      return true;
    },

    setFrameBudget(nextMaxFrameMs) {
      assertActive('set the frame budget');
      const next = Number(nextMaxFrameMs);
      if (!(next > 0)) throw new TypeError('Scene update scheduler maxFrameMs must be greater than zero.');
      frameBudgetMs = next;
      return api;
    },

    get frameBudgetMs() { return frameBudgetMs; },
    get disposed() { return disposed; },
    get lastFrame() { return lastFrame; },
    get size() { return tasks.size; },
  };

  return Object.freeze(api);
}
