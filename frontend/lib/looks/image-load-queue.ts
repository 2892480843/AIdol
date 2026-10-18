type Job = {
  id: string;
  signal: AbortSignal;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  cancel: () => void;
};

/** Keep background photos from competing with the active mirror and wardrobe requests. */
export function createImageLoadQueue() {
  const waiting: Job[] = [];
  let running = 0;
  let preferred: string | null = null;
  const pump = () => {
    while (running < 2 && waiting.length) {
      const index = waiting.findIndex(job => job.id === preferred);
      const [job] = waiting.splice(index < 0 ? 0 : index, 1);
      job.signal.removeEventListener("abort", job.cancel);
      if (job.signal.aborted) { job.reject(new Error("aborted")); continue; }
      running += 1;
      void job.run().then(job.resolve, job.reject).finally(() => { running -= 1; pump(); });
    }
  };
  return {
    prioritize(id: string | null) { preferred = id; },
    add<T>(id: string, signal: AbortSignal, run: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const job: Job = { id, signal, run, resolve: value => resolve(value as T), reject,
          cancel: () => {
            const index = waiting.indexOf(job);
            if (index >= 0) { waiting.splice(index, 1); reject(new Error("aborted")); }
          },
        };
        if (signal.aborted) { reject(new Error("aborted")); return; }
        signal.addEventListener("abort", job.cancel, { once: true });
        waiting.push(job);
        pump();
      });
    },
  };
}
