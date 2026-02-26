"use client";

import { useTranslation } from "./context";

interface TProps {
  k: string;
  vars?: Record<string, string | number>;
}

export function T({ k, vars }: TProps) {
  const { t } = useTranslation();
  return <>{t(k, vars)}</>;
}
