"use client";

import { useEffect, useState } from "react";
import { useHasMounted } from "@/hooks/useHasMounted";
import {
  consumePersistResetNotice,
  persistHadReset,
} from "@/store/persistMigrate";
import { useAppStore } from "@/store/useAppStore";

const SESSION_KEY = "aislemeal:persist-reset-toast";
let shownThisRuntime = false;

export function PersistResetToast() {
  const mounted = useHasMounted();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!mounted) return;

    function maybeShow() {
      if (shownThisRuntime) {
        setShow(true);
        return;
      }
      if (!persistHadReset()) return;
      try {
        if (sessionStorage.getItem(SESSION_KEY)) return;
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* private mode */
      }
      consumePersistResetNotice();
      shownThisRuntime = true;
      setShow(true);
    }

    maybeShow();
    return useAppStore.persist.onFinishHydration(maybeShow);
  }, [mounted]);

  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(() => setShow(false), 5000);
    return () => window.clearTimeout(t);
  }, [show]);

  if (!show) return null;
  return (
    <p
      role="status"
      className="fixed inset-x-0 top-3 z-30 mx-auto max-w-md rounded-xl bg-[var(--color-text)] px-3 py-2 text-center text-sm text-white"
    >
      本地数据读不出，已重置
    </p>
  );
}
