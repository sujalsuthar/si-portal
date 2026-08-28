import { useEffect, useState } from 'react';

export interface ChartColors {
  primary: string;
  text: string;
  muted: string;
  grid: string;
  categorical: string[];
}

function readVar(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? `rgb(${value})` : '#888888';
}

function computeColors(): ChartColors {
  return {
    primary: readVar('--color-brand-600'),
    text: readVar('--color-text'),
    muted: readVar('--color-text-muted'),
    grid: readVar('--color-border'),
    categorical: [
      readVar('--color-brand-600'),
      readVar('--color-brand-300'),
      readVar('--color-brand-800'),
      readVar('--color-brand-400'),
      readVar('--color-brand-700'),
      readVar('--color-brand-200'),
    ],
  };
}

/** Chart colors derived from the active theme's CSS variables, recomputed when the theme toggles. */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(computeColors);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(computeColors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return colors;
}
