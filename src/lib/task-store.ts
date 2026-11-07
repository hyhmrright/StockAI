import type { TaskEvent } from '../../shared/types';
export interface TaskState {
  id: string;
  label: string;
  startedAt: number;
  finishedAt?: number;
  status: 'running' | 'done' | 'error' | 'cancelled';
  events: TaskEvent[];
}
let tasks: TaskState[] = [];
const listeners = new Set<() => void>();
export const taskSnapshot = () => tasks;
export const subscribeTasks = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
function publish() {
  listeners.forEach((fn) => fn());
}
export function startTask(id: string, label: string) {
  tasks = [
    { id, label, startedAt: Date.now(), status: 'running' as const, events: [] },
    ...tasks,
  ].slice(0, 30);
  publish();
}
export function taskEvent(id: string, event: TaskEvent) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, events: [...t.events, event] } : t));
  publish();
}
export function endTask(id: string, status: TaskState['status']) {
  tasks = tasks.map((t) =>
    t.id === id
      ? { ...t, status: t.status === 'cancelled' ? 'cancelled' : status, finishedAt: Date.now() }
      : t,
  );
  publish();
}
