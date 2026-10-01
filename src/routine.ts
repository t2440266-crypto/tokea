export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: number;
  restSec: number;
}

export interface Routine {
  exercises: Exercise[];
}

export function defaultRoutine(): Routine {
  return {
    exercises: [
      { id: 'ex-squat', name: 'Goblet squat', sets: 3, reps: 12, restSec: 60 },
      { id: 'ex-press', name: 'Overhead press', sets: 3, reps: 10, restSec: 60 },
      { id: 'ex-row', name: 'Bent-over row', sets: 3, reps: 12, restSec: 60 },
      { id: 'ex-rdl', name: 'Romanian deadlift', sets: 3, reps: 10, restSec: 90 },
    ],
  };
}
