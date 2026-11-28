import { useEffect, useState } from 'react';
import type { SvgRigCharacter } from '../shared/svg-rig';
import { RIG_RUNNING_STAGES, type RigJob, type RigModel } from '../shared/svg-rig-job';
import * as api from './api';

/** The reference-made SVG characters, their running jobs and the models that can draw them; shared by the app and projects. */
export interface RigCharacters {
  characters: SvgRigCharacter[];
  jobs: RigJob[];
  models: RigModel[];
  addSample: () => Promise<SvgRigCharacter>;
  create: (input: api.CreateRigInput) => Promise<void>;
  job: (id: string, action: 'cancel' | 'resume' | 'discard') => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** `onMade` gets a finished character (its job just completed), so the caller can select it. */
export function useRigCharacters(onMade?: (c: SvgRigCharacter) => void): RigCharacters {
  const [characters, setCharacters] = useState<SvgRigCharacter[]>([]);
  const [jobs, setJobs] = useState<RigJob[]>([]);
  const [models, setModels] = useState<RigModel[]>([]);
  useEffect(() => {
    Promise.resolve(api.listRigCharacters()).then((l) => setCharacters(l ?? []), () => {});
    Promise.resolve(api.listRigJobs()).then((l) => setJobs(l ?? []), () => {});
    Promise.resolve(api.listRigModels()).then((l) => setModels(l ?? []), () => {});
  }, []);

  // While a job runs, ask about it every few seconds; a finished one leaves the list and joins the library.
  const running = jobs.filter((j) => RIG_RUNNING_STAGES.includes(j.stage)).map((j) => j.id).join(',');
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      for (const id of running.split(',')) {
        const job = await api.getRigJob(id).catch(() => null);
        if (!job) continue;
        if (job.stage === 'done') {
          setJobs((js) => js.filter((x) => x.id !== id));
          const list = await api.listRigCharacters();
          setCharacters(list);
          const made = list.find((c) => c.id === id);
          if (made) onMade?.(made);
        } else setJobs((js) => js.map((x) => (x.id === id ? job : x)));
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [running]);

  return {
    characters, jobs, models,
    async addSample() {
      const c = await api.addRigSample();
      setCharacters((l) => [...l.filter((x) => x.id !== c.id), c]);
      return c;
    },
    async create(input) {
      const job = await api.startRigJob(input);
      setJobs((js) => [job, ...js]);
    },
    async job(id, action) {
      if (action === 'discard') {
        await api.discardRigJob(id);
        setJobs((js) => js.filter((x) => x.id !== id));
        return;
      }
      const job = await (action === 'cancel' ? api.cancelRigJob(id) : api.resumeRigJob(id));
      setJobs((js) => js.map((x) => (x.id === id ? job : x)));
    },
    async remove(id) {
      await api.deleteRigCharacter(id);
      setCharacters((l) => l.filter((x) => x.id !== id));
    },
  };
}
