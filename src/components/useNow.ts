import { useEffect, useState } from 'react';

/** Re-render on a short interval while `active`, and whenever the app returns to the foreground. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    document.addEventListener('visibilitychange', tick);
    const id = active ? window.setInterval(tick, 250) : undefined;
    return () => {
      document.removeEventListener('visibilitychange', tick);
      window.clearInterval(id);
    };
  }, [active]);
  return now;
}
