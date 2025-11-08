"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const useRestTimer = () => {
  const [duration, setDuration] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const clear = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    timerRef.current = null;
  };

  const start = useCallback((seconds: number) => {
    clear();
    setDuration(seconds);
    setRemaining(seconds);
    setIsActive(true);
    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
          if (prev <= 1) {
            clear();
            setIsActive(false);
            return 0;
          }
          return prev - 1;
        });
    }, 1000);
  }, []);

  const stop = useCallback(() => {
    clear();
    setIsActive(false);
    setRemaining(0);
  }, []);

  useEffect(() => () => clear(), []);

  return { duration, remaining, isActive, start, stop };
};
