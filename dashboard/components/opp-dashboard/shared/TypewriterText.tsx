'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  text: string;
  speed?: number;
  isCompleted?: boolean;
  isActive?: boolean;
}

export function TypewriterText({ text, speed = 15, isCompleted = false, isActive = true }: Props) {
  const [currentIndex, setCurrentIndex] = useState(isCompleted ? text.length : 0);
  const hasTyped = useRef(isCompleted);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isActive) {
      if (!isCompleted) {
        setCurrentIndex(text.length);
        hasTyped.current = true;
      }
      return;
    }

    if (isCompleted) {
      setCurrentIndex(text.length);
      hasTyped.current = true;
      return;
    }

    setCurrentIndex(0);
    hasTyped.current = false;
    let current = 0;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (current < text.length) {
        current++;
        setCurrentIndex(current);
      } else {
        hasTyped.current = true;
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, speed);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, isCompleted, text, speed]);

  const isFinished = currentIndex === text.length;

  return (
    <span className="relative">
      {text.slice(0, currentIndex)}
      {!isCompleted && !isFinished && isActive && (
        <span className="absolute -right-1 top-0 inline-block w-[2px] h-[1.1em] bg-foreground/70 animate-pulse" />
      )}
    </span>
  );
}