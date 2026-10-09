"use client";

import { CrashScreen } from "@/components/CrashScreen";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <CrashScreen error={error} retry={retry} />;
}
